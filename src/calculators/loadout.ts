/**
 * Loadout creation and component flow analysis utilities.
 *
 * Pure functions for constructing Loadout objects and analyzing
 * how components flow between loadouts during transitions.
 */

import { Item, StatValuation, ItemStats } from "../models/types";
import {
  Loadout,
  ComponentFlow,
  LoadoutTransition,
  ComponentPool,
} from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { sumBy, countBy, uniq } from "es-toolkit";

// ─────────────────────────────────────────────────────────────
// Loadout Construction
// ─────────────────────────────────────────────────────────────

export interface SlotOptions {
  inventorySlots?: number;
  backpackSlots?: number;
}

/**
 * Allocate items to inventory, backpack, and sold lists based on priority.
 * 
 * Priority:
 * 1. Upgraded items (descending cost)
 * 2. Components with stats (descending cost)
 * 3. Other components (descending cost)
 */
export const allocateItemsToSlots = (
  items: readonly Item[],
  options?: SlotOptions
): {
  inventory: Item[];
  backpack: Item[];
  sold: Item[];
} => {
  const inventorySlots = options?.inventorySlots ?? 6;
  const backpackSlots = options?.backpackSlots ?? 3;
  
  // Sort items by priority
  const sortedItems = [...items].sort((a, b) => {
    // 1. Upgraded items first (isComponent = false)
    if (a.isComponent !== b.isComponent) {
      return a.isComponent ? 1 : -1;
    }
    
    // 2. Components with stats vs without stats
    const aHasStats = Object.keys(a.stats).length > 0;
    const bHasStats = Object.keys(b.stats).length > 0;
    if (a.isComponent && b.isComponent && aHasStats !== bHasStats) {
      return aHasStats ? -1 : 1;
    }
    
    // 3. Higher cost first
    return b.cost - a.cost;
  });
  
  // Allocate to slots
  const inventory = sortedItems.slice(0, inventorySlots);
  const backpack = sortedItems.slice(inventorySlots, inventorySlots + backpackSlots);
  const sold = sortedItems.slice(inventorySlots + backpackSlots);
  
  return { inventory, backpack, sold };
};

/**
 * Calculate total stat value for items given stat valuations.
 * 
 * @param items - Items to calculate stat value for
 * @param statValuation - Gold per stat point valuations
 * @returns Total gold value of all stats
 */
export const calculateItemsStatValue = (
  items: readonly Item[],
  statValuation: StatValuation
): number => {
  let totalStatValue = 0;
  
  for (const item of items) {
    for (const [stat, amount] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
      if (amount === undefined || amount === 0) continue;
      const goldPerPoint = statValuation[stat] || 0;
      totalStatValue += amount * goldPerPoint;
    }
  }
  
  return totalStatValue;
};

/**
 * Create a Loadout from an array of items.
 *
 * @param items - Items to include in the loadout
 * @param repo - ItemRepository for component resolution
 * @param statValuation - Optional stat valuations for efficiency calculation
 * @param slotOptions - Optional inventory/backpack slot limits
 * @returns Immutable Loadout object
 */
