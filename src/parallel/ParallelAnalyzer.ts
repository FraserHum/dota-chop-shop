/**
 * Parallel analyzer that distributes work across multiple worker threads.
 * 
 * Uses Bun's native Worker API for parallel processing of transition analysis.
 */

import { Item, StatValuation } from "../models/types";
import { BuildAnalysisResult, ScoredTransition } from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { AnalysisConfig, DEFAULT_CONFIG } from "../config/analysisConfig";
import { createLoadout, createTransition } from "../calculators/loadout";
import { combinations, countCombinations } from "../calculators/combinations";
import {
  WorkerInput,
  WorkerChunk,
  WorkerResult,
  WorkerProgress,
  SerializedScoredTransition,
  AggregatedResult,
} from "../workers/types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ParallelAnalysisOptions {
  /** Number of items in early loadout */
  earlyItemCount: number;
  /** Number of items in final loadout */
  finalItemCount: number;
  /** Maximum results to return */
  resultLimit: number;
  /** Optional stat valuation for scoring */
  statValuation?: StatValuation;
  /** Optional maximum total cost for initial build */
  initialBuildMaxCost?: number;
  /** Number of workers (defaults to CPU count) */
  workerCount?: number;
  /** Progress callback */
  onProgress?: (progress: ProgressUpdate) => void;
}

export interface ProgressUpdate {
  workerId: number;
  processed: number;
  total: number;
  valid: number;
  /** Overall progress across all workers (0-1) */
  overallProgress: number;
}

// ─────────────────────────────────────────────────────────────
// Chunk Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate all early item index combinations.
 * Returns indices into the earlyItems array.
 */
function* generateEarlyIndexCombinations(
  earlyItemCount: number,
  totalEarlyItems: number
): Generator<number[]> {
  const indices = Array.from({ length: totalEarlyItems }, (_, i) => i);
  yield* combinations(indices, earlyItemCount);
}

/**
 * Split combinations into chunks for workers.
 */
function splitIntoChunks(
  totalItems: number,
  earlyItemCount: number,
  workerCount: number
): WorkerChunk[] {
  // Generate all index combinations
  const allCombos: number[][] = [];
  for (const combo of generateEarlyIndexCombinations(earlyItemCount, totalItems)) {
    allCombos.push(combo);
  }

  const totalCombos = allCombos.length;
  const combosPerWorker = Math.ceil(totalCombos / workerCount);
  
  const chunks: WorkerChunk[] = [];
  
  for (let i = 0; i < workerCount; i++) {
    const start = i * combosPerWorker;
    const end = Math.min(start + combosPerWorker, totalCombos);
    
    if (start >= totalCombos) break;
    
    chunks.push({
      workerId: i,
      earlyItemCombinations: allCombos.slice(start, end),
      totalCombinations: estimateTotalIterations(end - start, earlyItemCount),
    });
  }
  
  return chunks;
}

/**
 * Rough estimate of total iterations per chunk.
 * Each early combo has ~40 relevant targets on average, 
 * each generates C(targets, finalCount) final combos.
 */
function estimateTotalIterations(earlyComboCount: number, earlyItemCount: number): number {
  // Based on actual measurements: ~23.8M total iterations for 2925 early combos
  // That's ~8164 iterations per early combo for trio (3→3)
  // C(40, 3) = 9880, so ~40 relevant targets is about right
  const avgTargets = 40;
  const finalItemCount = earlyItemCount; // Usually symmetric
  const finalCombosPerEarly = countCombinations(avgTargets, finalItemCount);
  return earlyComboCount * finalCombosPerEarly;
}

// ─────────────────────────────────────────────────────────────
// Result Aggregation
// ─────────────────────────────────────────────────────────────

/**
 * Merge results from all workers and return top N.
 */
function aggregateResults(
  workerResults: WorkerResult[],
  resultLimit: number
): AggregatedResult {
  // Collect all transitions from all workers
  const allTransitions: SerializedScoredTransition[] = [];
  let totalEvaluated = 0;
  let validCount = 0;
  let scoreSum = 0;
  let bestScore = 0;
  const workerTiming: { workerId: number; timeMs: number }[] = [];

  for (const result of workerResults) {
    allTransitions.push(...result.transitions);
    totalEvaluated += result.stats.totalEvaluated;
    validCount += result.stats.validCount;
    scoreSum += result.stats.scoreSum;
    bestScore = Math.max(bestScore, result.stats.bestScore);
    workerTiming.push({
      workerId: result.workerId,
      timeMs: result.stats.processingTimeMs,
    });
  }

  // Sort all transitions by score (descending) and take top N
  allTransitions.sort((a, b) => b.score - a.score);
  const topTransitions = allTransitions.slice(0, resultLimit);

  return {
    transitions: topTransitions,
    stats: {
      totalEvaluated,
      validCount,
      averageScore: validCount > 0 ? scoreSum / validCount : 0,
      bestScore,
    },
    workerTiming,
    totalTimeMs: 0, // Will be set by caller
  };
}

// ─────────────────────────────────────────────────────────────
// Deserialization
// ─────────────────────────────────────────────────────────────

/**
 * Reconstruct full ScoredTransition objects from serialized form.
 */
