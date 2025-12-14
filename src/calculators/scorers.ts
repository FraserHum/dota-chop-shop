/**
 * Scorer functions for ranking loadout transitions.
 *
 * Scorers produce numeric values that can be used to rank transitions.
 * They can be composed using combinators like weightedScore() and maxScore().
 */

import { Item, StatValuation } from "../models/types";
import { TransitionScorer } from "../models/buildTypes";
import { sumBy, clamp, meanBy } from "es-toolkit";
import { calculateItemEfficiency } from "./efficiency";
import { calculateUtilityValue } from "./utility";

// ─────────────────────────────────────────────────────────────
// Core Scorers
// ─────────────────────────────────────────────────────────────

/**
 * Score by component reuse efficiency.
 *
 * Returns the percentage of early game gold that is preserved
 * in the final build through component reuse.
 * 
 * **Important**: Includes recipe gold recovery (Gyro innate: 100% recipe refund).
 * Total recovered = reusedGold (components) + recoveredRecipeCost (recipes)
 *
 * @returns Score from 0 (no reuse) to 1 (full reuse)
 *
 * @example
 * ```ts
 * const score = reuseEfficiencyScore(transition);
 * // 0.8 means 80% of early gold was recovered (components + recipes)
 * ```
 */
export const reuseEfficiencyScore: TransitionScorer = (t) => {
  if (t.from.totalCost <= 0) return 0;
  // Total recovered = reused components + recipe refunds
  const totalRecovered = t.componentFlow.reusedGold + t.componentFlow.recoveredRecipeCost;
  return totalRecovered / t.from.totalCost;
};

/**
 * Score by inverse waste (waste avoidance).
 *
 * Returns 1 minus the waste percentage.
 * Higher scores mean less gold was wasted.
 * 
 * **Note**: Only component gold can be "wasted" - recipes are always 100% recovered.
 *
 * @returns Score from 0 (all wasted) to 1 (nothing wasted)
 */
export const wasteAvoidanceScore: TransitionScorer = (t) => {
  if (t.from.totalCost <= 0) return 1;
  // Only component gold can be wasted (recipes are always recovered)
  // wastedGold is already just component waste
  return 1 - t.componentFlow.wastedGold / t.from.totalCost;
};

/**
 * Score by raw gold reused (components only, not including recipe recovery).
 *
 * @returns Absolute gold value of reused components
 */
export const rawReusedGoldScore: TransitionScorer = (t) =>
  t.componentFlow.reusedGold;

/**
 * Score by total gold recovered (components + recipes).
 *
 * @returns Absolute gold value recovered from early build
 */
export const totalRecoveredGoldScore: TransitionScorer = (t) =>
  t.componentFlow.reusedGold + t.componentFlow.recoveredRecipeCost;

/**
 * Score by raw cost delta.
 *
 * @returns Cost difference (can be negative)
 */
export const rawCostDeltaScore: TransitionScorer = (t) => t.costDelta;

// ─────────────────────────────────────────────────────────────
// Parameterized Scorers
// ─────────────────────────────────────────────────────────────

/**
 * Score by normalized cost delta.
 *
 * Normalizes the cost increase to a 0-1 range based on a maximum.
 * Useful for comparing transitions with different cost scales.
 *
 * @param maxDelta - Maximum delta for normalization (e.g., 2000)
 * @returns Score from 0 to 1
 *
 * @example
 * ```ts
 * const scorer = costDeltaScore(2000);
 * scorer(transition); // 0.5 if costDelta is 1000
 * ```
 */
export const costDeltaScore = (maxDelta: number): TransitionScorer => (t) =>
  clamp(t.costDelta / maxDelta, 0, 1);

/**
 * Score by item value gain.
 *
 * Calculates the difference in total value between final and initial loadouts.
 * Requires a function that computes the value of each item.
 *
 * @param getItemValue - Function to compute item value
 * @returns Absolute value gain (can be negative)
 *
 * @example
 * ```ts
 * const scorer = valueGainScore(item => item.stats.strength * 50 + item.cost * 0.5);
 * ```
 */
