/**
 * Stage-level scorer functions for build sequence analysis.
 *
 * Stage scorers evaluate the quality of a BuildStage, considering both
 * the loadout itself and the transition from the previous stage.
 * This allows unified scoring across initial builds and upgrade stages.
 */

import {
  BuildStage,
  StageScorer,
  TransitionScorer,
  Loadout,
  BuildSequence,
} from "../models/buildTypes";
import { StatValuation } from "../models/types";
import { clamp, meanBy, sumBy } from "es-toolkit";
import { calculateItemEfficiency } from "./efficiency";
import { calculateUtilityValue } from "./utility";
import {
  reuseEfficiencyScore,
  wasteAvoidanceScore,
  costDeltaScore,
  transitionAffordabilityScore,
  createImprovedScorer,
} from "./scorers";

// ─────────────────────────────────────────────────────────────
// Scorer Adapters
// ─────────────────────────────────────────────────────────────

/**
 * Convert an existing transition scorer to a stage scorer.
 *
 * For initial stages (no transition), returns a default score.
 * For upgrade stages, applies the transition scorer.
 *
 * @param ts - Transition scorer to adapt
 * @param initialStageScore - Score to return for initial stages (default: 0.5)
 * @returns Stage scorer
 *
 * @example
 * ```ts
 * const stageScorer = fromTransitionScorer(reuseEfficiencyScore);
 * stageScorer(initialStage, null); // 0.5 (default)
 * stageScorer(upgradeStage, prev); // reuse efficiency of the transition
 * ```
 */
export const fromTransitionScorer = (
  ts: TransitionScorer,
  initialStageScore = 0.5
): StageScorer =>
  (stage) => {
    if (!stage.transition) return initialStageScore;
    return ts(stage.transition);
  };

// ─────────────────────────────────────────────────────────────
// Loadout-Based Scorers (work for any stage)
// ─────────────────────────────────────────────────────────────

/**
 * Score by loadout efficiency (stat value / cost).
 *
 * Higher efficiency means better value for money.
 * Works for any stage since all stages have a loadout.
 *
 * @param maxEfficiency - Maximum efficiency for normalization (default: 1.5)
 * @returns Stage scorer returning 0-1
 */
export const loadoutEfficiencyScore = (maxEfficiency = 1.5): StageScorer =>
  (stage) => clamp(stage.loadout.efficiency / maxEfficiency, 0, 1);

/**
 * Score by how well the budget is utilized.
 *
 * A score of 1 means the loadout cost exactly matches the threshold.
 * Lower scores indicate underutilization of available budget.
 * 
 * Uses totalInvestedCost if available (includes leftover components),
 * otherwise falls back to totalCost.
 *
 * @returns Stage scorer returning 0-1
 */
export const budgetUtilizationScore: StageScorer = (stage) => {
  const cost = stage.loadout.totalInvestedCost ?? stage.loadout.totalCost;
  return stage.costThreshold > 0
    ? clamp(cost / stage.costThreshold, 0, 1)
    : 0;
};

/**
 * Score by inverse budget utilization (budget remaining).
 *
 * Higher scores for loadouts that cost less than the threshold.
 * Useful when you want to leave room for situational purchases.
 * 
 * Uses totalInvestedCost if available (includes leftover components),
 * otherwise falls back to totalCost.
 *
 * @returns Stage scorer returning 0-1
 */
export const budgetRemainingScore: StageScorer = (stage) => {
  const cost = stage.loadout.totalInvestedCost ?? stage.loadout.totalCost;
  return stage.costThreshold > 0
    ? clamp(1 - cost / stage.costThreshold, 0, 1)
    : 1;
};

/**
 * Score by average item efficiency in the loadout.
 *
 * @param statValuation - Stat valuations for efficiency calculation
 * @param maxEfficiency - Maximum efficiency for normalization
 * @returns Stage scorer returning 0-1
 */
