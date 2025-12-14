import { Item } from "../models/types";
import { sumBy } from "es-toolkit";

/**
 * Centralized repository for item data access with memoization.
 * Provides efficient lookups and pre-computed derived data.
 */
export class ItemRepository {
  private readonly items: Item[];
  private readonly byName: Map<string, Item>;
  private readonly byDisplayName: Map<string, Item>;
  private readonly baseComponentsCache: Map<string, string[]>;
  private readonly recipeCostCache: Map<string, number>;
  private componentIndex: Map<string, Item[]> | null = null;

  constructor(items: Item[]) {
    this.items = items;
    this.byName = new Map(items.map(i => [i.name, i]));
    this.byDisplayName = new Map(items.map(i => [i.displayName, i]));
    this.baseComponentsCache = new Map();
    this.recipeCostCache = new Map();
  }

  /**
   * Get all items
   */
  getAll(): Item[] {
    return this.items;
  }

  /**
   * Get item by internal name (e.g., "force_staff")
   */
  getByName(name: string): Item | undefined {
    return this.byName.get(name);
  }

  /**
   * Get item by display name (e.g., "Force Staff")
   */
  getByDisplayName(displayName: string): Item | undefined {
    return this.byDisplayName.get(displayName);
  }

  /**
   * Check if an item exists
   */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /**
   * Get all base components of an item recursively (memoized).
   * Returns the item's own name if it has no components.
   */
  getBaseComponents(item: Item): string[] {
    const cached = this.baseComponentsCache.get(item.name);
    if (cached) return cached;

    const result = this.computeBaseComponents(item);
    this.baseComponentsCache.set(item.name, result);
    return result;
  }

  /**
   * Get base components by item name
   */
  getBaseComponentsByName(itemName: string): string[] {
    const item = this.byName.get(itemName);
    if (!item) return [];
    return this.getBaseComponents(item);
  }

  private computeBaseComponents(item: Item): string[] {
    if (item.components.length === 0) {
      return [item.name];
    }

    const baseComponents: string[] = [];
    for (const componentName of item.components) {
      const componentItem = this.byName.get(componentName);
      if (componentItem) {
        baseComponents.push(...this.getBaseComponents(componentItem));
      } else {
        // Component not found (might be a recipe or missing item)
        baseComponents.push(componentName);
      }
    }
    return baseComponents;
  }

  /**
   * Calculate recipe cost for an item (memoized).
   * Recipe cost = Item cost - Sum of all component costs
   */
  getRecipeCost(item: Item): number {
    const cached = this.recipeCostCache.get(item.name);
    if (cached !== undefined) return cached;

    const result = this.computeRecipeCost(item);
    this.recipeCostCache.set(item.name, result);
    return result;
  }

  /**
   * Get recipe cost by item name
   */
  getRecipeCostByName(itemName: string): number {
    const item = this.byName.get(itemName);
    if (!item) return 0;
    return this.getRecipeCost(item);
  }

  private computeRecipeCost(item: Item): number {
    if (item.components.length === 0) return 0;

    const baseComponents = this.getBaseComponents(item);
    const componentsCost = this.getComponentsGoldValue(baseComponents);
    return Math.max(0, item.cost - componentsCost);
  }

  /**
   * Calculate total gold value of a list of components
   */
  getComponentsGoldValue(componentNames: string[]): number {
    return sumBy(componentNames, name => {
      const item = this.byName.get(name);
      return item ? item.cost : 0;
    });
  }

  /**
   * Get or build the component index (lazy initialization).
   * Maps component name -> items that use it.
   */
  getComponentIndex(): Map<string, Item[]> {
    if (this.componentIndex) return this.componentIndex;

    this.componentIndex = new Map();
    for (const item of this.items) {
      if (item.components.length === 0) continue;

      const baseComponents = this.getBaseComponents(item);
      for (const component of baseComponents) {
        if (!this.componentIndex.has(component)) {
          this.componentIndex.set(component, []);
        }
        const existing = this.componentIndex.get(component)!;
        if (!existing.includes(item)) {
          existing.push(item);
        }
      }
    }

    return this.componentIndex;
  }

  /**
   * Find all items that use a specific component and meet a minimum cost
   * @deprecated Use findAllUpgradeTargets() for build-level validation
   */
  findUpgradeTargets(componentName: string, minCost: number): Item[] {
    const index = this.getComponentIndex();
    const items = index.get(componentName) || [];
    return items.filter(item => item.cost >= minCost);
  }

  /**
   * Find upgrade target display names for a component
   * @deprecated Use findAllUpgradeTargetNames() for build-level validation
   */
  findUpgradeTargetNames(componentName: string, minCost: number): string[] {
    return this.findUpgradeTargets(componentName, minCost).map(item => item.displayName);
  }

  /**
   * Find ALL items that use a specific component (no cost filter).
   * Used for build-level validation where the constraint is on total build cost,
   * not individual item cost.
   * 
   * @param componentName - The component to search for
   * @param exclude - Optional array of item names to exclude from results.
   *                  Useful when analyzing disassemble paths to exclude the source item.
   */
  findAllUpgradeTargets(componentName: string, exclude?: string[]): Item[] {
    const index = this.getComponentIndex();
    const items = index.get(componentName) ?? [];
    
    if (!exclude || exclude.length === 0) {
      return items;
    }
    
    const excludeSet = new Set(exclude);
    return items.filter(item => !excludeSet.has(item.name));
  }

  /**
   * Find ALL upgrade target display names for a component (no cost filter).
   * 
   * @param componentName - The component to search for
   * @param exclude - Optional array of item names to exclude from results
   */
  findAllUpgradeTargetNames(componentName: string, exclude?: string[]): string[] {
    return this.findAllUpgradeTargets(componentName, exclude).map(item => item.displayName);
  }

  /**
   * Get all items with components (any upgraded item, no cost filter).
   * Used for build-level validation.
   */
  getAllUpgradedItems(): Item[] {
    return this.items.filter(item => item.components.length > 0);
  }

  /**
   * Filter items by criteria
   */
  filter(predicate: (item: Item) => boolean): Item[] {
    return this.items.filter(predicate);
  }

  /**
   * Get early game items (upgraded items under cost threshold)
   */
  getEarlyGameItems(maxCost: number): Item[] {
    return this.items.filter(item =>
      !item.isComponent &&
      item.cost <= maxCost &&
      item.components.length > 0
    );
  }

  /**
   * Get late game items (items at or above cost threshold)
   */
  getLateGameItems(minCost: number): Item[] {
    return this.items.filter(item =>
      item.cost >= minCost &&
      item.components.length > 0
    );
  }
}

/**
 * Create an ItemRepository from an array of items
 */
export function createItemRepository(items: Item[]): ItemRepository {
  return new ItemRepository(items);
}