export const createLoadout = (
  items: Item[],
  repo: ItemRepository,
  statValuation?: StatValuation,
  slotOptions?: SlotOptions
): Loadout => {
  // Allocate items to slots
  const { inventory, backpack, sold } = allocateItemsToSlots(items, slotOptions);
  
  // Retained items (Inventory + Backpack)
  const retainedItems = [...inventory, ...backpack];
  
  const components = retainedItems.flatMap((i) => repo.getBaseComponents(i));
  const totalCost = sumBy(retainedItems, (i) => i.cost);
  
  // Calculate stats ONLY from inventory items
  const totalStatValue = statValuation ? calculateItemsStatValue(inventory, statValuation) : 0;
  
  // Calculate sold recovery (50% of cost, or 100% for recipes which shouldn't be here as items anyway)
  // Note: Items passed to createLoadout should be actual items, not recipes.
  // But strictly speaking, recipes are components. If a recipe ended up here as a standalone item...
  // Wait, recipe items usually have isComponent=true.
  // Gyro innate: "Recipes are sold for 100% gold recovery".
  // Regular items: "Sold for 50%".
  const soldRecovery = sumBy(sold, (item) => {
    // If it's a recipe, 100% recovery. 
    // We can identify recipes by name or convention. Usually recipes are just components.
    // The safest check is repo.getRecipeCost(item) but that's for assembled items.
    // For raw recipe items (like "recipe_bracer"), they are items in the repo.
    const isRecipe = item.name.startsWith("recipe_");
    return isRecipe ? item.cost : Math.floor(item.cost / 2);
  });
  
  // Total invested cost = (Inventory + Backpack + Sold) - SoldRecovery
  // = (retainedCost + soldCost) - SoldRecovery
  const soldCost = sumBy(sold, (i) => i.cost);
  const grossCost = totalCost + soldCost;
  const netInvestedCost = grossCost - soldRecovery;
  
  // Efficiency = StatValue / InvestedCost
  const efficiency = netInvestedCost > 0 && statValuation ? totalStatValue / netInvestedCost : 0;
  
  return {
    items: retainedItems, // Backwards compatibility: items = retained items
    inventory,
    backpack,
    sold,
    soldRecovery,
    netWorth: totalCost,
    totalCost,
    components,
    componentCounts: countBy(components, (c) => c),
    totalStatValue,
    efficiency,
    totalInvestedCost: netInvestedCost,
  };
};

/**
 * Create an empty loadout.
 */
export const emptyLoadout = (): Loadout => ({
  items: [],
  inventory: [],
  backpack: [],
  sold: [],
  soldRecovery: 0,
  netWorth: 0,
  totalCost: 0,
  components: [],
  componentCounts: {},
  totalStatValue: 0,
  efficiency: 0,
  totalInvestedCost: 0,
});

// ─────────────────────────────────────────────────────────────
// Component Flow Analysis
// ─────────────────────────────────────────────────────────────

/**
 * Analyze how components flow between two loadouts.
 *
 * Categorizes each component as:
 * - **reused**: Present in both loadouts (value preserved)
 * - **wasted**: Present in "from" but not "to" (value lost)
 * - **acquired**: Present in "to" but not "from" (must purchase)
 *
 * Handles duplicate components correctly (e.g., items needing 2x Iron Branch).
 * Also calculates recipe costs, accounting for Gyro's 100% recipe recovery on disassembly.
 *
 * @param from - Source loadout
 * @param to - Target loadout
 * @param repo - ItemRepository for gold value lookups
 * @returns ComponentFlow analysis
 *
 * @example
 * ```ts
 * const flow = analyzeComponentFlow(earlyLoadout, finalLoadout, repo);
 * console.log(`Reused: ${flow.reusedGold}g`);
 * console.log(`Wasted: ${flow.wastedGold}g`);
 * console.log(`Total to buy: ${flow.totalGoldNeeded}g`);
 * ```
 */
export const analyzeComponentFlow = (
  from: Loadout,
  to: Loadout,
  repo: ItemRepository
): ComponentFlow => {
  const reused: string[] = [];
  const wasted: string[] = [];
  const acquired: string[] = [];

  // Get all unique components from both loadouts
  const allComponents = uniq([...from.components, ...to.components]);

  // For each component, determine how many transfer, waste, or acquire
  for (const comp of allComponents) {
    const fromCount = from.componentCounts[comp] ?? 0;
    const toCount = to.componentCounts[comp] ?? 0;
    const transferred = Math.min(fromCount, toCount);

    // Components that transfer from early to final
    for (let i = 0; i < transferred; i++) {
      reused.push(comp);
    }

    // Components lost from early (not used in final)
    for (let i = 0; i < fromCount - transferred; i++) {
      wasted.push(comp);
    }

    // Components needed in final that weren't in early
    for (let i = 0; i < toCount - transferred; i++) {
      acquired.push(comp);
    }
  }

  // Calculate gold values for components
  const getGold = (comps: string[]) =>
    sumBy(comps, (c) => repo.getByName(c)?.cost ?? 0);

  // Calculate recipe costs
  // Gyro's innate: 100% gold recovery on recipes when disassembling
  const recoveredRecipeCost = sumBy([...from.items], (item) => repo.getRecipeCost(item));
  const targetRecipeCost = sumBy([...to.items], (item) => repo.getRecipeCost(item));
  const netRecipeCost = targetRecipeCost - recoveredRecipeCost;
  
  const acquiredGold = getGold(acquired);

  return {
    reused,
    wasted,
    acquired,
    reusedGold: getGold(reused),
    wastedGold: getGold(wasted),
    acquiredGold,
    recoveredRecipeCost,
    targetRecipeCost,
    netRecipeCost,
    totalGoldNeeded: acquiredGold + netRecipeCost,
  };
};

