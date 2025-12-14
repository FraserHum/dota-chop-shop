/**
 * Types for parallel worker communication.
 * 
 * These types must be serializable (no class instances, functions, or circular refs)
 * since they're passed between the main thread and worker threads via structured clone.
 */

import { Item, StatValuation } from "../models/types";
import { AnalysisConfig } from "../config/analysisConfig";
import { ScoredTransition, BuildAnalysisStats } from "../models/buildTypes";

// ─────────────────────────────────────────────────────────────
// Worker Input Types
// ─────────────────────────────────────────────────────────────

/**
 * A chunk of work for a worker to process.
 * Contains item indices rather than Item objects to minimize serialization.
 */
export interface WorkerChunk {
  /** Worker ID for progress tracking */
  workerId: number;
  
  /** 
   * Early item index combinations to evaluate.
   * Each inner array is an array of indices into the earlyItems array.
   */
  earlyItemCombinations: number[][];
  
  /** Total combinations in this chunk (for progress reporting) */
  totalCombinations: number;
}

/**
 * Input data sent to each worker at initialization.
 */
export interface WorkerInput {
  /** All items (serializable plain objects) */
  allItems: Item[];
  
  /** Indices of items that are valid early game items */
  earlyItemIndices: number[];
  
  /** Indices of items that are valid final game items */
  finalItemIndices: number[];
  
  /** Analysis configuration */
  config: AnalysisConfig;
  
  /** Number of items in early loadout */
  earlyItemCount: number;
  
  /** Number of items in final loadout */
  finalItemCount: number;
  
  /** Maximum results to keep per worker */
  resultLimit: number;
  
  /** Optional stat valuation for scoring */
  statValuation?: StatValuation;
  
  /** Optional maximum total cost for initial build */
  initialBuildMaxCost?: number;
  
  /** The chunk of work for this worker */
  chunk: WorkerChunk;
}

// ─────────────────────────────────────────────────────────────
// Worker Output Types
// ─────────────────────────────────────────────────────────────

/**
 * Progress update sent from worker to main thread.
 */
export interface WorkerProgress {
  type: "progress";
  workerId: number;
  processed: number;
  total: number;
  valid: number;
}

/**
 * Result from a single worker.
 */
export interface WorkerResult {
  /** Worker ID */
  workerId: number;
  
  /** Top transitions found by this worker */
  transitions: SerializedScoredTransition[];
  
  /** Statistics from this worker's chunk */
  stats: WorkerStats;
}

/**
 * Statistics from a worker's processing.
 */
export interface WorkerStats {
  /** Total combinations evaluated */
  totalEvaluated: number;
  
  /** Number of valid transitions found */
  validCount: number;
  
  /** Sum of scores (for computing average) */
  scoreSum: number;
  
  /** Best score in this chunk */
  bestScore: number;
  
  /** Combinations pruned by early filtering */
  prunedCount: number;
  
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

// ─────────────────────────────────────────────────────────────
// Serialization Types
// ─────────────────────────────────────────────────────────────

/**
 * Serialized version of ScoredTransition.
 * Uses item names instead of Item references for serialization.
 */
export interface SerializedScoredTransition {
  /** Names of items in the from loadout */
  fromItemNames: string[];
  
  /** Names of items in the to loadout */
  toItemNames: string[];
  
  /** Cost delta */
  costDelta: number;
  
  /** Transition score */
  score: number;
  
  /** Component flow summary */
  componentFlow: {
    reusedGold: number;
    wastedGold: number;
    acquiredGold: number;
    netRecipeCost: number;
    totalGoldNeeded: number;
  };
  
  /** From loadout stats */
  fromStats: {
    totalCost: number;
    totalStatValue: number;
    efficiency: number;
  };
  
