/**
 * Combination generators for item analysis.
 *
 * Provides lazy generators for creating item combinations,
 * avoiding memory issues with large item sets.
 */

import { Item } from "../models/types";
import { partition } from "es-toolkit";
import { AnalysisConfig, isBootItem } from "../config/analysisConfig";

// ─────────────────────────────────────────────────────────────
// Core Generator Functions
// ─────────────────────────────────────────────────────────────

/**
 * Generate all N-item combinations from an array.
 *
 * Uses a generator to lazily produce combinations,
 * avoiding memory issues with large input sets.
 *
 * @param items - Items to combine
 * @param n - Number of items per combination
 * @yields Arrays of n items
 *
 * @example
 * ```ts
 * const items = [a, b, c, d];
 * for (const combo of combinations(items, 2)) {
 *   console.log(combo); // [a,b], [a,c], [a,d], [b,c], [b,d], [c,d]
 * }
 * ```
 */
export function* combinations<T>(items: T[], n: number): Generator<T[]> {
  if (n === 0) {
    yield [];
    return;
  }
  if (n > items.length) {
    return;
  }

  for (let i = 0; i <= items.length - n; i++) {
    for (const rest of combinations(items.slice(i + 1), n - 1)) {
      yield [items[i], ...rest];
    }
  }
}

/**
 * Generate combinations with a filter predicate.
 *
 * Only yields combinations that pass the predicate.
 *
 * @param items - Items to combine
 * @param n - Number of items per combination
 * @param predicate - Filter function
 * @yields Filtered combinations
 *
 * @example
 * ```ts
 * // Only combos where total cost < 2000
 * for (const combo of filteredCombinations(items, 2, c => sumCost(c) < 2000)) {
 *   console.log(combo);
 * }
 * ```
 */
export function* filteredCombinations<T>(
  items: T[],
  n: number,
  predicate: (combo: T[]) => boolean
): Generator<T[]> {
  for (const combo of combinations(items, n)) {
    if (predicate(combo)) {
      yield combo;
    }
  }
}

/**
 * Generate combinations of varying sizes from 1 to maxSize.
 *
 * Yields combinations starting from size 1 up to maxSize,
 * allowing flexible loadout sizes (e.g., 1-3 items instead of exactly 3).
 *
 * @param items - Items to combine
 * @param maxSize - Maximum number of items per combination
 * @param predicate - Optional filter function
 * @yields Combinations of sizes 1 to maxSize
 *
 * @example
 * ```ts
 * // Generate 1, 2, or 3 item combinations under 2000g
 * for (const combo of variableSizeCombinations(items, 3, c => sumCost(c) < 2000)) {
 *   console.log(combo.length, combo);
 * }
 * ```
 */
export function* variableSizeCombinations<T>(
  items: T[],
  maxSize: number,
  predicate?: (combo: T[]) => boolean
): Generator<T[]> {
  for (let size = 1; size <= maxSize; size++) {
    for (const combo of combinations(items, size)) {
      if (!predicate || predicate(combo)) {
        yield combo;
      }
    }
  }
}

/**
 * Collect combinations with transformation and early termination.
 *
 * Transforms each combination and collects results up to a limit.
 * Returns null from transform to skip a combination.
 *
 * @param items - Items to combine
 * @param n - Number of items per combination
 * @param transform - Function to transform/validate combinations
 * @param limit - Maximum results to collect
 * @returns Array of transformed results
 *
 * @example
 * ```ts
 * const results = collectCombinations(
 *   items,
 *   2,
 *   (combo) => isValid(combo) ? analyze(combo) : null,
 *   10
 * );
 * ```
 */