// ─────────────────────────────────────────────────────────────
// Transition Construction
// ─────────────────────────────────────────────────────────────

/**
 * Create a LoadoutTransition between two loadouts.
 *
 * This is the primary function for analyzing a potential build path.
 *
 * @param from - Starting loadout (early game items)
 * @param to - Target loadout (final items)
 * @param repo - ItemRepository for component analysis
 * @returns Complete transition analysis
 *
 * @example
 * ```ts
 * const early = createLoadout([tranquilBoots, pavise], repo);
 * const final = createLoadout([arcaneBoots, forceStaff], repo);
 * const transition = createTransition(early, final, repo);
 *
 * if (transition.costDelta > 0) {
 *   console.log('Valid upgrade path!');
 * }
 * ```
 */
export const createTransition = (
  from: Loadout,
  to: Loadout,
  repo: ItemRepository
): LoadoutTransition => ({
  from,
  to,
  costDelta: to.totalCost - from.totalCost,
  componentFlow: analyzeComponentFlow(from, to, repo),
});

/**
 * Create a transition directly from item arrays.
 *
 * Convenience function that creates loadouts internally.
 *
 * @param fromItems - Early game items
 * @param toItems - Target items
 * @param repo - ItemRepository
 * @returns Complete transition analysis
 */
export const createTransitionFromItems = (
  fromItems: Item[],
  toItems: Item[],
  repo: ItemRepository
): LoadoutTransition => {
  const from = createLoadout(fromItems, repo);
  const to = createLoadout(toItems, repo);
  return createTransition(from, to, repo);
};

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

/**
 * Calculate the reuse efficiency of a transition.
 *
 * @param transition - The transition to analyze
 * @returns Percentage of early gold that was reused (0-1)
 */
export const getReusedPercentage = (transition: LoadoutTransition): number => {
  if (transition.from.totalCost === 0) return 0;
  return transition.componentFlow.reusedGold / transition.from.totalCost;
};

/**
 * Calculate the waste percentage of a transition.
 *
 * @param transition - The transition to analyze
 * @returns Percentage of early gold that was wasted (0-1)
 */
export const getWastedPercentage = (transition: LoadoutTransition): number => {
  if (transition.from.totalCost === 0) return 0;
  return transition.componentFlow.wastedGold / transition.from.totalCost;
};

/**
 * Get item names from a loadout.
 *
 * @param loadout - The loadout
 * @returns Array of display names
 */
export const getLoadoutItemNames = (loadout: Loadout): string[] =>
  loadout.items.map((i) => i.displayName);

/**
 * Format a transition as a human-readable string.
 *
 * @param transition - The transition to format
 * @returns Formatted string
 */
export const formatTransition = (transition: LoadoutTransition): string => {
  const fromNames = getLoadoutItemNames(transition.from).join(" + ");
  const toNames = getLoadoutItemNames(transition.to).join(" + ");
  const delta = transition.costDelta >= 0 ? `+${transition.costDelta}` : transition.costDelta;

  return `${fromNames} → ${toNames} (${delta}g)`;
};

// ─────────────────────────────────────────────────────────────
// Component Pool / Disassembly Functions
// ─────────────────────────────────────────────────────────────