  /** To loadout stats */
  toStats: {
    totalCost: number;
    totalStatValue: number;
    efficiency: number;
  };
}

/**
 * Convert a ScoredTransition to serializable form.
 */
export function serializeTransition(t: ScoredTransition): SerializedScoredTransition {
  return {
    fromItemNames: t.from.items.map(i => i.name),
    toItemNames: t.to.items.map(i => i.name),
    costDelta: t.costDelta,
    score: t.score,
    componentFlow: {
      reusedGold: t.componentFlow.reusedGold,
      wastedGold: t.componentFlow.wastedGold,
      acquiredGold: t.componentFlow.acquiredGold,
      netRecipeCost: t.componentFlow.netRecipeCost,
      totalGoldNeeded: t.componentFlow.totalGoldNeeded,
    },
    fromStats: {
      totalCost: t.from.totalCost,
      totalStatValue: t.from.totalStatValue,
      efficiency: t.from.efficiency,
    },
    toStats: {
      totalCost: t.to.totalCost,
      totalStatValue: t.to.totalStatValue,
      efficiency: t.to.efficiency,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Aggregation Types
// ─────────────────────────────────────────────────────────────

/**
 * Aggregated result from all workers.
 */
export interface AggregatedResult {
  /** Top transitions across all workers */
  transitions: SerializedScoredTransition[];
  
  /** Combined statistics */
  stats: BuildAnalysisStats;
  
  /** Per-worker timing for diagnostics */
  workerTiming: { workerId: number; timeMs: number }[];
  
  /** Total wall-clock time */
  totalTimeMs: number;
}

// ─────────────────────────────────────────────────────────────
// Progression Worker Types
// ─────────────────────────────────────────────────────────────

import {
  StageDefinition,
  BuildSequence,
  BuildProgressionStats,
  ProgressionPhase,
} from "../models/buildTypes";

/**
 * Input for the progression analysis worker.
 */
export interface ProgressionWorkerInput {
  /** All items (serializable plain objects) */
  allItems: Item[];

  /** Analysis configuration */
  config: AnalysisConfig;

  /** Stage definitions */
  stages: StageDefinition[];

  /** Default item count per stage */
  defaultItemCount: number;

  /** Maximum results to return */
  resultLimit: number;

  /** Beam width for search */
  beamWidth: number;

  /** Minimum total gold recovery ratio */
  minTotalRecovery: number;

  /** Optional stat valuation for scoring */
  statValuation?: StatValuation;

  /** Aura multiplier for team-wide benefit */
  auraMultiplier: number;

  /** Target coverage weight */
  targetCoverageWeight: number;

  /** Inventory slots */
  inventorySlots?: number;

  /** Backpack slots */
  backpackSlots?: number;
}

/**
 * Progress update from progression worker.
 */
export interface ProgressionWorkerProgress {
  type: "progress";
  phase: ProgressionPhase;
  stageIndex?: number;
  totalStages: number;
  evaluated?: number;
  valid?: number;
  sequenceIndex?: number;
  totalSequences?: number;
  elapsedMs: number;
  message: string;
}

/**
 * Serialized build sequence for worker communication.
 */
export interface SerializedBuildSequence {
  /** Item names per stage (inventory items) */
  stageItems: string[][];
  /** Total score */
  totalScore: number;
  /** Per-stage scores */
  stageScores: number[];
  /** Per-stage cost thresholds */
  stageThresholds: number[];
  /** Per-stage stat values */
  stageStatValues: number[];
}

/**
 * Result from progression worker.
 */
export interface ProgressionWorkerResult {
  type: "result";
  /** Top sequences found */
  sequences: SerializedBuildSequence[];
  /** Resolved target item names by stage index */
  resolvedTargets: [number, string[]][];
  /** Unresolved target names by stage index */
  unresolvedTargets: [number, string[]][];
  /** Statistics */
  stats: BuildProgressionStats;
}

/**
 * Error from progression worker.
 */
export interface ProgressionWorkerError {
  type: "error";
  error: string;
}

/**
 * All message types from progression worker.
 */
export type ProgressionWorkerMessage =
  | ProgressionWorkerProgress
  | ProgressionWorkerResult
  | ProgressionWorkerError;

/**
 * Serialize a BuildSequence for worker communication.
 */
export function serializeBuildSequence(seq: BuildSequence): SerializedBuildSequence {
  return {
    stageItems: seq.stages.map((stage) =>
      stage.loadout.inventory.map((item) => item.name)
    ),
    totalScore: seq.totalScore,
    stageScores: [...seq.stageScores],
    stageThresholds: seq.stages.map((stage) => stage.costThreshold),
    stageStatValues: seq.stages.map((stage) => stage.loadout.totalStatValue),
  };
}