export const averageItemEfficiencyScore = (
  statValuation: StatValuation,
  maxEfficiency = 1.5
): StageScorer =>
  (stage) => {
    if (stage.loadout.items.length === 0) return 0;

    const avgEfficiency = meanBy(
      [...stage.loadout.items],
      (item) => calculateItemEfficiency(item, statValuation).efficiencyWithUtility
    );

    return clamp(avgEfficiency / maxEfficiency, 0, 1);
  };

/**
 * Score by total utility value of items in the loadout.
 *
 * Rewards loadouts with useful actives/passives beyond raw stats.
 *
 * @param maxUtilityValue - Maximum utility for normalization
 * @returns Stage scorer returning 0-1
 */
export const loadoutUtilityScore = (maxUtilityValue = 3000): StageScorer =>
  (stage) => {
    if (stage.loadout.items.length === 0) return 0;

    const totalUtility = sumBy(
      [...stage.loadout.items],
      (item) => calculateUtilityValue(item.name)
    );

    return clamp(totalUtility / maxUtilityValue, 0, 1);
  };

/**
 * Score by total stat value of the loadout.
 *
 * @param maxStatValue - Maximum stat value for normalization
 * @returns Stage scorer returning 0-1
 */
export const loadoutStatValueScore = (maxStatValue = 10000): StageScorer =>
  (stage) => clamp(stage.loadout.totalStatValue / maxStatValue, 0, 1);

// ─────────────────────────────────────────────────────────────
// Transition-Based Scorers (for upgrade stages)
// ─────────────────────────────────────────────────────────────

/**
 * Score by component reuse from previous stage.
 *
 * Higher scores for transitions that reuse more components.
 * Returns a neutral score for initial stages.
 */
export const stageReuseScore: StageScorer = fromTransitionScorer(
  reuseEfficiencyScore,
  0.5
);

/**
 * Score by waste avoidance from previous stage.
 *
 * Higher scores for transitions that waste fewer components.
 * Returns a neutral score for initial stages.
 */
export const stageWasteAvoidanceScore: StageScorer = fromTransitionScorer(
  wasteAvoidanceScore,
  0.5
);

/**
 * Score by cost delta (upgrade size).
 *
 * @param maxDelta - Maximum delta for normalization
 * @returns Stage scorer returning 0-1
 */
export const stageCostDeltaScore = (maxDelta: number): StageScorer =>
  fromTransitionScorer(costDeltaScore(maxDelta), 0.5);

/**
 * Score by transition affordability.
 *
 * @param maxGoldNeeded - Maximum gold needed for normalization
 * @returns Stage scorer returning 0-1
 */
export const stageAffordabilityScore = (maxGoldNeeded: number): StageScorer =>
  fromTransitionScorer(transitionAffordabilityScore(maxGoldNeeded), 0.5);

/**
 * Score by gold needed per value gained.
 *
 * Measures how efficiently gold is spent in the transition.
 * Lower gold needed per stat value = higher score.
 *
 * @param maxRatio - Maximum ratio for normalization (default: 2)
 * @returns Stage scorer returning 0-1
 */
export const transitionValueEfficiencyScore = (maxRatio = 2): StageScorer =>
  (stage, prev) => {
    if (!stage.transition || !prev) return 0.5;

    const valueGain = stage.loadout.totalStatValue - prev.loadout.totalStatValue;
    const goldSpent = stage.transition.componentFlow.totalGoldNeeded;

    if (goldSpent <= 0) return 1; // Free transition = perfect
    if (valueGain <= 0) return 0; // No value gain = bad

    const efficiency = valueGain / goldSpent;
    return clamp(efficiency / maxRatio, 0, 1);
  };

// ─────────────────────────────────────────────────────────────
// Scorer Combinators
// ─────────────────────────────────────────────────────────────

/**
 * Weighted combination of stage scorers.
 *
 * @param scorers - Array of { scorer, weight } pairs
 * @returns Combined scorer
 *
 * @example
 * ```ts
 * const balanced = weightedStageScore([
 *   { scorer: stageReuseScore, weight: 0.3 },
 *   { scorer: loadoutEfficiencyScore(), weight: 0.4 },
 *   { scorer: budgetUtilizationScore, weight: 0.3 },
 * ]);
 * ```
 */
