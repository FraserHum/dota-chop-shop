/**
 * Build-level analysis for loadout transitions.
 *
 * This module provides the main entry points for analyzing
 * valid build transitions using the functional pipeline approach.
 */

import { Item, StatValuation } from "../models/types";
import {
  Loadout,
  LoadoutTransition,
  ScoredTransition,
  BuildAnalysisResult,
  BuildAnalysisOptions,
  TransitionConstraint,
  TransitionValidation,
} from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { AnalysisConfig, DEFAULT_CONFIG } from "../config/analysisConfig";
import { createLoadout, createTransition } from "./loadout";
import {
  costIncreaseConstraint,
  allConstraints,
  maxFinalItems,
  noDuplicateBoots,
  minComponentReuse,
  withExplanation,
  allExplainedConstraints,
} from "./constraints";
import { defaultTransitionScorer, createImprovedScorer } from "./scorers";
import { combinations, filteredCombinations, noDuplicateBoots as noDuplicateBootsItemFilter, maxTotalCost, combineFilters } from "./combinations";

// ─────────────────────────────────────────────────────────────
// Memoization Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Create a cache key from item names (sorted for consistency).
 */
function itemsToKey(items: readonly Item[]): string {
  return items.map(i => i.name).sort().join(",");
}

/**
 * Memoized loadout factory.
 * Caches loadouts by their item composition with optional size limit.
 */
class LoadoutCache {
  private cache = new Map<string, Loadout>();
  private maxSize: number;

  constructor(
    private repo: ItemRepository, 
    private statValuation?: StatValuation,
    maxSize: number = 10000
  ) {
    this.maxSize = maxSize;
  }

