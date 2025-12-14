import { Item } from "../models/types";
import { ItemRepository } from "../data/ItemRepository";
import { countBy, sumBy, groupBy } from "es-toolkit";

/**
 * Result of categorizing components into reachable vs orphan
 */
export interface ComponentBreakdown {
  /** Components available via early items */
  reachable: ComponentInfo[];
  /** Components that must be bought directly */
  orphan: ComponentInfo[];
  /** Total gold value of reachable components */
  reachableGold: number;
  /** Total gold value of orphan components */
  orphanGold: number;
  /** Reachability percentage (reachableGold / totalGold) */
  reachabilityPercent: number;
}

export interface ComponentInfo {
  name: string;
  displayName: string;
  cost: number;
}

/**
 * Count occurrences of each item in an array.
 * Wrapper around es-toolkit's countBy that returns a Map for compatibility.
 */
export function countOccurrences<T extends string | number>(items: T[]): Map<T, number> {
  const counts = countBy(items, (item) => item);
  return new Map(Object.entries(counts) as [T, number][]);
}

/**
 * Categorize components into reachable (from early items) and orphan (must buy directly)
 */
export function categorizeComponents(
  targetComponents: string[],
  availableComponents: Set<string>,
  itemRepo: ItemRepository
): ComponentBreakdown {
  const reachable: ComponentInfo[] = [];
  const orphan: ComponentInfo[] = [];

  const componentCounts = countBy(targetComponents, (c) => c);

  for (const [compName, count] of Object.entries(componentCounts)) {
    const compItem = itemRepo.getByName(compName);
    if (!compItem) continue;

    const info: ComponentInfo = {
      name: compName,
      displayName: compItem.displayName,
      cost: compItem.cost,
    };

    for (let i = 0; i < count; i++) {
      if (availableComponents.has(compName)) {
        reachable.push({ ...info });
      } else {
        orphan.push({ ...info });
      }
    }
  }

  const reachableGold = sumBy(reachable, (c) => c.cost);
  const orphanGold = sumBy(orphan, (c) => c.cost);
  const totalGold = reachableGold + orphanGold;
  const reachabilityPercent = totalGold > 0 ? reachableGold / totalGold : 0;

  return {
    reachable,
    orphan,
    reachableGold,
    orphanGold,
    reachabilityPercent,
  };
}

/**
 * Find matching components between early items and a target item.
 * Respects component counts (e.g., item needing 2x Iron Branch).
 */
export function findMatchingComponents(
  earlyItemComponents: string[],
  targetComponents: string[]
): string[] {
  const matches: string[] = [];
  const targetCounts = countBy(targetComponents, (c) => c);
  const usedCounts: Record<string, number> = {};

  for (const comp of earlyItemComponents) {
    const needed = targetCounts[comp] || 0;
    const used = usedCounts[comp] || 0;
    if (used < needed) {
      matches.push(comp);
      usedCounts[comp] = used + 1;
    }
  }

  return matches;
}

/**
 * Collect all unique base components from a list of analyzed early items
 */
export function collectAvailableComponents(
  earlyItems: { item: Item }[],
  itemRepo: ItemRepository
): Set<string> {
  const allComponents = earlyItems.flatMap(({ item }) => 
    itemRepo.getBaseComponents(item)
  );
  return new Set(allComponents);
}

/**
 * Get component sources: which early items provide each component
 */
export function getComponentSources(
  earlyItems: { item: Item }[],
  itemRepo: ItemRepository
): Map<string, string[]> {
  // Create flat array of { component, itemName } pairs
  const pairs = earlyItems.flatMap(({ item }) =>
    itemRepo.getBaseComponents(item).map((comp) => ({
      component: comp,
      itemName: item.displayName,
    }))
  );

  // Group by component name
  const grouped = groupBy(pairs, (p) => p.component);

  // Convert to Map<string, string[]>
  return new Map(
    Object.entries(grouped).map(([comp, items]) => [
      comp,
      items.map((p) => p.itemName),
    ])
  );
}