export const weightedStageScore = (
  scorers: Array<{ scorer: StageScorer; weight: number }>
): StageScorer =>
  (stage, prev) =>
    sumBy(scorers, ({ scorer, weight }) => scorer(stage, prev) * weight);

/**
 * Maximum of multiple stage scorers.
 *
 * @param scorers - Scorers to compare
 * @returns Combined scorer returning max value
 */
export const maxStageScore = (...scorers: StageScorer[]): StageScorer =>
  (stage, prev) => Math.max(...scorers.map((s) => s(stage, prev)));

/**
 * Minimum of multiple stage scorers.
 *
 * @param scorers - Scorers to compare
 * @returns Combined scorer returning min value
 */
export const minStageScore = (...scorers: StageScorer[]): StageScorer =>
  (stage, prev) => Math.min(...scorers.map((s) => s(stage, prev)));

/**
 * Average of multiple stage scorers.
 *
 * @param scorers - Scorers to average
 * @returns Combined scorer returning mean value
 */
export const averageStageScore = (...scorers: StageScorer[]): StageScorer =>
  (stage, prev) => {
    if (scorers.length === 0) return 0;
    return scorers.reduce((sum, s) => sum + s(stage, prev), 0) / scorers.length;
  };

/**
 * Apply a transformation to a scorer's output.
 *
 * @param scorer - Base scorer
 * @param transform - Transformation function
 * @returns Transformed scorer
 */
export const transformStageScore = (
  scorer: StageScorer,
  transform: (score: number) => number
): StageScorer =>
  (stage, prev) => transform(scorer(stage, prev));

/**
 * Clamp a scorer's output to a range.
 *
 * @param scorer - Base scorer
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped scorer
 */
export const clampStageScore = (
  scorer: StageScorer,
  min: number,
  max: number
): StageScorer =>
  (stage, prev) => clamp(scorer(stage, prev), min, max);

// ─────────────────────────────────────────────────────────────
// Pre-Built Stage Scorer Configurations
// ─────────────────────────────────────────────────────────────

/**
 * Create a balanced stage scorer.
 *
 * For initial stages: scores based on loadout quality and budget usage.
 * For upgrade stages: includes transition efficiency.
 *
 * @param statValuation - Stat valuations for efficiency calculations
 * @returns Balanced stage scorer
 */
export const createBalancedStageScorer = (
  statValuation: StatValuation
): StageScorer => {
  const improvedTransitionScorer = createImprovedScorer(statValuation);

  return (stage, prev) => {
    // For initial stage, score based on loadout quality
    if (!stage.transition) {
      return weightedStageScore([
        { scorer: averageItemEfficiencyScore(statValuation), weight: 0.4 },
        { scorer: loadoutUtilityScore(2500), weight: 0.2 },
        { scorer: budgetUtilizationScore, weight: 0.4 },
      ])(stage, prev);
    }

    // For upgrade stages, combine transition quality with loadout quality
    const transitionScore = improvedTransitionScorer(stage.transition);
    const loadoutScore = averageItemEfficiencyScore(statValuation)(stage, prev);
    const budgetScore = budgetUtilizationScore(stage, prev);

    return transitionScore * 0.5 + loadoutScore * 0.3 + budgetScore * 0.2;
  };
};

/**
 * Create a reuse-focused stage scorer.
 *
 * Prioritizes component reuse over other factors.
 * Good for maximizing gold efficiency.
 *
 * @param statValuation - Stat valuations for efficiency calculations
 * @returns Reuse-focused stage scorer
 */
export const createReuseStageScorer = (
  statValuation: StatValuation
): StageScorer =>
  (stage, prev) => {
    if (!stage.transition) {
      // Initial stage: prefer efficient items
      return averageItemEfficiencyScore(statValuation)(stage, prev);
    }

    // Upgrade stages: heavily weight reuse
    return weightedStageScore([
      { scorer: stageReuseScore, weight: 0.5 },
      { scorer: stageWasteAvoidanceScore, weight: 0.3 },
      { scorer: averageItemEfficiencyScore(statValuation), weight: 0.2 },
    ])(stage, prev);
  };

