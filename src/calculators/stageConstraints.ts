/**
 * Stage-level constraint functions for build sequence analysis.
 *
 * Stage constraints operate on BuildStage objects and can consider
 * both the current stage's loadout and the transition from the previous stage.
 * This allows the same constraint patterns to work for both initial builds
 * and upgrade stages.
 */

import {
  BuildStage,
  StageConstraint,
  LoadoutConstraint,
  TransitionConstraint,
  Loadout,
} from "../models/buildTypes";
import { Item } from "../models/types";
import { AnalysisConfig, isBootItem } from "../config/analysisConfig";

// ─────────────────────────────────────────────────────────────
// Constraint Adapters
// ─────────────────────────────────────────────────────────────

/**
 * Convert a loadout constraint to a stage constraint.
 *
 * Loadout constraints work on any stage since all stages have a loadout.
 *
 * @param lc - Loadout constraint to adapt
 * @returns Stage constraint that applies the loadout constraint
 *
 * @example
 * ```ts
 * const maxCost = fromLoadoutConstraint(loadout => loadout.totalCost <= 3000);
 * maxCost(stage, prev); // true if stage.loadout.totalCost <= 3000
 * ```
 */
export const fromLoadoutConstraint = (lc: LoadoutConstraint): StageConstraint =>
  (stage) => lc(stage.loadout);

/**
 * Convert a transition constraint to a stage constraint.
 *
 * For initial stages (no transition), the constraint always passes.
 * For upgrade stages, applies the transition constraint.
 *
 * @param tc - Transition constraint to adapt
 * @returns Stage constraint that applies the transition constraint
 *
 * @example
 * ```ts
 * const costIncrease = fromTransitionConstraint(t => t.costDelta > 0);
 * costIncrease(initialStage, null); // true (no transition)
 * costIncrease(upgradeStage, prev); // true if costDelta > 0
 * ```
 */
export const fromTransitionConstraint = (tc: TransitionConstraint): StageConstraint =>
  (stage) => {
    if (!stage.transition) return true; // Initial stage always passes
    return tc(stage.transition);
  };

// ─────────────────────────────────────────────────────────────
// Loadout Constraints
// ─────────────────────────────────────────────────────────────

/**
 * Constraint: loadout total cost must not exceed maximum.
 *
 * @param max - Maximum cost allowed
 */
export const maxLoadoutCost = (max: number): LoadoutConstraint =>
  (loadout) => loadout.totalCost <= max;

/**
 * Constraint: loadout total cost must be at least minimum.
 *
 * @param min - Minimum cost required
 */
export const minLoadoutCost = (min: number): LoadoutConstraint =>
  (loadout) => loadout.totalCost >= min;

/**
 * Constraint: loadout must not exceed maximum item count.
 *
 * @param max - Maximum number of items (typically 6 for inventory)
 */
export const maxItemCount = (max: number): LoadoutConstraint =>
  (loadout) => loadout.items.length <= max;

/**
 * Constraint: loadout must have at least minimum item count.
 *
 * @param min - Minimum number of items
 */
export const minItemCount = (min: number): LoadoutConstraint =>
  (loadout) => loadout.items.length >= min;

/**
 * Constraint: no duplicate boots in loadout.
 *
 * Movement speed from boots doesn't stack in Dota.
 *
 * @param config - Analysis config with boot item names
 */
export const noDuplicateBootsInLoadout = (config: AnalysisConfig): LoadoutConstraint =>
  (loadout) => {
    const bootCount = loadout.items.filter((i) => isBootItem(i.name, config)).length;
    return bootCount <= 1;
  };

/**
 * Constraint: loadout must contain at least one boot.
 *
 * @param config - Analysis config with boot item names
 */
export const requireBootsInLoadout = (config: AnalysisConfig): LoadoutConstraint =>
  (loadout) => loadout.items.some((i) => isBootItem(i.name, config));

/**
 * Constraint: loadout must contain a specific item.
 *
 * @param itemName - Name or display name of required item
 */
export const loadoutMustContain = (itemName: string): LoadoutConstraint =>
  (loadout) => loadout.items.some(
    (i) => i.name === itemName || i.displayName === itemName
  );

/**
 * Constraint: loadout must not contain a specific item.
 *
 * @param itemName - Name or display name of excluded item
 */
export const loadoutMustNotContain = (itemName: string): LoadoutConstraint =>
  (loadout) => !loadout.items.some(
    (i) => i.name === itemName || i.displayName === itemName
  );

/**
 * Constraint: all items in loadout must pass a predicate.
 *
 * @param predicate - Function to test each item
 */