export const valueGainScore = (
  getItemValue: (item: Item) => number
): TransitionScorer => (t) => {
  const fromValue = sumBy(t.from.items, getItemValue);
  const toValue = sumBy(t.to.items, getItemValue);
  return toValue - fromValue;
};

/**
 * Score by value efficiency (value gained per gold spent).
 *
 * Calculates how much value is gained relative to gold invested.
 * Normalizes to 0-1 range based on maxEfficiency.
 * 
 * **Gold spent** = totalGoldNeeded (new components + net recipe cost)
 *
 * @param getItemValue - Function to compute item value
 * @param maxEfficiency - Maximum efficiency for normalization (default: 2)
 * @returns Score from 0 to 1
 *
 * @example
 * ```ts
 * const scorer = valueEfficiencyScore(item => calculateItemValue(item), 2);
 * ```
 */
export const valueEfficiencyScore = (
  getItemValue: (item: Item) => number,
  maxEfficiency = 2
): TransitionScorer => (t) => {
  const fromValue = sumBy(t.from.items, getItemValue);
  const toValue = sumBy(t.to.items, getItemValue);
  const valueGain = toValue - fromValue;
  // Actual gold needed: new components + net recipe cost (target - recovered)
  const goldSpent = t.componentFlow.totalGoldNeeded;

  if (goldSpent <= 0) return 1; // Free or negative cost = perfect efficiency
  const efficiency = valueGain / goldSpent;
  return clamp(efficiency / maxEfficiency, 0, 1);
};

/**
 * Score by number of components reused.
 *
 * @param maxComponents - Maximum for normalization (default: 6)
 * @returns Score from 0 to 1
 */
export const componentCountScore = (
  maxComponents = 6
): TransitionScorer => (t) =>
  clamp(t.componentFlow.reused.length / maxComponents, 0, 1);

/**
 * Score by final loadout cost.
 *
 * Higher cost finals get higher scores (for "upgrading" preference).
 *
 * @param maxCost - Maximum cost for normalization
 * @returns Score from 0 to 1
 */
export const finalCostScore = (maxCost: number): TransitionScorer => (t) =>
  clamp(t.to.totalCost / maxCost, 0, 1);

/**
 * Score inversely by final loadout cost.
 *
 * Lower cost finals get higher scores (for budget preference).
 *
 * @param maxCost - Maximum cost for normalization
 * @returns Score from 0 to 1
 */
export const budgetFinalScore = (maxCost: number): TransitionScorer => (t) =>
  clamp(1 - t.to.totalCost / maxCost, 0, 1);

/**
 * Score inversely by gold needed to complete the transition.
 *
 * Lower gold needed = higher score. This accounts for both:
 * - New components that need to be purchased
 * - Net recipe cost (target recipes - recovered recipes from disassembly)
 *
 * @param maxGoldNeeded - Maximum gold for normalization
 * @returns Score from 0 to 1
 */
export const transitionAffordabilityScore = (maxGoldNeeded: number): TransitionScorer => (t) =>
  clamp(1 - t.componentFlow.totalGoldNeeded / maxGoldNeeded, 0, 1);

// ─────────────────────────────────────────────────────────────
// Scorer Combinators
// ─────────────────────────────────────────────────────────────

/**
 * Weighted combination of scorers.
 *
 * Combines multiple scorers with weights. Weights don't need to sum to 1.
 *
 * @param scorers - Array of { scorer, weight } pairs
 * @returns Combined scorer
 *
 * @example
 * ```ts
 * const balanced = weightedScore([
 *   { scorer: reuseEfficiencyScore, weight: 0.4 },
 *   { scorer: wasteAvoidanceScore, weight: 0.3 },
 *   { scorer: costDeltaScore(2000), weight: 0.3 },
 * ]);
 * ```
 */
export const weightedScore = (
  scorers: Array<{ scorer: TransitionScorer; weight: number }>
): TransitionScorer => (t) =>
  sumBy(scorers, ({ scorer, weight }) => scorer(t) * weight);

/**
 * Maximum of multiple scorers.
 *
 * Returns the highest score from any of the provided scorers.
 *
 * @param scorers - Scorers to compare
 * @returns Combined scorer returning max value
 */