/**
 * Create a value-focused stage scorer.
 *
 * Prioritizes stat value gain over gold efficiency.
 * Good for cores who farm quickly.
 *
 * @param statValuation - Stat valuations for efficiency calculations
 * @returns Value-focused stage scorer
 */
export const createValueStageScorer = (
  statValuation: StatValuation
): StageScorer =>
  (stage, prev) => {
    if (!stage.transition) {
      return weightedStageScore([
        { scorer: loadoutStatValueScore(5000), weight: 0.6 },
        { scorer: budgetUtilizationScore, weight: 0.4 },
      ])(stage, prev);
    }

    return weightedStageScore([
      { scorer: transitionValueEfficiencyScore(2), weight: 0.4 },
      { scorer: loadoutStatValueScore(10000), weight: 0.4 },
      { scorer: stageReuseScore, weight: 0.2 },
    ])(stage, prev);
  };

/**
 * Create an economy-focused stage scorer.
 *
 * Prioritizes affordable transitions and leaving budget room.
 * Good for supports with limited farm.
 *
 * @param statValuation - Stat valuations for efficiency calculations
 * @returns Economy-focused stage scorer
 */
export const createEconomyStageScorer = (
  statValuation: StatValuation
): StageScorer =>
  (stage, prev) => {
    if (!stage.transition) {
      return weightedStageScore([
        { scorer: averageItemEfficiencyScore(statValuation), weight: 0.5 },
        { scorer: loadoutUtilityScore(2000), weight: 0.3 },
        { scorer: budgetRemainingScore, weight: 0.2 },
      ])(stage, prev);
    }

    return weightedStageScore([
      { scorer: stageAffordabilityScore(3000), weight: 0.3 },
      { scorer: stageReuseScore, weight: 0.3 },
      { scorer: averageItemEfficiencyScore(statValuation), weight: 0.2 },
      { scorer: loadoutUtilityScore(2000), weight: 0.2 },
    ])(stage, prev);
  };

// ─────────────────────────────────────────────────────────────
// Sequence Scoring
// ─────────────────────────────────────────────────────────────

/**
 * Score an entire build sequence.
 *
 * Computes per-stage scores and aggregates them.
 *
 * @param sequence - The build sequence to score
 * @param scorer - Stage scorer to use
 * @returns Object with total score and per-stage scores
 */
export const scoreSequence = (
  sequence: BuildSequence,
  scorer: StageScorer
): { total: number; perStage: number[] } => {
  const perStage = sequence.stages.map((stage, i) =>
    scorer(stage, i > 0 ? sequence.stages[i - 1] : null)
  );

  // Average of all stage scores
  const total =
    perStage.length > 0
      ? perStage.reduce((sum, s) => sum + s, 0) / perStage.length
      : 0;

  return { total, perStage };
};

/**
 * Score stages and return a new sequence with updated scores.
 *
 * @param stages - Array of build stages
 * @param scorer - Stage scorer to use
 * @returns BuildSequence with computed scores
 */
export const createScoredSequence = (
  stages: readonly BuildStage[],
  scorer: StageScorer
): BuildSequence => {
  const stageScores = stages.map((stage, i) =>
    scorer(stage, i > 0 ? stages[i - 1] : null)
  );

  const totalScore =
    stageScores.length > 0
      ? stageScores.reduce((sum, s) => sum + s, 0) / stageScores.length
      : 0;

  return {
    stages,
    totalScore,
    stageScores,
  };
};

/**
 * Create a sequence scorer that uses different weights for different stages.
 *
 * @param stageWeights - Weights for each stage (index 0 = first stage)
 * @param scorer - Base stage scorer
 * @returns Function that scores a sequence with weighted stages
 */
export const createWeightedSequenceScorer = (
  stageWeights: readonly number[],
  scorer: StageScorer
): ((stages: readonly BuildStage[]) => number) => {
  return (stages) => {
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < stages.length; i++) {
      const weight = stageWeights[i] ?? 1;
      const score = scorer(stages[i], i > 0 ? stages[i - 1] : null);
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  };
};
