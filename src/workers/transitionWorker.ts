/**
 * Transition analysis worker for parallel processing.
 * 
 * This worker processes a chunk of early item combinations,
 * evaluates transitions, and returns the top results.
 * 
 * Uses Bun's native Worker API.
 */

/// <reference lib="webworker" />

import { Item, StatValuation } from "../models/types";
import { ScoredTransition, Loadout } from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { createLoadout, createTransition } from "../calculators/loadout";
import {
  costIncreaseConstraint,
  allConstraints,
  maxFinalItems,
  noDuplicateBoots,
} from "../calculators/constraints";
import { defaultTransitionScorer, createImprovedScorer } from "../calculators/scorers";
import { combinations, noDuplicateBoots as noDuplicateBootsItemFilter, maxTotalCost, combineFilters } from "../calculators/combinations";
import {
  WorkerInput,
  WorkerResult,
  WorkerProgress,
  SerializedScoredTransition,
  serializeTransition,
} from "./types";

// Worker globals
declare function postMessage(message: unknown): void;
declare const self: {
  onmessage: ((event: { data: WorkerInput }) => void) | null;
};

// ─────────────────────────────────────────────────────────────
// Bounded Priority Queue (copied from buildAnalysis for isolation)
// ─────────────────────────────────────────────────────────────

class BoundedPriorityQueue<T> {
  private items: T[] = [];

  constructor(
    private maxSize: number,
    private compare: (a: T, b: T) => number
  ) {}

  add(item: T): boolean {
    if (this.items.length < this.maxSize) {
      this.insertSorted(item);
      return true;
    }

    const worst = this.items[this.items.length - 1];
    if (this.compare(item, worst) < 0) {
      this.items.pop();
      this.insertSorted(item);
      return true;
    }

    return false;
  }

  private insertSorted(item: T): void {
    let low = 0;
    let high = this.items.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.compare(item, this.items[mid]) < 0) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    this.items.splice(low, 0, item);
  }

  toArray(): T[] {
    return [...this.items];
  }
}

// ─────────────────────────────────────────────────────────────
// Loadout Cache (simplified version for worker)
// ─────────────────────────────────────────────────────────────

class LoadoutCache {
  private cache = new Map<string, Loadout>();

  constructor(
    private repo: ItemRepository,
    private statValuation?: StatValuation,
    private maxSize: number = 10000
  ) {}

  getOrCreate(items: readonly Item[]): Loadout {
    const key = items.map(i => i.name).sort().join(",");
    let loadout = this.cache.get(key);
    if (!loadout) {
      loadout = createLoadout([...items], this.repo, this.statValuation);
      this.cache.set(key, loadout);

      if (this.cache.size > this.maxSize) {
        const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
        const keysToDelete = Array.from(this.cache.keys()).slice(0, evictCount);
        for (const k of keysToDelete) {
          this.cache.delete(k);
        }
      }
    }
    return loadout;
  }
}

// ─────────────────────────────────────────────────────────────
// Quick Reuse Check
// ─────────────────────────────────────────────────────────────

function quickReuseRatio(from: Loadout, to: Loadout): number {
  if (from.totalCost === 0) return 0;

  let reusedCount = 0;
  const toComponentCounts = to.componentCounts;

  for (const comp of Object.keys(from.componentCounts)) {
    const fromCount = from.componentCounts[comp];
    const toCount = toComponentCounts[comp] ?? 0;
    reusedCount += Math.min(fromCount, toCount);
  }

  return reusedCount / from.components.length;
}

// ─────────────────────────────────────────────────────────────
// Find Relevant Targets
// ─────────────────────────────────────────────────────────────

function findRelevantTargets(
  fromLoadout: Loadout,
  allUpgraded: Item[],
  repo: ItemRepository
): Item[] {
  const componentSet = new Set(fromLoadout.components);

  return allUpgraded.filter((item) => {
    const itemComponents = repo.getBaseComponents(item);
    return itemComponents.some((c) => componentSet.has(c));
  });
}

// ─────────────────────────────────────────────────────────────
// Worker Main Logic
// ─────────────────────────────────────────────────────────────