export const maxScore = (...scorers: TransitionScorer[]): TransitionScorer => (
  t
) => Math.max(...scorers.map((s) => s(t)));

/**
 * Minimum of multiple scorers.
 *
 * Returns the lowest score from any of the provided scorers.
 * Useful for "weakest link" scoring.
 *
 * @param scorers - Scorers to compare
 * @returns Combined scorer returning min value
 */
export const minScore = (...scorers: TransitionScorer[]): TransitionScorer => (
  t
) => Math.min(...scorers.map((s) => s(t)));

/**
 * Average of multiple scorers.
 *
 * @param scorers - Scorers to average
 * @returns Combined scorer returning mean value
 */
export const averageScore = (
  ...scorers: TransitionScorer[]
): TransitionScorer => (t) => {
  if (scorers.length === 0) return 0;
  const sum = scorers.reduce((acc, s) => acc + s(t), 0);
  return sum / scorers.length;
};

/**
 * Product of multiple scorers.
 *
 * Multiplies all scores together. Useful when all factors must be good.
 *
 * @param scorers - Scorers to multiply
 * @returns Combined scorer returning product
 */
export const productScore = (
  ...scorers: TransitionScorer[]
): TransitionScorer => (t) => scorers.reduce((acc, s) => acc * s(t), 1);

/**
 * Apply a transformation to a scorer's output.
 *
 * @param scorer - Base scorer
 * @param transform - Transformation function
 * @returns Transformed scorer
 *
 * @example
 * ```ts
 * // Square the reuse score to penalize low reuse more heavily
 * const penalizedReuse = transformScore(reuseEfficiencyScore, x => x * x);
 * ```
 */
export const transformScore = (
  scorer: TransitionScorer,
  transform: (score: number) => number
): TransitionScorer => (t) => transform(scorer(t));

/**
 * Clamp a scorer's output to a range.
 *
 * @param scorer - Base scorer
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped scorer
 */
export const clampScore = (
  scorer: TransitionScorer,
  min: number,
  max: number
): TransitionScorer => (t) => clamp(scorer(t), min, max);

/**
 * Invert a scorer (1 - score).
 *
 * Useful for converting "bad is high" to "good is high".
 *
 * @param scorer - Base scorer (assumed 0-1 range)
 * @returns Inverted scorer
 */
export const invertScore = (scorer: TransitionScorer): TransitionScorer => (t) =>
  1 - scorer(t);

// ─────────────────────────────────────────────────────────────
// Pre-Built Scorer Configurations
// ─────────────────────────────────────────────────────────────

/**
 * Default balanced scorer.
 *
 * Balances reuse efficiency, waste avoidance, and cost increase.
 * Good general-purpose scorer.
 */
export const defaultTransitionScorer: TransitionScorer = weightedScore([
  { scorer: reuseEfficiencyScore, weight: 0.4 },
  { scorer: wasteAvoidanceScore, weight: 0.3 },
  { scorer: costDeltaScore(2000), weight: 0.3 },
]);

/**
 * Conservative scorer.
 *
 * Prioritizes minimal waste and high reuse over large upgrades.
 * Good for risk-averse play.
 */
export const conservativeScorer: TransitionScorer = weightedScore([
  { scorer: reuseEfficiencyScore, weight: 0.5 },
  { scorer: wasteAvoidanceScore, weight: 0.4 },
  { scorer: costDeltaScore(1500), weight: 0.1 },
]);

/**
 * Aggressive scorer.
 *
 * Prioritizes value gain and large upgrades over efficiency.
 * Good for snowballing games.
 *
 * @param getItemValue - Function to compute item value
 */
export const aggressiveScorer = (
  getItemValue: (item: Item) => number
): TransitionScorer =>
  weightedScore([
    { scorer: reuseEfficiencyScore, weight: 0.2 },
    { scorer: valueEfficiencyScore(getItemValue), weight: 0.5 },
    { scorer: costDeltaScore(3000), weight: 0.3 },
  ]);

/**
 * Economy scorer.
 *
 * Prioritizes minimal cost increase while maximizing reuse.
 * Good for budget-constrained situations.
 */