/**
 * Disassemble a loadout into a component pool.
 * 
 * This simulates Gyrocopter's innate ability to disassemble items:
 * - All assembled items are broken down into base components
 * - Recipes are sold for 100% gold recovery
 * - Base components become available for reassembly
 *
 * @param loadout - The loadout to disassemble
 * @param repo - ItemRepository for component resolution
 * @returns ComponentPool representing available components and recipe gold
 *
 * @example
 * ```ts
 * // Bracer + Pavise loadout
 * const pool = disassembleLoadout(loadout, repo);
 * // pool.components = ['circlet', 'gauntlets', 'recipe_bracer', 'ring_of_protection', 'buckler']
 * // Actually no - recipes aren't components, they're sold
 * // pool.components = ['circlet', 'gauntlets', 'ring_of_protection', ...]
 * // pool.recipeRecovery = sum of recipe costs
 * ```
 */
export const disassembleLoadout = (
  loadout: Loadout,
  repo: ItemRepository
): ComponentPool => {
  // Get all base components from assembled items
  const components = [...loadout.components];
  
  // IMPORTANT: Also include leftover components from previous stage!
  // These are components that weren't used in assembled items but were retained.
  // When we disassemble this loadout, those leftovers go back into the pool.
  if (loadout.leftoverComponents && loadout.leftoverComponents.length > 0) {
    for (const leftover of loadout.leftoverComponents) {
      // Leftover components are base components, so we add them by name
      components.push(leftover.name);
    }
  }
  
  // Calculate recipe recovery (100% of recipe cost - Gyro innate)
  const recipeRecovery = sumBy([...loadout.items], (item) => repo.getRecipeCost(item));
  
  // Calculate total component value
  const totalValue = repo.getComponentsGoldValue(components);
  
  // Rebuild component counts to include leftovers
  const componentCounts = countBy(components, (c) => c);
  
  return {
    components,
    componentCounts,
    totalValue,
    recipeRecovery,
  };
};

/**
 * Result of planning an assembly from a component pool.
 */
export interface AssemblyPlan {
  /** Whether the assembly is valid (within budget) */
  isValid: boolean;
  /** Components from pool used in assembled items */
  usedFromPool: string[];
  /** Components from pool NOT used in assembled items (become leftovers) */
  leftoverFromPool: string[];
  /** New components that must be purchased */
  newComponentsToBuy: string[];
  /** Cost of new components to purchase */
  newComponentsCost: number;
  /** Recipe cost for assembled items */
  newRecipeCost: number;
  /** Total new gold needed (newComponentsCost + newRecipeCost) */
  totalNewGoldNeeded: number;
  /** Total cost of the resulting loadout (assembled items + leftovers) */
  totalLoadoutCost: number;
}

/**
 * Plan an assembly of items from a component pool.
 * 
 * This calculates how to build a set of items given:
 * - An existing component pool (from disassembling previous stage)
 * - New components that can be purchased within budget
 * 
 * Key rules:
 * - ALL pool components must be retained (either in assembled items or as leftovers)
 * - No pool components can be sold/wasted
 * - Leftover components count toward total cost but not item limit
 * 
 * @param items - Items to assemble
 * @param pool - Available component pool from previous stage
 * @param repo - ItemRepository for component resolution
 * @param maxTotalCost - Maximum total cost for this stage (optional)
 * @returns AssemblyPlan with detailed breakdown
 */