  getOrCreate(items: readonly Item[]): Loadout {
    const key = itemsToKey(items);
    let loadout = this.cache.get(key);
    if (!loadout) {
      loadout = createLoadout([...items], this.repo, this.statValuation);
      this.cache.set(key, loadout);
      
      // Evict oldest entries if cache is too large (after insert)
      if (this.cache.size > this.maxSize) {
        // Simple eviction: delete first 10% of entries (minimum 1)
        const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
        const keysToDelete = Array.from(this.cache.keys()).slice(0, evictCount);
        for (const k of keysToDelete) {
          this.cache.delete(k);
        }
      }
    }
    return loadout;
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Quick component overlap check without full transition analysis.
 * Returns the approximate reuse ratio (0-1) based on component counts.
 * Used for early pruning before creating full transition objects.
 */
function quickReuseRatio(from: Loadout, to: Loadout): number {
  if (from.totalCost === 0) return 0;
  
  let reusedCount = 0;
  const toComponentCounts = to.componentCounts;
  
  for (const comp of Object.keys(from.componentCounts)) {
    const fromCount = from.componentCounts[comp];
    const toCount = toComponentCounts[comp] ?? 0;
    reusedCount += Math.min(fromCount, toCount);
  }
  
  // Rough estimate: reused components / total early components
  return reusedCount / from.components.length;
}

/**
 * Bounded priority queue that keeps only the top N items.
 * Uses a simple sorted insertion with O(n) insert but avoids
 * storing millions of items in memory.
 */
class BoundedPriorityQueue<T> {
  private items: T[] = [];

  constructor(
    private maxSize: number,
    private compare: (a: T, b: T) => number
  ) {}

  /**
   * Add an item. If at capacity, only adds if better than worst item.
   * Returns true if item was added.
   */
  add(item: T): boolean {
    if (this.items.length < this.maxSize) {
      this.insertSorted(item);
      return true;
    }

    // Check if better than worst (last) item
    const worst = this.items[this.items.length - 1];
    if (this.compare(item, worst) < 0) {
      // Item is better, remove worst and insert
      this.items.pop();
      this.insertSorted(item);
      return true;
    }

    return false;
  }

  private insertSorted(item: T): void {
    // Binary search for insertion point
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

  /**
   * Get the minimum score needed to enter the queue.
   * Returns -Infinity if queue isn't full yet.
   */
  getThreshold(): number {
    if (this.items.length < this.maxSize) return -Infinity;
    const worst = this.items[this.items.length - 1] as any;
    return worst?.score ?? -Infinity;
  }

  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }
}

// ─────────────────────────────────────────────────────────────
// Main Analysis Functions
// ─────────────────────────────────────────────────────────────

/**
 * Find valid build transitions from early items to upgraded items.
 *
 * This is the main entry point for build-level validation.
 * It generates combinations of early items and target items,
 * validates them against constraints, scores them, and returns
 * the best transitions.
 *
 * Uses memoization and bounded priority queue for memory efficiency.
 *
 * @param items - All available items
 * @param config - Analysis configuration
 * @param options - Analysis options (counts, limits, custom constraint/scorer)
 * @param itemRepo - Optional pre-built ItemRepository
 * @returns Analysis result with valid transitions and stats
 *
 * @example
 * ```ts
 * const result = analyzeValidTransitions(items, config, {
 *   earlyItemCount: 2,
 *   finalItemCount: 2,
 *   resultLimit: 10,
 * });
 *
 * for (const t of result.transitions) {
 *   console.log(`${t.from.items.map(i => i.name)} -> ${t.to.items.map(i => i.name)}`);
 *   console.log(`  Score: ${t.score}, Delta: ${t.costDelta}g`);
 * }
 * ```
 */
export function analyzeValidTransitions(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  options: BuildAnalysisOptions = {},
  itemRepo?: ItemRepository
): BuildAnalysisResult {
  const repo = itemRepo ?? new ItemRepository(items);

  const {
    earlyItemCount = 2,
    finalItemCount = 2,
    resultLimit = 20,
    statValuation,
    initialBuildMaxCost,
    constraint = allConstraints(
      costIncreaseConstraint,
      maxFinalItems(6), // Inventory slot limit
      noDuplicateBoots(config)
    ),
  } = options;

  // Use improved scorer if statValuation is provided, otherwise use default
  const scorer = options.scorer ?? (
    statValuation 
      ? createImprovedScorer(statValuation)
      : defaultTransitionScorer
  );

  // Initialize loadout cache only - transitions are not cached to save memory
  // Pass statValuation for efficiency calculations
  const loadoutCache = new LoadoutCache(repo, statValuation);

  // Use bounded priority queue to keep only top results (memory efficient)
  const topResults = new BoundedPriorityQueue<ScoredTransition>(
    resultLimit,
    (a, b) => b.score - a.score // Higher score = better = should come first
  );

  // Get all upgraded items (items with components - not raw components)
  // Both early and final items must be upgraded items, not raw components
  const upgradedItems = repo.getAllUpgradedItems();
  
  // For early items, we filter by:
  // 1. Max cost threshold (earlyGameMaxCost) - items above this are too expensive to disassemble early
  // 2. Gold recovery threshold - items with poor recovery aren't good disassemble candidates
  const earlyItems = upgradedItems.filter(item => {
    // Cost filter - only items within early game budget
    if (item.cost > config.thresholds.earlyGameMaxCost) {
      return false;
    }
    
    // Gold recovery check - we need items whose components can be reused
    const baseComponents = repo.getBaseComponents(item);
    const recipeCost = repo.getRecipeCost(item);
    
    // Calculate usable component gold (components that build into other items)
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

  // For final items, use all upgraded items (no cost filter, but must be upgraded)
  // This ensures we're only looking at items that have components (not raw components)
  const finalItemCandidates = upgradedItems;

  // Memoize relevant targets per unique component set
  const relevantTargetsCache = new Map<string, Item[]>();

  // Evaluate transitions
  let totalEvaluated = 0;
  let validCount = 0;
  let scoreSum = 0;
  let prunedCount = 0;

  // For trio+ analysis, use aggressive early pruning
  // Skip transitions with low component reuse since they won't score well
  const useEarlyPruning = earlyItemCount >= 3 || finalItemCount >= 3;
  const MIN_REUSE_FOR_PRUNING = useEarlyPruning ? 0.4 : 0.0; // 40% minimum for trios

  // Generate early loadout combinations with filters:
  // 1. No duplicate boots (movement speed doesn't stack)
  // 2. Optional max total cost for initial build
  const baseFilter = noDuplicateBootsItemFilter(config);
  const earlyItemFilter = initialBuildMaxCost !== undefined
    ? combineFilters(baseFilter, maxTotalCost(initialBuildMaxCost))
    : baseFilter;

  for (const earlyCombo of filteredCombinations(earlyItems, earlyItemCount, earlyItemFilter)) {
    const fromLoadout = loadoutCache.getOrCreate(earlyCombo);

    // Get or compute relevant targets for this loadout's components
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

      // Early pruning: skip low-reuse combinations (they won't score well anyway)
      if (MIN_REUSE_FOR_PRUNING > 0) {
        const quickReuse = quickReuseRatio(fromLoadout, toLoadout);
        if (quickReuse < MIN_REUSE_FOR_PRUNING) {
          prunedCount++;
          continue;
        }
      }

      // Create transition directly (no caching to save memory)
      const transition = createTransition(fromLoadout, toLoadout, repo);

      // Check constraints
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
  }

  // Get sorted results from the bounded queue
  const sortedResults = topResults.toArray();

  // Calculate stats
  const averageScore = validCount > 0 ? scoreSum / validCount : 0;
  const bestScore = sortedResults.length > 0 ? sortedResults[0].score : 0;

  return {
    transitions: sortedResults,
    stats: {
      totalEvaluated,
      validCount,
      averageScore,
      bestScore,
    },
  };
}

/**
 * Find upgrade targets that use at least one component from the loadout.
 *
 * This filters the target item pool to only include items that share
 * components with the early loadout, making the combination generation
 * more efficient.
 */
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
// Convenience Analysis Functions
// ─────────────────────────────────────────────────────────────

/**
 * Analyze pair transitions (2 early → 2 final).
 *
 * Common case for analyzing item pairs.
 * 
 * @param items - All available items
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @param statValuation - Optional stat valuations for improved scoring
 */
export function analyzePairTransitions(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository,
  statValuation?: StatValuation,
  initialBuildMaxCost?: number
): BuildAnalysisResult {
  return analyzeValidTransitions(
    items,
    config,
    {
      earlyItemCount: 2,
      finalItemCount: 2,
      resultLimit: 20,
      statValuation,
      initialBuildMaxCost,
    },
    itemRepo
  );
}

/**
 * Analyze trio transitions (3 early → 3 final).
 *
 * For analyzing larger loadout transitions.
 * 
 * @param items - All available items
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @param statValuation - Optional stat valuations for improved scoring
 * @param initialBuildMaxCost - Optional max total cost for initial build
 */
export function analyzeTrioTransitions(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository,
  statValuation?: StatValuation,
  initialBuildMaxCost?: number
): BuildAnalysisResult {
  return analyzeValidTransitions(
    items,
    config,
    {
      earlyItemCount: 3,
      finalItemCount: 3,
      resultLimit: 50, // More combinations = more results
      statValuation,
      initialBuildMaxCost,
    },
    itemRepo
  );
}

/**
 * Analyze trio transitions in parallel using Bun workers.
 *
 * Significantly faster than single-threaded analysis for trio+.
 * Uses all available CPU cores for parallel processing.
 * 
 * @param items - All available items
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @param statValuation - Optional stat valuations for improved scoring
 * @param onProgress - Optional progress callback
 * @param initialBuildMaxCost - Optional max total cost for initial build
 * @returns Promise resolving to analysis result
 */
export async function analyzeTrioTransitionsParallel(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository,
  statValuation?: StatValuation,
  onProgress?: (progress: { overallProgress: number; valid: number }) => void,
  initialBuildMaxCost?: number
): Promise<BuildAnalysisResult> {
  const { analyzeTransitionsParallel } = await import("../parallel/ParallelAnalyzer");
  
  return analyzeTransitionsParallel(items, config, {
    earlyItemCount: 3,
    finalItemCount: 3,
    resultLimit: 50,
    statValuation,
    initialBuildMaxCost,
    onProgress: onProgress ? (p) => onProgress({ overallProgress: p.overallProgress, valid: p.valid }) : undefined,
  }, itemRepo);
}

/**
 * Analyze asymmetric transitions (N early → M final).
 *
 * Useful for consolidation (many early → few late) or
 * expansion (few early → many late) strategies.
 */
export function analyzeAsymmetricTransitions(
  items: Item[],
  earlyCount: number,
  finalCount: number,
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): BuildAnalysisResult {
  return analyzeValidTransitions(
    items,
    config,
    {
      earlyItemCount: earlyCount,
      finalItemCount: finalCount,
      resultLimit: 30,
    },
    itemRepo
  );
}

// ─────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────

/**
 * Validate a specific transition between item sets.
 *
 * Use this to check if a particular early → final transition is valid.
 *
 * @param fromItems - Early game items
 * @param toItems - Target items
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @returns Validation result with reasons for any failures
 *
 * @example
 * ```ts
 * const validation = validateTransition(
 *   [tranquilBoots, pavise],
 *   [arcaneBoots, forceStaff],
 *   config
 * );
 *
 * if (validation.valid) {
 *   console.log('Valid transition!');
 * } else {
 *   console.log('Invalid:', validation.reasons.join(', '));
 * }
 * ```
 */
export function validateTransition(
  fromItems: Item[],
  toItems: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): TransitionValidation {
  // IMPORTANT: The repo must include component items for gold value lookups.
  // If no repo is provided, we can only use the items given (limited functionality).
  // For full functionality, callers should pass an ItemRepository with all items.
  const repo = itemRepo ?? new ItemRepository([...fromItems, ...toItems]);

  const fromLoadout = createLoadout(fromItems, repo);
  const toLoadout = createLoadout(toItems, repo);
  const transition = createTransition(fromLoadout, toLoadout, repo);

  // Build explained constraints
  const explainedConstraints = allExplainedConstraints(
    withExplanation(
      costIncreaseConstraint,
      (t) =>
        `Final cost (${t.to.totalCost}g) must exceed initial cost (${t.from.totalCost}g)`
    ),
    withExplanation(
      noDuplicateBoots(config),
      () => "Cannot have multiple boots (movement speed doesn't stack)"
    )
  );

  const result = explainedConstraints(transition);

  return {
    valid: result.satisfied,
    transition,
    reasons: result.reasons,
  };
}

/**
 * Check if a transition meets minimum component reuse.
 *
 * @param transition - Transition to check
 * @param minPercent - Minimum reuse percentage (0-1)
 * @returns True if reuse meets threshold
 */
export function meetsReuseThreshold(
  transition: LoadoutTransition,
  minPercent: number
): boolean {
  return minComponentReuse(minPercent)(transition);
}

// ─────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────

/**
 * Find transitions that include a specific final item.
 *
 * Useful for answering "what early items should I buy to build X?"
 *
 * @param items - All available items
 * @param targetItemName - Name of the desired final item
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @returns Transitions that include the target item
 */
export function findTransitionsToItem(
  items: Item[],
  targetItemName: string,
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): BuildAnalysisResult {
  const repo = itemRepo ?? new ItemRepository(items);
  const targetItem = repo.getByName(targetItemName) ?? repo.getByDisplayName(targetItemName);

  if (!targetItem) {
    return {
      transitions: [],
      stats: { totalEvaluated: 0, validCount: 0, averageScore: 0, bestScore: 0 },
    };
  }

  // Custom constraint: final must include target item
  const mustIncludeTarget: TransitionConstraint = (t) =>
    t.to.items.some((i) => i.name === targetItem.name);

  return analyzeValidTransitions(
    items,
    config,
    {
      earlyItemCount: 2,
      finalItemCount: 2,
      resultLimit: 20,
      constraint: allConstraints(
        costIncreaseConstraint,
        maxFinalItems(6),
        noDuplicateBoots(config),
        mustIncludeTarget
      ),
    },
    repo
  );
}

/**
 * Find transitions starting from a specific early item.
 *
 * Useful for answering "what can I build from X?"
 *
 * @param items - All available items
 * @param earlyItemName - Name of the early item to start from
 * @param config - Analysis configuration
 * @param itemRepo - Optional pre-built ItemRepository
 * @returns Transitions starting with the early item
 */
export function findTransitionsFromItem(
  items: Item[],
  earlyItemName: string,
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): BuildAnalysisResult {
  const repo = itemRepo ?? new ItemRepository(items);
  const earlyItem = repo.getByName(earlyItemName) ?? repo.getByDisplayName(earlyItemName);

  if (!earlyItem) {
    return {
      transitions: [],
      stats: { totalEvaluated: 0, validCount: 0, averageScore: 0, bestScore: 0 },
    };
  }

  // Custom constraint: initial must include early item
  const mustIncludeEarly: TransitionConstraint = (t) =>
    t.from.items.some((i) => i.name === earlyItem.name);

  return analyzeValidTransitions(
    items,
    config,
    {
      earlyItemCount: 2,
      finalItemCount: 2,
      resultLimit: 20,
      constraint: allConstraints(
        costIncreaseConstraint,
        maxFinalItems(6),
        noDuplicateBoots(config),
        mustIncludeEarly
      ),
    },
    repo
  );
}

// ─────────────────────────────────────────────────────────────
// Utility Exports
// ─────────────────────────────────────────────────────────────

/**
 * Re-export key types and functions for convenience.
 */
export {
  createLoadout,
  createTransition,
} from "./loadout";

export {
  costIncreaseConstraint,
  minCostIncrease,
  minComponentReuse,
  maxWastedGold,
  allConstraints,
  anyConstraint,
} from "./constraints";

export {
  reuseEfficiencyScore,
  wasteAvoidanceScore,
  costDeltaScore,
  weightedScore,
  defaultTransitionScorer,
  conservativeScorer,
  economyScorer,
} from "./scorers";

export { combinations, filteredCombinations, noDuplicateBoots as noDuplicateBootsFilter } from "./combinations";

// ─────────────────────────────────────────────────────────────
// Testing Utilities (exported for unit testing)
// ─────────────────────────────────────────────────────────────

/**
 * Export internal classes for testing purposes.
 * These are implementation details but need to be tested for correctness.
 */
export const _testing = {
  LoadoutCache,
  BoundedPriorityQueue,
  quickReuseRatio,
  itemsToKey,
};