function processChunk(input: WorkerInput): WorkerResult {
  const startTime = performance.now();
  
  const {
    allItems,
    earlyItemIndices,
    finalItemIndices,
    config,
    earlyItemCount,
    finalItemCount,
    resultLimit,
    statValuation,
    initialBuildMaxCost,
    chunk,
  } = input;

  // Reconstruct ItemRepository from serialized items
  const repo = new ItemRepository(allItems);
  
  // Get actual item arrays from indices
  const earlyItems = earlyItemIndices.map(i => allItems[i]);
  const finalItemCandidates = finalItemIndices.map(i => allItems[i]);

  // Initialize components
  const loadoutCache = new LoadoutCache(repo, statValuation);
  const topResults = new BoundedPriorityQueue<ScoredTransition>(
    resultLimit,
    (a, b) => b.score - a.score
  );

  // Create constraint and scorer
  const constraint = allConstraints(
    costIncreaseConstraint,
    maxFinalItems(6),
    noDuplicateBoots(config)
  );

  const scorer = statValuation
    ? createImprovedScorer(statValuation)
    : defaultTransitionScorer;

  // For trio+ analysis, use aggressive early pruning
  const useEarlyPruning = earlyItemCount >= 3 || finalItemCount >= 3;
  const MIN_REUSE_FOR_PRUNING = useEarlyPruning ? 0.4 : 0.0;

  // Item filter for combinations:
  // 1. No duplicate boots
  // 2. Optional max total cost for initial build
  const baseFilter = noDuplicateBootsItemFilter(config);
  const earlyItemFilter = initialBuildMaxCost !== undefined
    ? combineFilters(baseFilter, maxTotalCost(initialBuildMaxCost))
    : baseFilter;

  // Memoize relevant targets per unique component set
  const relevantTargetsCache = new Map<string, Item[]>();

  // Stats tracking
  let totalEvaluated = 0;
  let validCount = 0;
  let scoreSum = 0;
  let prunedCount = 0;

  // Progress tracking
  const progressInterval = 1000; // Report every 1000 combinations
  let lastProgressReport = 0;

  // Process each early combination in our chunk
  for (const earlyIndices of chunk.earlyItemCombinations) {
    const earlyCombo = earlyIndices.map(i => earlyItems[i]);
    
    // Check item filter (no duplicate boots)
    if (!earlyItemFilter(earlyCombo)) continue;

    const fromLoadout = loadoutCache.getOrCreate(earlyCombo);

    // Get or compute relevant targets
    const componentKey = [...fromLoadout.components].sort().join(",");
    let relevantTargets = relevantTargetsCache.get(componentKey);
    if (!relevantTargets) {
      relevantTargets = findRelevantTargets(fromLoadout, finalItemCandidates, repo);
      relevantTargetsCache.set(componentKey, relevantTargets);
    }

    // Skip if not enough relevant targets
    if (relevantTargets.length < finalItemCount) continue;

    // Generate final loadout combinations
    for (const toItems of combinations(relevantTargets, finalItemCount)) {
      totalEvaluated++;

      const toLoadout = loadoutCache.getOrCreate(toItems);

      // Early pruning
      if (MIN_REUSE_FOR_PRUNING > 0) {
        const quickReuse = quickReuseRatio(fromLoadout, toLoadout);
        if (quickReuse < MIN_REUSE_FOR_PRUNING) {
          prunedCount++;
          continue;
        }
      }

      // Create and evaluate transition
      const transition = createTransition(fromLoadout, toLoadout, repo);

      if (constraint(transition)) {
        const score = scorer(transition);
        validCount++;
        scoreSum += score;

        topResults.add({
          ...transition,
          score,
        });
      }
    }

    // Report progress periodically
    if (totalEvaluated - lastProgressReport >= progressInterval) {
      lastProgressReport = totalEvaluated;
      const progress: WorkerProgress = {
        type: "progress",
        workerId: chunk.workerId,
        processed: totalEvaluated,
        total: chunk.totalCombinations,
        valid: validCount,
      };
      postMessage(progress);
    }
  }

  const processingTimeMs = performance.now() - startTime;

  // Serialize results
  const serializedTransitions: SerializedScoredTransition[] = topResults
    .toArray()
    .map(serializeTransition);

  return {
    workerId: chunk.workerId,
    transitions: serializedTransitions,
    stats: {
      totalEvaluated,
      validCount,
      scoreSum,
      bestScore: serializedTransitions.length > 0 ? serializedTransitions[0].score : 0,
      prunedCount,
      processingTimeMs,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Worker Message Handler
// ─────────────────────────────────────────────────────────────

self.onmessage = (event: { data: WorkerInput }) => {
  try {
    const result = processChunk(event.data);
    postMessage({ type: "result", ...result });
  } catch (error) {
    postMessage({
      type: "error",
      workerId: event.data.chunk.workerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