export const planAssemblyFromPool = (
  items: readonly Item[],
  pool: ComponentPool,
  repo: ItemRepository,
  maxTotalCost?: number
): AssemblyPlan => {
  // Get all components needed for the new items
  const neededComponents = items.flatMap((item) => repo.getBaseComponents(item));
  const neededCounts = countBy(neededComponents, (c) => c);
  
  // Track which pool components get used in assembled items
  const availableCounts = { ...pool.componentCounts };
  const usedFromPool: string[] = [];
  const newComponentsToBuy: string[] = [];
  
  // For each needed component, use from pool first, then buy new
  for (const [comp, needed] of Object.entries(neededCounts)) {
    const available = availableCounts[comp] ?? 0;
    const fromPool = Math.min(available, needed);
    const mustBuy = needed - fromPool;
    
    // Mark components as used from pool
    for (let i = 0; i < fromPool; i++) {
      usedFromPool.push(comp);
    }
    availableCounts[comp] = available - fromPool;
    
    // Track what needs to be purchased
    for (let i = 0; i < mustBuy; i++) {
      newComponentsToBuy.push(comp);
    }
  }
  
  // Leftover components = pool components not used in assembled items
  // These are RETAINED, not wasted - they stay in the loadout
  const leftoverFromPool: string[] = [];
  for (const [comp, count] of Object.entries(availableCounts)) {
    for (let i = 0; i < count; i++) {
      leftoverFromPool.push(comp);
    }
  }
  
  // Calculate costs
  const newComponentsCost = repo.getComponentsGoldValue(newComponentsToBuy);
  const newRecipeCost = sumBy([...items], (item) => repo.getRecipeCost(item));
  const totalNewGoldNeeded = newComponentsCost + newRecipeCost;
  
  // Total loadout cost = assembled items cost + leftover components cost
  // This represents the total gold value of what we're holding
  const assembledCost = sumBy([...items], (item) => item.cost);
  const leftoverCost = repo.getComponentsGoldValue(leftoverFromPool);
  const totalLoadoutCost = assembledCost + leftoverCost;
  
  // Check if within budget
  // The constraint is that the total value of items + leftovers <= maxTotalCost
  // 
  // Note: Recipe recovery from the previous stage is "profit" - we get that gold back.
  // But it doesn't increase our budget, it just means we spend less NET gold.
  // The maxTotalCost is a hard cap on what we're holding.
  const isValid = maxTotalCost === undefined || totalLoadoutCost <= maxTotalCost;
  
  return {
    isValid,
    usedFromPool,
    leftoverFromPool,
    newComponentsToBuy,
    newComponentsCost,
    newRecipeCost,
    totalNewGoldNeeded,
    totalLoadoutCost,
  };
};

/**
 * Find all items that can be assembled using ONLY components from a pool.
 * 
 * This is a key function for the progression search - it finds items
 * that use components we already have.
 *
 * @param pool - Available component pool
 * @param repo - ItemRepository
 * @param maxCost - Maximum item cost to consider
 * @returns Items that can be fully assembled from the pool
 */
export const findAssemblableItems = (
  pool: ComponentPool,
  repo: ItemRepository,
  maxCost?: number
): Item[] => {
  const assemblable: Item[] = [];
  const allItems = repo.getAllUpgradedItems();
  
  for (const item of allItems) {
    if (maxCost !== undefined && item.cost > maxCost) continue;
    
    const components = repo.getBaseComponents(item);
    const neededCounts = countBy(components, (c) => c);
    
    // Check if all needed components are available in pool
    let canAssemble = true;
    for (const [comp, needed] of Object.entries(neededCounts)) {
      const available = pool.componentCounts[comp] ?? 0;
      if (available < needed) {
        canAssemble = false;
        break;
      }
    }
    
    if (canAssemble) {
      assemblable.push(item);
    }
  }
  
  return assemblable;
};

/**
 * Create a loadout from items AND leftover components.
 * 
 * Allocation logic:
 * - Assembled items prioritized for inventory (up to inventorySlots)
 * - Excess assembled items + leftovers go to backpack (up to backpackSlots)
 * - Remainder goes to sold
 * 
 * @param assembledItems - Items that were assembled
 * @param leftoverComponentNames - Component names that weren't used
 * @param repo - ItemRepository
 * @param statValuation - Optional stat valuations
 * @param slotOptions - Optional inventory/backpack slot limits
 * @returns Loadout with leftover components tracked
 */