export const economyScorer: TransitionScorer = weightedScore([
  { scorer: reuseEfficiencyScore, weight: 0.5 },
  { scorer: wasteAvoidanceScore, weight: 0.3 },
  { scorer: invertScore(costDeltaScore(3000)), weight: 0.2 }, // Lower cost = higher score
]);

/**
 * Greedy reuse scorer.
 *
 * Only cares about maximizing component reuse.
 */
export const greedyReuseScorer: TransitionScorer = reuseEfficiencyScore;

// ─────────────────────────────────────────────────────────────
// Early Build Quality Scorers
// ─────────────────────────────────────────────────────────────

/**
 * Score by early build stat efficiency.
 *
 * Evaluates how gold-efficient the early game items are.
 * Higher scores mean the early items provide good stats for their cost.
 *
 * @param statValuation - Pre-calculated stat valuations
 * @param maxEfficiency - Maximum efficiency for normalization (default: 1.5)
 * @returns Score from 0 to 1
 *
 * @example
 * ```ts
 * const scorer = earlyBuildEfficiencyScore(statValuation, 1.5);
 * scorer(transition); // 0.8 if early items average 1.2 efficiency
 * ```
 */
export const earlyBuildEfficiencyScore = (
  statValuation: StatValuation,
  maxEfficiency = 1.5,
  auraMultiplier = 1.0
): TransitionScorer => (t) => {
  if (t.from.items.length === 0) return 0;
  
  const avgEfficiency = meanBy(
    [...t.from.items],
    (item) => calculateItemEfficiency(item, statValuation, { auraMultiplier }).efficiencyWithUtility
  );
  
  return clamp(avgEfficiency / maxEfficiency, 0, 1);
};

/**
 * Score by early build total value (stats + utility).
 *
 * Rewards early builds that provide high total value.
 * Normalized by cost to avoid just favoring expensive builds.
 *
 * @param statValuation - Pre-calculated stat valuations
 * @param maxValueRatio - Maximum value/cost ratio for normalization (default: 1.5)
 * @returns Score from 0 to 1
 */
export const earlyBuildValueScore = (
  statValuation: StatValuation,
  maxValueRatio = 1.5,
  auraMultiplier = 1.0
): TransitionScorer => (t) => {
  if (t.from.items.length === 0 || t.from.totalCost === 0) return 0;
  
  const totalValue = sumBy(
    [...t.from.items],
    (item) => calculateItemEfficiency(item, statValuation, { auraMultiplier }).totalValue
  );
  
  const valueRatio = totalValue / t.from.totalCost;
  return clamp(valueRatio / maxValueRatio, 0, 1);
};

/**
 * Score by early build affordability.
 *
 * Penalizes expensive early loadouts. A 4000g "early" build
 * isn't really early game - it's mid game.
 *
 * @param maxEarlyCost - Maximum reasonable early loadout cost (default: 3000)
 * @returns Score from 0 to 1 (1 = very affordable, 0 = too expensive)
 *
 * @example
 * ```ts
 * const scorer = earlyAffordabilityScore(3000);
 * scorer(transition); // 0.5 if early cost is 1500g
 * ```
 */
export const earlyAffordabilityScore = (
  maxEarlyCost = 3000
): TransitionScorer => (t) => {
  if (t.from.totalCost <= 0) return 1;
  return clamp(1 - t.from.totalCost / maxEarlyCost, 0, 1);
};

/**
 * Score by early build utility value.
 *
 * Rewards early builds that include items with useful actives/passives.
 * Items like Force Staff, Medallion, Drums provide utility beyond stats.
 *
 * @param maxUtilityValue - Maximum utility for normalization (default: 3000)
 * @returns Score from 0 to 1
 */
export const earlyUtilityScore = (
  maxUtilityValue = 3000
): TransitionScorer => (t) => {
  if (t.from.items.length === 0) return 0;
  
  const totalUtility = sumBy(
    [...t.from.items],
    (item) => calculateUtilityValue(item.name)
  );
  
  return clamp(totalUtility / maxUtilityValue, 0, 1);
};