export const allItemsMatch = (predicate: (item: Item) => boolean): LoadoutConstraint =>
  (loadout) => loadout.items.every(predicate);

/**
 * Constraint: at least one item in loadout must pass a predicate.
 *
 * @param predicate - Function to test each item
 */
export const someItemsMatch = (predicate: (item: Item) => boolean): LoadoutConstraint =>
  (loadout) => loadout.items.some(predicate);

/**
 * Constraint: loadout efficiency must meet minimum threshold.
 *
 * @param minEfficiency - Minimum efficiency ratio (e.g., 0.8 for 80%)
 */
export const minLoadoutEfficiency = (minEfficiency: number): LoadoutConstraint =>
  (loadout) => loadout.efficiency >= minEfficiency;

// ─────────────────────────────────────────────────────────────
// Stage Constraints
// ─────────────────────────────────────────────────────────────

/**
 * Constraint: stage must be within its cost threshold.
 *
 * This is a fundamental constraint for sequence analysis -
 * each stage must not exceed its budget.
 */
export const withinCostThreshold: StageConstraint = (stage) =>
  stage.loadout.totalCost <= stage.costThreshold;

/**
 * Constraint: stage cost must exceed previous stage cost.
 *
 * Ensures progression through the build - each stage should
 * represent an upgrade in total item value.
 * Always passes for initial stages (no previous stage).
 */
export const costMustIncrease: StageConstraint = (stage, prev) => {
  if (!prev) return true; // Initial stage always passes
  return stage.loadout.totalCost > prev.loadout.totalCost;
};

/**
 * Constraint: stage cost must increase by at least a minimum amount.
 *
 * @param minIncrease - Minimum gold increase required
 */
export const minCostIncrease = (minIncrease: number): StageConstraint =>
  (stage, prev) => {
    if (!prev) return true; // Initial stage
    return stage.loadout.totalCost >= prev.loadout.totalCost + minIncrease;
  };

/**
 * Constraint: stage cost must not increase by more than a maximum amount.
 *
 * Useful for ensuring gradual progression rather than huge jumps.
 *
 * @param maxIncrease - Maximum gold increase allowed
 */
export const maxCostIncrease = (maxIncrease: number): StageConstraint =>
  (stage, prev) => {
    if (!prev) return true; // Initial stage
    return stage.loadout.totalCost <= prev.loadout.totalCost + maxIncrease;
  };

/**
 * Constraint: minimum total gold recovery from previous stage.
 *
 * Includes both component reuse AND recipe recovery (Gyro's innate gives 100% recipe refund).
 * This measures true gold efficiency - how much of your previous investment you retain.
 *
 * @param minPercent - Minimum recovery as decimal (0-1), e.g., 0.5 = 50%
 */
export const minTotalRecoveryFromPrevious = (minPercent: number): StageConstraint =>
  (stage, prev) => {
    if (!stage.transition) return true; // Initial stage
    if (!prev || prev.loadout.totalCost === 0) return true;
    const flow = stage.transition.componentFlow;
    const totalRecovered = flow.reusedGold + flow.recoveredRecipeCost;
    return totalRecovered / prev.loadout.totalCost >= minPercent;
  };

/**
 * Constraint: maximum gold wasted from previous stage.
 *
 * @param maxGold - Maximum gold that can be wasted
 */
export const maxWasteFromPrevious = (maxGold: number): StageConstraint =>
  (stage) => {
    if (!stage.transition) return true; // Initial stage
    return stage.transition.componentFlow.wastedGold <= maxGold;
  };

/**
 * Constraint: maximum waste percentage from previous stage.
 *
 * @param maxPercent - Maximum waste as decimal (0-1)
 */
export const maxWastePercentFromPrevious = (maxPercent: number): StageConstraint =>
  (stage, prev) => {
    if (!stage.transition) return true; // Initial stage
    if (!prev || prev.loadout.totalCost === 0) return true;
    return stage.transition.componentFlow.wastedGold / prev.loadout.totalCost <= maxPercent;
  };

/**
 * Constraint: maximum gold needed to complete the transition.
 *
 * Ensures the upgrade is affordable.
 *
 * @param maxGold - Maximum gold needed (acquired components + net recipe cost)
 */
export const maxTransitionCost = (maxGold: number): StageConstraint =>
  (stage) => {
    if (!stage.transition) return true; // Initial stage
    return stage.transition.componentFlow.totalGoldNeeded <= maxGold;
  };

/**
 * Constraint: stage index must match expected value.
 *
 * Useful for applying constraints only to specific stages.
 *
 * @param expectedIndex - Expected stage index
 */