function deserializeTransitions(
  serialized: SerializedScoredTransition[],
  repo: ItemRepository,
  statValuation?: StatValuation
): ScoredTransition[] {
  return serialized.map(s => {
    const fromItems = s.fromItemNames.map(name => repo.getByName(name)!);
    const toItems = s.toItemNames.map(name => repo.getByName(name)!);
    
    const fromLoadout = createLoadout(fromItems, repo, statValuation);
    const toLoadout = createLoadout(toItems, repo, statValuation);
    const transition = createTransition(fromLoadout, toLoadout, repo);
    
    return {
      ...transition,
      score: s.score,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Main Parallel Analysis Function
// ─────────────────────────────────────────────────────────────

/**
 * Run transition analysis in parallel using Bun workers.
 */
export async function analyzeTransitionsParallel(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  options: ParallelAnalysisOptions,
  itemRepo?: ItemRepository
): Promise<BuildAnalysisResult> {
  const startTime = performance.now();
  
  const repo = itemRepo ?? new ItemRepository(items);
  const {
    earlyItemCount,
    finalItemCount,
    resultLimit,
    statValuation,
    initialBuildMaxCost,
    onProgress,
  } = options;

  // Determine worker count
  const cpuCount = navigator?.hardwareConcurrency ?? 4;
  const workerCount = options.workerCount ?? Math.max(1, cpuCount - 1);

  // Get early and final items
  const upgradedItems = repo.getAllUpgradedItems();
  
  const earlyItems = upgradedItems.filter(item => {
    if (item.cost > config.thresholds.earlyGameMaxCost) {
      return false;
    }
    
    const baseComponents = repo.getBaseComponents(item);
    const recipeCost = repo.getRecipeCost(item);
    
    let usableComponentsGold = 0;
    for (const comp of baseComponents) {
      const compItem = repo.getByName(comp);
      if (!compItem) continue;
      const upgradeTargets = repo.findAllUpgradeTargets(comp, [item.name]);
      if (upgradeTargets.length > 0) {
        usableComponentsGold += compItem.cost;
      }
    }
    
    const totalRecovered = usableComponentsGold + recipeCost;
    const goldEfficiency = totalRecovered / item.cost;
    return goldEfficiency >= config.thresholds.minGoldRecovery;
  });

  const finalItemCandidates = upgradedItems;

  // If not enough items for parallel processing, fall back to single-threaded
  if (earlyItems.length < 10 || countCombinations(earlyItems.length, earlyItemCount) < 100) {
    // Import and use single-threaded version
    const { analyzeValidTransitions } = await import("../calculators/buildAnalysis");
    return analyzeValidTransitions(items, config, {
      earlyItemCount,
      finalItemCount,
      resultLimit,
      statValuation,
      initialBuildMaxCost,
    }, repo);
  }

  // Create item index mappings
  const itemIndexMap = new Map<string, number>();
  items.forEach((item, index) => {
    itemIndexMap.set(item.name, index);
  });

  const earlyItemIndices = earlyItems.map(item => itemIndexMap.get(item.name)!);
  const finalItemIndices = finalItemCandidates.map(item => itemIndexMap.get(item.name)!);

  // Split work into chunks
  const chunks = splitIntoChunks(earlyItems.length, earlyItemCount, workerCount);
  
  // Track progress
  const progressState = new Map<number, { processed: number; total: number; valid: number }>();
  const totalEstimated = chunks.reduce((sum, c) => sum + c.totalCombinations, 0);

  // Create workers and run analysis
  const workerPromises: Promise<WorkerResult>[] = [];
  const workers: Worker[] = [];

  for (const chunk of chunks) {
    const workerInput: WorkerInput = {
      allItems: items,
      earlyItemIndices,
      finalItemIndices,
      config,
      earlyItemCount,
      finalItemCount,
      resultLimit: Math.ceil(resultLimit * 2), // Get more per worker, filter later
      statValuation,
      initialBuildMaxCost,
      chunk,
    };

    const promise = new Promise<WorkerResult>((resolve, reject) => {
      const workerUrl = new URL("../workers/transitionWorker.ts", import.meta.url);
      const worker = new Worker(workerUrl.href);
      workers.push(worker);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        
        if (data.type === "progress") {
          const progress = data as WorkerProgress;
          progressState.set(progress.workerId, {
            processed: progress.processed,
            total: progress.total,
            valid: progress.valid,
          });
          
          if (onProgress) {
            let totalProcessed = 0;
            for (const p of progressState.values()) {
              totalProcessed += p.processed;
            }
            onProgress({
              ...progress,
              overallProgress: totalProcessed / totalEstimated,
            });
          }
        } else if (data.type === "result") {
          resolve(data as WorkerResult);
          worker.terminate();
        } else if (data.type === "error") {
          reject(new Error(data.error));
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        reject(error);
        worker.terminate();
      };

      worker.postMessage(workerInput);
    });

    workerPromises.push(promise);
  }

  try {
    // Wait for all workers to complete
    const workerResults = await Promise.all(workerPromises);
    
    // Aggregate results
    const aggregated = aggregateResults(workerResults, resultLimit);
    aggregated.totalTimeMs = performance.now() - startTime;

    // Deserialize transitions back to full objects
    const transitions = deserializeTransitions(
      aggregated.transitions,
      repo,
      statValuation
    );

    return {
      transitions,
      stats: aggregated.stats,
    };
  } finally {
    // Ensure all workers are terminated
    for (const worker of workers) {
      try {
        worker.terminate();
      } catch {
        // Ignore termination errors
      }
    }
  }
}

/**
 * Get the number of available CPU cores.
 */
export function getAvailableCores(): number {
  return navigator?.hardwareConcurrency ?? 4;
}