// ─────────────────────────────────────────────────────────────
// Improved Pre-Built Scorer Configurations
// ─────────────────────────────────────────────────────────────

/**
 * Create an improved transition scorer that considers early build quality.
 *
 * This scorer balances:
 * - Component reuse efficiency (how much gold is preserved, including recipe recovery)
 * - Waste avoidance (how little component gold is lost)
 * - Cost delta (how big the upgrade is in terms of item value)
 * - Transition affordability (actual gold needed including target recipe costs)
 * - Early build quality (how good the early items are)
 * - Early affordability (is it actually an early game build?)
 *
 * @param statValuation - Pre-calculated stat valuations for efficiency scoring
 * @param auraMultiplier - Multiplier for aura stats (default: 1.0)
 * @returns Balanced transition scorer
 */
export const createImprovedScorer = (
  statValuation: StatValuation,
  auraMultiplier = 1.0
): TransitionScorer => weightedScore([
  // Gold efficiency factors
  { scorer: reuseEfficiencyScore, weight: 0.20 },  // Includes recipe recovery
  { scorer: wasteAvoidanceScore, weight: 0.10 },
  { scorer: costDeltaScore(4000), weight: 0.05 },  // Value upgrade size
  { scorer: transitionAffordabilityScore(5000), weight: 0.15 },  // Actual gold needed (incl. recipes)
  
  // Early build quality - are these good items to buy early?
  { scorer: earlyBuildEfficiencyScore(statValuation, 1.5, auraMultiplier), weight: 0.20 },
  
  // Early affordability - is this actually an early game build?
  { scorer: earlyAffordabilityScore(3000), weight: 0.20 },
  
  // Early utility - do the early items provide useful actives?
  { scorer: earlyUtilityScore(2500), weight: 0.10 },
]);

/**
 * Create a scorer optimized for support heroes.
 *
 * Prioritizes:
 * - Affordable early builds
 * - High utility items
 * - Low actual gold needed for transition (including recipes)
 * - Moderate cost upgrades (supports don't farm as fast)
 *
 * @param statValuation - Pre-calculated stat valuations
 * @param auraMultiplier - Multiplier for aura stats (default: 1.0)
 */
export const createSupportScorer = (
  statValuation: StatValuation,
  auraMultiplier = 1.0
): TransitionScorer => weightedScore([
  { scorer: reuseEfficiencyScore, weight: 0.15 },
  { scorer: wasteAvoidanceScore, weight: 0.10 },
  { scorer: costDeltaScore(3000), weight: 0.05 },  // Supports prefer smaller upgrades
  { scorer: transitionAffordabilityScore(4000), weight: 0.15 },  // Actual gold needed matters
  { scorer: earlyBuildEfficiencyScore(statValuation, 1.5, auraMultiplier), weight: 0.10 },
  { scorer: earlyAffordabilityScore(2500), weight: 0.25 },  // Very affordable early builds
  { scorer: earlyUtilityScore(3000), weight: 0.20 },  // Utility matters most
]);

/**
 * Create a scorer optimized for core heroes.
 *
 * Prioritizes:
 * - Larger upgrades (cores farm faster)
 * - Stat efficiency
 * - Component reuse for flexibility
 * - Less concerned about transition cost (can farm it up)
 *
 * @param statValuation - Pre-calculated stat valuations
 * @param auraMultiplier - Multiplier for aura stats (default: 1.0)
 */
export const createCoreScorer = (
  statValuation: StatValuation,
  auraMultiplier = 1.0
): TransitionScorer => weightedScore([
  { scorer: reuseEfficiencyScore, weight: 0.25 },
  { scorer: wasteAvoidanceScore, weight: 0.10 },
  { scorer: costDeltaScore(5000), weight: 0.15 },  // Cores want big upgrades
  { scorer: transitionAffordabilityScore(6000), weight: 0.10 },  // Less important for cores
  { scorer: earlyBuildEfficiencyScore(statValuation, 1.5, auraMultiplier), weight: 0.20 },
  { scorer: earlyAffordabilityScore(4000), weight: 0.10 },  // Can afford more
  { scorer: earlyUtilityScore(2000), weight: 0.10 },
]);