export const createLoadoutWithLeftovers = (
  assembledItems: Item[],
  leftoverComponentNames: string[],
  repo: ItemRepository,
  statValuation?: StatValuation,
  slotOptions?: SlotOptions
): Loadout => {
  // Resolve leftover component names to Item objects
  const leftoverComponents: Item[] = [];
  for (const compName of leftoverComponentNames) {
    const item = repo.getByName(compName);
    if (item) {
      leftoverComponents.push(item);
    }
  }
  
  // Allocate slots
  const inventorySlots = slotOptions?.inventorySlots ?? 6;
  const backpackSlots = slotOptions?.backpackSlots ?? 3;
  
  // Assembled items get priority for inventory
  const inventoryItems = assembledItems.slice(0, inventorySlots);
  const excessAssembled = assembledItems.slice(inventorySlots);
  
  // Sort leftovers by cost (descending) for backpack
  const sortedLeftovers = [...leftoverComponents].sort((a, b) => b.cost - a.cost);
  
  // Combine excess assembled + leftovers and sort by cost for backpack
  const backpackCandidates = [...excessAssembled, ...sortedLeftovers].sort((a, b) => b.cost - a.cost);
  const backpackItems = backpackCandidates.slice(0, backpackSlots);
  const soldItems = backpackCandidates.slice(backpackSlots);
  
  // Calculate sold recovery (50% for regular items, 100% for recipes)
  const soldRecovery = sumBy(soldItems, (item) => {
    const isRecipe = item.name.startsWith("recipe_");
    return isRecipe ? item.cost : Math.floor(item.cost / 2);
  });
  
  // Get components from retained items only (inventory + backpack)
  const retainedItems = [...inventoryItems, ...backpackItems];
  const components = retainedItems.flatMap((i) => repo.getBaseComponents(i));
  
  // Calculate stats ONLY from inventory
  const totalStatValue = statValuation ? calculateItemsStatValue(inventoryItems, statValuation) : 0;
  
  // Calculate costs
  const inventoryCost = sumBy(inventoryItems, (i) => i.cost);
  const backpackCost = sumBy(backpackItems, (i) => i.cost);
  const soldCost = sumBy(soldItems, (i) => i.cost);
  const totalCost = inventoryCost + backpackCost;
  const grossCost = inventoryCost + backpackCost + soldCost;
  const netInvestedCost = grossCost - soldRecovery;
  
  // Efficiency = StatValue / InvestedCost
  const efficiency = netInvestedCost > 0 && statValuation ? totalStatValue / netInvestedCost : 0;
  
  return {
    items: retainedItems,
    inventory: inventoryItems,
    backpack: backpackItems,
    sold: soldItems,
    soldRecovery,
    netWorth: totalCost,
    totalCost,
    components,
    componentCounts: countBy(components, (c) => c),
    totalStatValue,
    efficiency,
    totalInvestedCost: netInvestedCost,
  };
};

/**
 * Calculate the budget available for purchasing new components.
 * 
 * When transitioning to a new stage:
 * - We have pool.totalValue in components that MUST be retained
 * - We get pool.recipeRecovery back from selling recipes
 * - Budget for new purchases = maxCost - pool.totalValue + pool.recipeRecovery
 * 
 * Note: This is the budget for NEW components + NEW recipes.
 * Leftover components (from pool but not in assembled items) 
 * count toward maxCost but don't require new purchases.
 *
 * @param maxCost - Maximum total cost for the stage
 * @param pool - Component pool from previous stage
 * @returns Available gold for new component and recipe purchases
 */
export const calculateNewComponentBudget = (
  maxCost: number,
  pool: ComponentPool
): number => {
  // pool.totalValue = gold we already have invested in components
  // pool.recipeRecovery = gold we get back from selling recipes
  // 
  // New stage total cost = pool.totalValue + newPurchases - recipeRecovery
  // (because leftovers come from pool but we "pay" for new stuff)
  // Wait, that's not quite right either.
  //
  // Let's think step by step:
  // - Previous stage cost = pool.totalValue + recipes (but recipes are recovered)
  // - New stage cost = cost of assembled items + cost of leftover components
  // - Leftover components come from pool (no new purchase needed)
  // - Assembled items need: some components from pool + new components + new recipes
  //
  // Budget for new purchases = maxCost + recipeRecovery - pool.totalValue
  // Because:
  //   New stage total = pool.totalValue (retained) + newComponents + newRecipes
  //   We want: newComponents + newRecipes <= maxCost + recipeRecovery - pool.totalValue
  //
  // Actually simpler: 
  //   totalNewGoldNeeded <= maxCost - (pool.totalValue - pool.recipeRecovery)
  //   totalNewGoldNeeded <= maxCost - pool.totalValue + pool.recipeRecovery
  
  return maxCost - pool.totalValue + pool.recipeRecovery;
};