export function collectCombinations<T, R>(
  items: T[],
  n: number,
  transform: (combo: T[]) => R | null,
  limit: number
): R[] {
  const results: R[] = [];

  for (const combo of combinations(items, n)) {
    const result = transform(combo);
    if (result !== null) {
      results.push(result);
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
}

/**
 * Count total number of combinations.
 *
 * Uses the binomial coefficient formula: n! / (k! * (n-k)!)
 *
 * @param n - Total items
 * @param k - Items per combination
 * @returns Number of possible combinations
 */
export function countCombinations(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;

  // Optimize by using smaller k
  const smallerK = Math.min(k, n - k);

  let result = 1;
  for (let i = 0; i < smallerK; i++) {
    result = (result * (n - i)) / (i + 1);
  }

  return Math.round(result);
}

// ─────────────────────────────────────────────────────────────
// Item-Specific Combination Filters
// ─────────────────────────────────────────────────────────────

/**
 * Filter: No duplicate boots in combination.
 *
 * Movement speed from boots doesn't stack in Dota.
 *
 * @param config - Analysis config with boot item names
 * @returns Filter predicate
 *
 * @example
 * ```ts
 * const filter = noDuplicateBoots(config);
 * const validCombos = filteredCombinations(items, 2, filter);
 * ```
 */
export const noDuplicateBoots =
  (config: AnalysisConfig) =>
  (items: Item[]): boolean => {
    const bootCount = items.filter((i) => isBootItem(i.name, config)).length;
    return bootCount <= 1;
  };

/**
 * Filter: At least one boot in combination.
 *
 * @param config - Analysis config with boot item names
 * @returns Filter predicate
 */
export const hasAtLeastOneBoot =
  (config: AnalysisConfig) =>
  (items: Item[]): boolean =>
    items.some((i) => isBootItem(i.name, config));

/**
 * Filter: Exactly one boot in combination.
 *
 * @param config - Analysis config with boot item names
 * @returns Filter predicate
 */
export const hasExactlyOneBoot =
  (config: AnalysisConfig) =>
  (items: Item[]): boolean => {
    const bootCount = items.filter((i) => isBootItem(i.name, config)).length;
    return bootCount === 1;
  };

/**
 * Filter: No boots in combination.
 *
 * @param config - Analysis config with boot item names
 * @returns Filter predicate
 */
export const hasNoBoots =
  (config: AnalysisConfig) =>
  (items: Item[]): boolean =>
    !items.some((i) => isBootItem(i.name, config));

/**
 * Filter: Total cost under threshold.
 *
 * @param maxCost - Maximum combined cost
 * @returns Filter predicate
 */
export const maxTotalCost =
  (maxCost: number) =>
  (items: Item[]): boolean =>
    items.reduce((sum, i) => sum + i.cost, 0) <= maxCost;

/**
 * Filter: Total cost over threshold.
 *
 * @param minCost - Minimum combined cost
 * @returns Filter predicate
 */
export const minTotalCost =
  (minCost: number) =>
  (items: Item[]): boolean =>
    items.reduce((sum, i) => sum + i.cost, 0) >= minCost;

/**
 * Filter: Must include specific item.
 *
 * @param itemName - Name of required item
 * @returns Filter predicate
 */
export const mustIncludeItem =
  (itemName: string) =>
  (items: Item[]): boolean =>
    items.some((i) => i.name === itemName || i.displayName === itemName);

/**
 * Filter: Must not include specific item.
 *
 * @param itemName - Name of excluded item
 * @returns Filter predicate
 */
export const mustExcludeItem =
  (itemName: string) =>
  (items: Item[]): boolean =>
    !items.some((i) => i.name === itemName || i.displayName === itemName);

/**
 * Combine multiple filters with AND logic.
 *
 * @param filters - Filters to combine
 * @returns Combined filter
 *
 * @example
 * ```ts
 * const filter = combineFilters(
 *   noDuplicateBoots(config),
 *   maxTotalCost(3000)
 * );
 * ```
 */
export const combineFilters =
  <T>(...filters: Array<(items: T[]) => boolean>) =>
  (items: T[]): boolean =>
    filters.every((f) => f(items));

// ─────────────────────────────────────────────────────────────
// Boot Trio Generator (Special Case)
// ─────────────────────────────────────────────────────────────

/**
 * Result of boot trio generation.
 */
export interface BootTrioResult {
  /** The boot item */
  boot: Item;
  /** Two non-boot items */
  nonBoots: [Item, Item];
}

/**
 * Generate boot + 2 non-boot combinations.
 *
 * Special generator for the common "boot + 2 items" loadout pattern.
 *
 * @param items - All items to consider
 * @param config - Analysis config with boot item names
 * @yields Boot trio combinations
 *
 * @example
 * ```ts
 * for (const { boot, nonBoots } of bootTrioCombinations(items, config)) {
 *   console.log(`${boot.name} + ${nonBoots.map(i => i.name).join(', ')}`);
 * }
 * ```
 */
export function* bootTrioCombinations(
  items: Item[],
  config: AnalysisConfig
): Generator<BootTrioResult> {
  const [boots, nonBoots] = partition(items, (i) => isBootItem(i.name, config));

  for (const boot of boots) {
    for (const pair of combinations(nonBoots, 2)) {
      yield {
        boot,
        nonBoots: pair as [Item, Item],
      };
    }
  }
}

/**
 * Count boot trio combinations.
 *
 * @param items - All items
 * @param config - Analysis config
 * @returns Number of possible boot trio combinations
 */
export function countBootTrioCombinations(
  items: Item[],
  config: AnalysisConfig
): number {
  const [boots, nonBoots] = partition(items, (i) => isBootItem(i.name, config));
  return boots.length * countCombinations(nonBoots.length, 2);
}

// ─────────────────────────────────────────────────────────────
// Pair Generator Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Generate all pairs from an array.
 *
 * Convenience wrapper for combinations(items, 2).
 *
 * @param items - Items to pair
 * @yields Pairs of items
 */
export function* pairs<T>(items: T[]): Generator<[T, T]> {
  for (const combo of combinations(items, 2)) {
    yield combo as [T, T];
  }
}

/**
 * Generate Cartesian product of two arrays.
 *
 * Yields every possible pairing of items from both arrays.
 *
 * @param as - First array
 * @param bs - Second array
 * @yields Pairs [a, b] for each a in as, b in bs
 */
export function* cartesianProduct<A, B>(
  as: A[],
  bs: B[]
): Generator<[A, B]> {
  for (const a of as) {
    for (const b of bs) {
      yield [a, b];
    }
  }
}
