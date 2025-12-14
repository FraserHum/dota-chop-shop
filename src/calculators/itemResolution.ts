/**
 * Item Resolution
 *
 * Functions for resolving item names/display names to Item objects.
 * Supports exact matches, case-insensitive matching, and fuzzy matching.
 */

import { Item } from "../models/types";
import { ItemRepository } from "../data/ItemRepository";

// ─────────────────────────────────────────────────────────────
// Item Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Result of resolving item names.
 */
export interface ItemResolutionResult {
  /** Items that were successfully resolved */
  readonly resolved: Item[];
  /** Item names that could not be found */
  readonly unresolved: string[];
}

/**
 * Resolve item names/display names to actual Item objects.
 *
 * Tries multiple matching strategies in order:
 * 1. Exact match by internal name
 * 2. Exact match by display name
 * 3. Case-insensitive match
 * 4. Partial match (substring)
 *
 * @param targetNames - Names to resolve
 * @param repo - Item repository to search
 * @returns Object with resolved items and unresolved names
 *
 * @example
 * ```ts
 * const { resolved, unresolved } = resolveTargetItems(
 *   ["Force Staff", "skadi", "bkb"],
 *   repo
 * );
 * // resolved: [ForceStaffItem, SkadiItem, BKBItem]
 * // unresolved: []
 * ```
 */
export function resolveTargetItems(
  targetNames: readonly string[],
  repo: ItemRepository
): ItemResolutionResult {
  const resolved: Item[] = [];
  const unresolved: string[] = [];

  for (const name of targetNames) {
    const trimmed = name.trim();

    // Try exact match by name
    let item = repo.getByName(trimmed);

    // Try exact match by display name
    if (!item) {
      item = repo.getByDisplayName(trimmed);
    }

    // Try case-insensitive match
    if (!item) {
      const lowerName = trimmed.toLowerCase();
      item = repo
        .getAll()
        .find(
          (i) =>
            i.name.toLowerCase() === lowerName ||
            i.displayName.toLowerCase() === lowerName
        );
    }

    // Try partial match (contains)
    if (!item) {
      const lowerName = trimmed.toLowerCase();
      item = repo
        .getAll()
        .find(
          (i) =>
            i.displayName.toLowerCase().includes(lowerName) ||
            i.name.toLowerCase().includes(lowerName)
        );
    }

    if (item) {
      resolved.push(item);
    } else {
      unresolved.push(trimmed);
    }
  }

  return { resolved, unresolved };
}

/**
 * Resolve a single item name, returning null if not found.
 *
 * @param name - Item name to resolve
 * @param repo - Item repository
 * @returns Resolved item or null
 */
export function resolveItem(
  name: string,
  repo: ItemRepository
): Item | null {
  const { resolved } = resolveTargetItems([name], repo);
  return resolved[0] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Fuzzy Matching / Suggestions
// ─────────────────────────────────────────────────────────────

/**
 * Find similar item names for suggestions when a target isn't found.
 *
 * Uses multiple heuristics to find similar items:
 * - Substring matching
 * - Word overlap
 * - First letter matching
 *
 * @param targetName - Name that wasn't found
 * @param repo - Item repository
 * @param limit - Maximum suggestions to return (default: 3)
 * @returns Array of similar item display names
 *
 * @example
 * ```ts
 * findSimilarItems("forcestaf", repo);
 * // Returns: ["Force Staff", "Staff of Wizardry", ...]
 * ```
 */
export function findSimilarItems(
  targetName: string,
  repo: ItemRepository,
  limit: number = 3
): string[] {
  const lowerTarget = targetName.toLowerCase();
  const items = repo.getAll();

  // Score items by similarity
  const scored = items.map((item) => {
    const lowerName = item.displayName.toLowerCase();
    let score = 0;

    // Substring match (strong signal)
    if (lowerName.includes(lowerTarget) || lowerTarget.includes(lowerName)) {
      score += 10;
    }

    // Word overlap
    const targetWords = lowerTarget.split(/\s+/);
    const nameWords = lowerName.split(/\s+/);
    for (const tw of targetWords) {
      for (const nw of nameWords) {
        if (nw.includes(tw) || tw.includes(nw)) {
          score += 5;
        }
      }
    }

    // First letter match
    if (lowerName[0] === lowerTarget[0]) {
      score += 2;
    }

    // Levenshtein-like: penalize length difference
    const lengthDiff = Math.abs(lowerName.length - lowerTarget.length);
    score -= lengthDiff * 0.5;

    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item.displayName);
}

/**
 * Get suggestions when a target item isn't found.
 *
 * Combines resolution attempt with suggestion generation.
 *
 * @param targetName - Name to look up
 * @param repo - Item repository
 * @returns Either the found item or suggestions
 */
export function getItemSuggestions(
  targetName: string,
  repo: ItemRepository
): { found: true; item: Item } | { found: false; suggestions: string[] } {
  const { resolved } = resolveTargetItems([targetName], repo);

  if (resolved.length > 0) {
    return { found: true, item: resolved[0] };
  }

  return {
    found: false,
    suggestions: findSimilarItems(targetName, repo),
  };
}

// ─────────────────────────────────────────────────────────────
// Batch Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Resolve items for multiple stages at once.
 *
 * @param stageTargets - Map of stage index to target item names
 * @param repo - Item repository
 * @returns Maps of resolved items and unresolved names by stage
 */
export function resolveStageTargets(
  stageTargets: ReadonlyMap<number, readonly string[]>,
  repo: ItemRepository
): {
  resolved: Map<number, Item[]>;
  unresolved: Map<number, string[]>;
} {
  const resolved = new Map<number, Item[]>();
  const unresolved = new Map<number, string[]>();

  for (const [stageIndex, names] of stageTargets) {
    const result = resolveTargetItems(names, repo);
    resolved.set(stageIndex, result.resolved);
    if (result.unresolved.length > 0) {
      unresolved.set(stageIndex, result.unresolved);
    }
  }

  return { resolved, unresolved };
}