export const atStageIndex = (expectedIndex: number): StageConstraint =>
  (stage) => stage.stageIndex === expectedIndex;

/**
 * Constraint: apply another constraint only at a specific stage.
 *
 * @param stageIndex - Stage index to apply constraint at
 * @param constraint - Constraint to apply
 */
export const onlyAtStage = (
  stageIndex: number,
  constraint: StageConstraint
): StageConstraint =>
  (stage, prev) => {
    if (stage.stageIndex !== stageIndex) return true;
    return constraint(stage, prev);
  };

/**
 * Constraint: apply another constraint only after a specific stage.
 *
 * @param afterIndex - Stage index after which to apply constraint
 * @param constraint - Constraint to apply
 */
export const afterStage = (
  afterIndex: number,
  constraint: StageConstraint
): StageConstraint =>
  (stage, prev) => {
    if (stage.stageIndex <= afterIndex) return true;
    return constraint(stage, prev);
  };

// ─────────────────────────────────────────────────────────────
// Constraint Combinators
// ─────────────────────────────────────────────────────────────

/**
 * Combine stage constraints with AND logic.
 *
 * All constraints must pass for the result to pass.
 *
 * @param constraints - Constraints to combine
 * @returns Combined constraint
 *
 * @example
 * ```ts
 * const strict = allStageConstraints(
 *   withinCostThreshold,
 *   costMustIncrease,
 *   minTotalRecoveryFromPrevious(0.5)
 * );
 * ```
 */
export const allStageConstraints = (
  ...constraints: StageConstraint[]
): StageConstraint =>
  (stage, prev) => constraints.every((c) => c(stage, prev));

/**
 * Combine stage constraints with OR logic.
 *
 * At least one constraint must pass for the result to pass.
 *
 * @param constraints - Constraints to combine
 * @returns Combined constraint
 */
export const anyStageConstraint = (
  ...constraints: StageConstraint[]
): StageConstraint =>
  (stage, prev) => constraints.some((c) => c(stage, prev));

/**
 * Negate a stage constraint.
 *
 * @param constraint - Constraint to negate
 * @returns Negated constraint
 */
export const notStageConstraint = (
  constraint: StageConstraint
): StageConstraint =>
  (stage, prev) => !constraint(stage, prev);

/**
 * Combine loadout constraints with AND logic.
 *
 * @param constraints - Loadout constraints to combine
 * @returns Combined loadout constraint
 */
export const allLoadoutConstraints = (
  ...constraints: LoadoutConstraint[]
): LoadoutConstraint =>
  (loadout) => constraints.every((c) => c(loadout));

/**
 * Combine loadout constraints with OR logic.
 *
 * @param constraints - Loadout constraints to combine
 * @returns Combined loadout constraint
 */
export const anyLoadoutConstraint = (
  ...constraints: LoadoutConstraint[]
): LoadoutConstraint =>
  (loadout) => constraints.some((c) => c(loadout));

// ─────────────────────────────────────────────────────────────
// Pre-Built Stage Constraint Sets
// ─────────────────────────────────────────────────────────────

/**
 * Standard constraints for sequence analysis.
 *
 * Includes:
 * - Stage must be within cost threshold
 * - Cost must increase from previous stage
 * - No duplicate boots
 * - Max 6 items (inventory limit)
 *
 * @param config - Analysis configuration
 */
export const standardSequenceConstraints = (
  config: AnalysisConfig
): StageConstraint =>
  allStageConstraints(
    withinCostThreshold,
    costMustIncrease,
    fromLoadoutConstraint(noDuplicateBootsInLoadout(config)),
    fromLoadoutConstraint(maxItemCount(6))
  );

/**
 * Strict constraints for high-efficiency sequences.
 *
 * In addition to standard constraints:
 * - Minimum 50% total gold recovery
 * - Maximum 20% waste
 *
 * @param config - Analysis configuration
 */
export const strictSequenceConstraints = (
  config: AnalysisConfig
): StageConstraint =>
  allStageConstraints(
    standardSequenceConstraints(config),
    minTotalRecoveryFromPrevious(0.5),
    maxWastePercentFromPrevious(0.2)
  );

/**
 * Relaxed constraints for exploring more options.
 *
 * Only requires:
 * - Stage within cost threshold
 * - Cost increases
 * - No duplicate boots
 *
 * @param config - Analysis configuration
 */
export const relaxedSequenceConstraints = (
  config: AnalysisConfig
): StageConstraint =>
  allStageConstraints(
    withinCostThreshold,
    costMustIncrease,
    fromLoadoutConstraint(noDuplicateBootsInLoadout(config))
  );
