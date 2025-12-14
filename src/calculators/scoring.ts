import { SynergyWeights } from "../config/analysisConfig";
import { sumBy, meanBy, clamp } from "es-toolkit";

/**
 * Inputs for synergy score calculation
 */
export interface SynergyScoreInputs {
  /** Best gold contribution percentage to any single late item */
  bestGoldContribution: number;
  /** Combined stat+utility value of early items */
  combinedValue: number;
  /** Combined cost of early items */
  combinedCost: number;
  /** Average gold recovery percentage */
  averageRecovery: number;
  /** Number of shared upgrade targets */
  sharedTargetCount: number;
  /** Number of targets where all items contribute (optional, for trios) */
  threeWayTargetCount?: number;
}

/**
 * Calculate synergy score for an item combination.
 * Score is normalized to roughly 0-1 range.
 */
export function calculateSynergyScore(
  inputs: SynergyScoreInputs,
  weights: SynergyWeights
): number {
  const {
    bestGoldContribution,
    combinedValue,
    combinedCost,
    averageRecovery,
    sharedTargetCount,
    threeWayTargetCount = 0,
  } = inputs;

  // Normalize shared targets (cap at 5 for full credit)
  const normalizedSharedTargets = clamp(sharedTargetCount / 5, 0, 1);

  // Normalize three-way targets (cap at 3 for full credit)
  const normalizedThreeWay = clamp(threeWayTargetCount / 3, 0, 1);

  // Value efficiency (value per gold spent)
  const valueEfficiency = combinedCost > 0 ? combinedValue / combinedCost : 0;

  // Calculate weighted score
  const score =
    bestGoldContribution * weights.goldContribution +
    valueEfficiency * weights.valueEfficiency +
    averageRecovery * weights.recovery +
    normalizedSharedTargets * weights.sharedTargets +
    normalizedThreeWay * weights.threeWayBonus;

  return score;
}

/**
 * Combined metrics for a set of early item analyses
 */
export interface EarlyItemMetrics {
  combinedCost: number;
  combinedValue: number;
  totalWastedGold: number;
  averageRecovery: number;
}

/**
 * Calculate combined metrics for a set of early item analyses
 */
export function calculateEarlyItemMetrics(
  items: { item: { cost: number }; totalValue: number; wastedGold: number; goldEfficiency: number }[]
): EarlyItemMetrics {
  const combinedCost = sumBy(items, (i) => i.item.cost);
  const combinedValue = sumBy(items, (i) => i.totalValue);
  const totalWastedGold = sumBy(items, (i) => i.wastedGold);
  const averageRecovery = items.length > 0
    ? meanBy(items, (i) => i.goldEfficiency)
    : 0;

  return {
    combinedCost,
    combinedValue,
    totalWastedGold,
    averageRecovery,
  };
}
