/**
 * Search Utilities
 *
 * Shared utilities for build progression search algorithms.
 * Includes caching, priority queues, and item filtering.
 */

import { Item, StatValuation } from "../models/types";
import { Loadout } from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { AnalysisConfig } from "../config/analysisConfig";
import { createLoadout } from "./loadout";

// ─────────────────────────────────────────────────────────────
// Cache Key Generation
// ─────────────────────────────────────────────────────────────

/**
 * Create a cache key from item names (sorted for consistency).
 */
export function itemsToKey(items: readonly Item[]): string {
  return items
    .map((i) => i.name)
    .sort()
    .join(",");
}

// ─────────────────────────────────────────────────────────────
// Loadout Cache
// ─────────────────────────────────────────────────────────────

/**
 * Memoized loadout factory with LRU-style eviction.
 *
 * Creating loadouts is expensive due to component analysis.
 * This cache reuses loadouts for identical item combinations.
 */
export class LoadoutCache {
  private cache = new Map<string, Loadout>();
  private maxSize: number;

  constructor(
    private repo: ItemRepository,
    private statValuation?: StatValuation,
    maxSize: number = 10000
  ) {
    this.maxSize = maxSize;
  }

  /**
   * Get a loadout from cache or create and cache it.
   */
  getOrCreate(items: readonly Item[]): Loadout {
    const key = itemsToKey(items);
    let loadout = this.cache.get(key);
    if (!loadout) {
      loadout = createLoadout([...items], this.repo, this.statValuation);
      this.cache.set(key, loadout);

      // Evict oldest entries if cache is full
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

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ─────────────────────────────────────────────────────────────
// Bounded Priority Queue
// ─────────────────────────────────────────────────────────────

/**
 * Bounded priority queue for keeping top N items.
 *
 * Uses binary search insertion to maintain sorted order.
 * Items are compared using a custom compare function.
 */
export class BoundedPriorityQueue<T> {
  private items: T[] = [];

  constructor(
    private maxSize: number,
    private compare: (a: T, b: T) => number
  ) {}

  /**
   * Add an item to the queue.
   * Returns true if the item was added, false if rejected.
   */
  add(item: T): boolean {
    if (this.items.length < this.maxSize) {
      this.insertSorted(item);
      return true;
    }

    // Check if item is better than worst item
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

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

// ─────────────────────────────────────────────────────────────
// Component Reuse Calculation
// ─────────────────────────────────────────────────────────────

/**
 * Quick component overlap check for early pruning.
 *
 * Calculates what fraction of the 'from' loadout's components
 * are reused in the 'to' loadout. Used for fast filtering
 * before doing full transition analysis.
 *
 * @param from - Source loadout
 * @param to - Target loadout
 * @returns Reuse ratio (0-1)
 */
export function quickReuseRatio(from: Loadout, to: Loadout): number {
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
// Item Filtering
// ─────────────────────────────────────────────────────────────

/**
 * Check if an item has good gold recovery potential.
 *
 * Gold recovery = (usable components gold + recipe cost) / item cost
 *
 * Items with good gold recovery can be efficiently disassembled
 * and their components reused in other items.
 *
 * @param item - Item to check
 * @param repo - Item repository
 * @param config - Analysis configuration
 * @returns True if item meets gold recovery threshold
 */
export function hasGoodGoldRecovery(
  item: Item,
  repo: ItemRepository,
  config: AnalysisConfig
): boolean {
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
}

/**
 * Find items that share components with target items.
 *
 * Used to prioritize items that can contribute to building
 * towards target items.
 *
 * @param targetItems - Items we want to build towards
 * @param candidateItems - Pool of items to filter
 * @param repo - Item repository
 * @returns Items sorted by relevance to targets
 */
export function findRelevantItems(
  targetItems: readonly Item[],
  candidateItems: readonly Item[],
  repo: ItemRepository
): Item[] {
  if (targetItems.length === 0) {
    return [...candidateItems];
  }

  // Get all components needed for targets
  const targetComponentSet = new Set<string>();
  for (const item of targetItems) {
    for (const comp of repo.getBaseComponents(item)) {
      targetComponentSet.add(comp);
    }
  }

  // Score candidate items by how many target components they provide
  const scored = candidateItems.map((item) => {
    const itemComponents = repo.getBaseComponents(item);
    const relevantCount = itemComponents.filter((c) =>
      targetComponentSet.has(c)
    ).length;
    const coverage =
      itemComponents.length > 0 ? relevantCount / itemComponents.length : 0;

    return {
      item,
      relevantCount,
      coverage,
      // Prefer items with high coverage AND multiple relevant components
      score: relevantCount * (1 + coverage),
    };
  });

  return scored
    .filter((s) => s.relevantCount > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

/**
 * Find upgrade targets that use at least one component from a loadout.
 *
 * Used to focus search on items that can be built from existing components.
 *
 * @param fromLoadout - Current loadout
 * @param allUpgraded - All available upgraded items
 * @param repo - Item repository
 * @returns Items that share components with the loadout
 */
export function findRelevantUpgradeTargets(
  fromLoadout: Loadout,
  allUpgraded: readonly Item[],
  repo: ItemRepository
): Item[] {
  const componentSet = new Set(fromLoadout.components);

  return allUpgraded.filter((item) => {
    const itemComponents = repo.getBaseComponents(item);
    return itemComponents.some((c) => componentSet.has(c));
  });
}

// ─────────────────────────────────────────────────────────────
// Combination Generation with Required Items
// ─────────────────────────────────────────────────────────────

/**
 * Generate combinations that include all required items.
 *
 * If we need 3 items and 1 is required, this generates all
 * 2-item combinations from the pool and adds the required item.
 *
 * @param pool - Items to choose from (should not include required items)
 * @param totalCount - Total items needed in each combination
 * @param requiredItems - Items that must be in every combination
 * @param filter - Optional filter for combinations
 * @yields Combinations including required items
 */
export function* combinationsWithRequired(
  pool: readonly Item[],
  totalCount: number,
  requiredItems: readonly Item[],
  filter?: (items: readonly Item[]) => boolean
): Generator<Item[]> {
  const remainingSlots = totalCount - requiredItems.length;

  if (remainingSlots < 0) {
    // More required items than slots - can't satisfy
    return;
  }

  if (remainingSlots === 0) {
    // Only required items fit
    const combo = [...requiredItems];
    if (!filter || filter(combo)) {
      yield combo;
    }
    return;
  }

  // Filter pool to exclude required items
  const requiredNames = new Set(requiredItems.map((i) => i.name));
  const filteredPool = pool.filter((i) => !requiredNames.has(i.name));

  // Generate combinations for remaining slots
  function* generateCombos(
    start: number,
    current: Item[]
  ): Generator<Item[]> {
    if (current.length === remainingSlots) {
      const combo = [...requiredItems, ...current];
      if (!filter || filter(combo)) {
        yield combo;
      }
      return;
    }

    for (let i = start; i < filteredPool.length; i++) {
      yield* generateCombos(i + 1, [...current, filteredPool[i]]);
    }
  }

  yield* generateCombos(0, []);
}

/**
 * Generate combinations of varying sizes that include all required items.
 *
 * Generates combinations from requiredItems.length up to maxCount items.
 * Required items are always included in every combination.
 *
 * @param pool - Items to choose from (should not include required items)
 * @param maxCount - Maximum total items per combination
 * @param requiredItems - Items that must be in every combination
 * @param filter - Optional filter for combinations
 * @yields Combinations including required items, of varying sizes
 */
export function* variableCombinationsWithRequired(
  pool: readonly Item[],
  maxCount: number,
  requiredItems: readonly Item[],
  filter?: (items: readonly Item[]) => boolean
): Generator<Item[]> {
  const minSize = requiredItems.length;
  
  // Start from just the required items, up to maxCount
  for (let totalSize = minSize; totalSize <= maxCount; totalSize++) {
    yield* combinationsWithRequired(pool, totalSize, requiredItems, filter);
  }
}
