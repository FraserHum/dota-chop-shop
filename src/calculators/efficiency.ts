import { Item, ItemStats, StatValuation, EfficiencyResult } from "../models/types";
import { calculateStatValuation } from "./statValuation";
import { calculateUtilityValue } from "./utility";
import { orderBy, partition, minBy, maxBy } from "es-toolkit";

/**
 * Calculate the gold efficiency of a single item
 */
export function calculateItemEfficiency(
  item: Item,
  statValuation: StatValuation
): EfficiencyResult {
  const statBreakdown: EfficiencyResult["statBreakdown"] = [];
  let totalStatValue = 0;

  for (const [stat, amount] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
    if (amount === undefined || amount === 0) continue;

    const goldPerPoint = statValuation[stat] || 0;
    const goldValue = amount * goldPerPoint;

    statBreakdown.push({
      stat,
      amount,
      goldValue,
    });

    totalStatValue += goldValue;
  }

  // Calculate utility value
  const utilityValue = calculateUtilityValue(item.name);
  
  // Total value = stats + utility
  const totalValue = totalStatValue + utilityValue;

  const efficiency = item.cost > 0 ? totalStatValue / item.cost : 0;
  const efficiencyWithUtility = item.cost > 0 ? totalValue / item.cost : 0;

  return {
    item,
    totalStatValue,
    utilityValue,
    totalValue,
    efficiency,
    efficiencyWithUtility,
    statBreakdown,
  };
}

/**
 * Calculate efficiency for all items, sorted by efficiency (highest first)
 */
export function getItemsByEfficiency(items: Item[]): EfficiencyResult[] {
  const statValuation = calculateStatValuation(items);
  const results = items.map((item) => calculateItemEfficiency(item, statValuation));
  return orderBy(results, ['efficiency'], ['desc']);
}

/**
 * Result type for value ranking that combines efficiency and cost
 */
export interface ValueRankingResult extends EfficiencyResult {
  normalizedEfficiency: number;
  normalizedCost: number;
  valueScore: number;
}

/**
 * Calculate a combined value score that weights efficiency and cost equally.
 * 
 * For two items with the same efficiency, the cheaper one ranks higher.
 * Uses min-max normalization so both factors contribute equally.
 * Uses efficiencyWithUtility to account for active abilities.
 */
export function getItemsByValue(items: Item[]): ValueRankingResult[] {
  const statValuation = calculateStatValuation(items);
  const results = items.map((item) => calculateItemEfficiency(item, statValuation));
  
  // Filter out items with zero total value (no stats and no utility)
  const validResults = results.filter(r => r.totalValue > 0);
  
  if (validResults.length === 0) return [];
  
  // Find min/max for normalization (use efficiencyWithUtility)
  const minEffResult = minBy(validResults, r => r.efficiencyWithUtility)!;
  const maxEffResult = maxBy(validResults, r => r.efficiencyWithUtility)!;
  const minCostResult = minBy(validResults, r => r.item.cost)!;
  const maxCostResult = maxBy(validResults, r => r.item.cost)!;
  
  const minEfficiency = minEffResult.efficiencyWithUtility;
  const maxEfficiency = maxEffResult.efficiencyWithUtility;
  const minCost = minCostResult.item.cost;
  const maxCost = maxCostResult.item.cost;
  
  const efficiencyRange = maxEfficiency - minEfficiency || 1;
  const costRange = maxCost - minCost || 1;
  
  // Calculate value scores
  const valueResults: ValueRankingResult[] = validResults.map(result => {
    // Normalize efficiency (with utility): higher is better (0 to 1)
    const normalizedEfficiency = (result.efficiencyWithUtility - minEfficiency) / efficiencyRange;
    
    // Normalize cost: lower is better, so invert (0 to 1, where 1 = cheapest)
    const normalizedCost = 1 - (result.item.cost - minCost) / costRange;
    
    // Equal weight: average of both normalized scores
    const valueScore = (normalizedEfficiency + normalizedCost) / 2;
    
    return {
      ...result,
      normalizedEfficiency,
      normalizedCost,
      valueScore,
    };
  });
  
  // Sort by value score (highest first)
  return orderBy(valueResults, ['valueScore'], ['desc']);
}

/**
 * Split value rankings into component (simple) items and upgraded items
 */
export function getItemsByValueSplit(items: Item[]): {
  simpleItems: ValueRankingResult[];
  upgradedItems: ValueRankingResult[];
} {
  const allResults = getItemsByValue(items);
  const [simpleItems, upgradedItems] = partition(allResults, r => r.item.isComponent);
  
  return { simpleItems, upgradedItems };
}
