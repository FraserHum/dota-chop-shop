import { Item, ItemStats, StatValuation, EfficiencyResult } from "../models/types";
import { calculateStatValuation } from "./statValuation";
import { calculateUtilityValue } from "./utility";
import { orderBy, partition, minBy, maxBy } from "es-toolkit";

/**
 * Options for efficiency calculation
 */
export interface EfficiencyOptions {
  /**
   * Multiplier for aura stats to account for team-wide benefit.
   * 1.0 = solo (only affects yourself)
   * 2.5 = average teamfight (yourself + ~1.5 teammates in range)
   * 5.0 = full team (yourself + 4 teammates)
   * Default: 1.0
   */
  auraMultiplier?: number;
}

/**
 * Calculate the gold efficiency of a single item
 */
export function calculateItemEfficiency(
  item: Item,
  statValuation: StatValuation,
  options: EfficiencyOptions = {}
): EfficiencyResult {
  const { auraMultiplier = 1.0 } = options;
  const statBreakdown: EfficiencyResult["statBreakdown"] = [];
  let totalStatValue = 0;

  // Process base stats
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

  // Process aura stats with multiplier
  for (const [stat, amount] of Object.entries(item.auraStats) as [keyof ItemStats, number][]) {
    if (amount === undefined || amount === 0) continue;

    const goldPerPoint = statValuation[stat] || 0;
    const effectiveAmount = amount * auraMultiplier;
    const goldValue = effectiveAmount * goldPerPoint;

    statBreakdown.push({
      stat,
      amount: effectiveAmount,
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
export function getItemsByEfficiency(items: Item[], options: EfficiencyOptions = {}): EfficiencyResult[] {
  const { auraMultiplier = 1.0 } = options;
  const statValuation = calculateStatValuation(items);
  const results = items.map((item) => calculateItemEfficiency(item, statValuation, { auraMultiplier }));
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
export function getItemsByValue(items: Item[], options: EfficiencyOptions = {}): ValueRankingResult[] {
  const { auraMultiplier = 1.0 } = options;
  const statValuation = calculateStatValuation(items);
  const results = items.map((item) => calculateItemEfficiency(item, statValuation, { auraMultiplier }));
  
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
    const normalizedEfficiency = efficiencyRange > 0
      ? (result.efficiencyWithUtility - minEfficiency) / efficiencyRange
      : 0;
    
    // Normalize cost: lower is better (0 to 1)
    const normalizedCost = costRange > 0
      ? (maxCost - result.item.cost) / costRange
      : 0;
    
    // Value score = average of both factors
    const valueScore = (normalizedEfficiency + normalizedCost) / 2;
    
    return {
      ...result,
      normalizedEfficiency,
      normalizedCost,
      valueScore,
    };
  });
  
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
