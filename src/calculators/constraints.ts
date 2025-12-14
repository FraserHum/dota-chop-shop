/**
 * Constraint functions for validating loadout transitions.
 *
 * Constraints are predicates that determine whether a transition is valid.
 * They can be composed using combinators like allConstraints() and anyConstraint().
 */

import {
  LoadoutTransition,
  TransitionConstraint,
  ExplainedConstraint,
} from "../models/buildTypes";
import { Item } from "../models/types";
import { AnalysisConfig, isBootItem } from "../config/analysisConfig";

// ─────────────────────────────────────────────────────────────
// Core Constraints
// ─────────────────────────────────────────────────────────────

/**
 * The fundamental constraint: final build must cost more than initial.
 *
 * This is the core constraint from Gyrocopter's disassemble strategy -
 * you can only profitably disassemble if the final build is worth more.
 */
export const costIncreaseConstraint: TransitionConstraint = (t) =>
  t.costDelta > 0;

/**
 * Explained version of costIncreaseConstraint.
 * Provides a reason when the constraint fails.
 */
export const costIncreaseConstraintExplained: ExplainedConstraint = (t) => ({
  satisfied: t.costDelta > 0,
  reason:
    t.costDelta <= 0
      ? `Final cost (${t.to.totalCost}g) must exceed initial cost (${t.from.totalCost}g)`
      : undefined,
});

// ─────────────────────────────────────────────────────────────
// Constraint Factories
// ─────────────────────────────────────────────────────────────

/**
 * Require a minimum cost increase.
 *
 * @param min - Minimum gold increase required
 * @returns Constraint that checks costDelta >= min
 *
 * @example
 * ```ts
 * const needsProfit = minCostIncrease(500);
 * needsProfit(transition); // true if costDelta >= 500
 * ```
 */
export const minCostIncrease = (min: number): TransitionConstraint => (t) =>
  t.costDelta >= min;

/**
 * Require a maximum cost increase.
 * Useful for finding budget-friendly upgrades.
 *
 * @param max - Maximum gold increase allowed
 */
export const maxCostIncrease = (max: number): TransitionConstraint => (t) =>
  t.costDelta <= max;

/**
 * Require minimum total gold recovery percentage.
 *
 * Includes both component reuse AND recipe recovery (Gyro's innate gives 100% recipe refund).
 * This measures true gold efficiency - how much of your previous investment you retain.
 *
 * @param minPercent - Minimum recovery as decimal (0-1), e.g., 0.5 = 50%
 * @returns Constraint that checks (reusedGold + recoveredRecipeCost) / fromTotalCost >= minPercent
 *
 * @example
 * ```ts
 * const halfRecovery = minTotalRecovery(0.5);
 * halfRecovery(transition); // true if at least 50% of gold is recovered
 * ```
 */
export const minTotalRecovery = (
  minPercent: number
): TransitionConstraint => (t) => {
  if (t.from.totalCost === 0) return true;
  const totalRecovered = t.componentFlow.reusedGold + t.componentFlow.recoveredRecipeCost;
  return totalRecovered / t.from.totalCost >= minPercent;
};

/**
 * Limit maximum wasted gold.
 *
 * @param max - Maximum gold that can be wasted
 */
export const maxWastedGold = (max: number): TransitionConstraint => (t) =>
  t.componentFlow.wastedGold <= max;

/**
 * Limit maximum wasted percentage.
 *
 * @param maxPercent - Maximum waste as decimal (0-1)
 */
export const maxWastedPercent = (
  maxPercent: number
): TransitionConstraint => (t) => {
  if (t.from.totalCost === 0) return true;
  return t.componentFlow.wastedGold / t.from.totalCost <= maxPercent;
};

/**
 * Require minimum number of items in final loadout.
 *
 * @param min - Minimum item count
 */
export const minFinalItems = (min: number): TransitionConstraint => (t) =>
  t.to.items.length >= min;

/**
 * Require maximum number of items in final loadout.
 * Useful for respecting inventory slot limits.
 *
 * @param max - Maximum item count (typically 6 for inventory)
 */
export const maxFinalItems = (max: number): TransitionConstraint => (t) =>
  t.to.items.length <= max;

/**
 * Require minimum number of items in initial loadout.
 *
 * @param min - Minimum item count
 */
export const minInitialItems = (min: number): TransitionConstraint => (t) =>
  t.from.items.length >= min;

/**
 * Require maximum number of items in initial loadout.
 *
 * @param max - Maximum item count
 */
export const maxInitialItems = (max: number): TransitionConstraint => (t) =>
  t.from.items.length <= max;

/**
 * Require minimum total cost in final loadout.
 *
 * @param min - Minimum total gold cost
 */
export const minFinalCost = (min: number): TransitionConstraint => (t) =>
  t.to.totalCost >= min;

/**
 * Require maximum total cost in final loadout.
 *
 * @param max - Maximum total gold cost
 */
export const maxFinalCost = (max: number): TransitionConstraint => (t) =>
  t.to.totalCost <= max;

// ─────────────────────────────────────────────────────────────
// Item-Specific Constraints
// ─────────────────────────────────────────────────────────────

/**
 * Constraint: No duplicate boots in a loadout.
 * Movement speed from boots doesn't stack.
 *
 * @param config - Analysis config containing boot item names
 * @returns Constraint for both initial and final loadouts
 */
export const noDuplicateBoots = (
  config: AnalysisConfig
): TransitionConstraint => (t) => {
  const fromBoots = t.from.items.filter((i) => isBootItem(i.name, config));
  const toBoots = t.to.items.filter((i) => isBootItem(i.name, config));
  return fromBoots.length <= 1 && toBoots.length <= 1;
};

/**
 * Constraint: Final loadout must contain specific item.
 *
 * @param itemName - Name of required item
 */
export const finalMustContain = (itemName: string): TransitionConstraint => (t) =>
  t.to.items.some((i) => i.name === itemName || i.displayName === itemName);

/**
 * Constraint: Final loadout must not contain specific item.
 *
 * @param itemName - Name of excluded item
 */
export const finalMustNotContain = (
  itemName: string
): TransitionConstraint => (t) =>
  !t.to.items.some((i) => i.name === itemName || i.displayName === itemName);

/**
 * Constraint: Initial loadout must contain specific item.
 *
 * @param itemName - Name of required item
 */
export const initialMustContain = (
  itemName: string
): TransitionConstraint => (t) =>
  t.from.items.some((i) => i.name === itemName || i.displayName === itemName);

/**
 * Constraint: All items in final loadout must pass a predicate.
 *
 * @param predicate - Function to test each item
 */
export const allFinalItemsMatch = (
  predicate: (item: Item) => boolean
): TransitionConstraint => (t) => t.to.items.every(predicate);

/**
 * Constraint: At least one item in final loadout must pass a predicate.
 *
 * @param predicate - Function to test each item
 */
export const someFinalItemsMatch = (
  predicate: (item: Item) => boolean
): TransitionConstraint => (t) => t.to.items.some(predicate);

// ─────────────────────────────────────────────────────────────
// Constraint Combinators
// ─────────────────────────────────────────────────────────────

/**
 * Combine constraints with AND logic.
 * All constraints must pass for the result to pass.
 *
 * @param constraints - Constraints to combine
 * @returns Combined constraint
 *
 * @example
 * ```ts
 * const strict = allConstraints(
 *   costIncreaseConstraint,
 *   minTotalRecovery(0.5),
 *   maxWastedGold(500)
 * );
 * ```
 */
export const allConstraints = (
  ...constraints: TransitionConstraint[]
): TransitionConstraint => (t) => constraints.every((c) => c(t));

/**
 * Combine constraints with OR logic.
 * At least one constraint must pass for the result to pass.
 *
 * @param constraints - Constraints to combine
 * @returns Combined constraint
 *
 * @example
 * ```ts
 * const flexible = anyConstraint(
 *   minCostIncrease(1000),  // Either big profit
 *   minTotalRecovery(0.8)   // Or high recovery
 * );
 * ```
 */
export const anyConstraint = (
  ...constraints: TransitionConstraint[]
): TransitionConstraint => (t) => constraints.some((c) => c(t));

/**
 * Negate a constraint.
 *
 * @param constraint - Constraint to negate
 * @returns Negated constraint
 */
export const notConstraint = (
  constraint: TransitionConstraint
): TransitionConstraint => (t) => !constraint(t);

/**
 * Make a constraint optional (always passes but records result).
 * Useful for scoring but not filtering.
 */
export const optionalConstraint = (
  _constraint: TransitionConstraint
): TransitionConstraint => () => true;

// ─────────────────────────────────────────────────────────────
// Config-Based Builders
// ─────────────────────────────────────────────────────────────

/**
 * Build standard constraints from analysis config.
 *
 * @param config - Analysis configuration
 * @returns Combined constraint based on config thresholds
 */
export const buildStandardConstraints = (
  config: AnalysisConfig
): TransitionConstraint => {
  const constraints: TransitionConstraint[] = [
    costIncreaseConstraint, // Always required
  ];

  // Add optional constraints based on config
  // Using type assertion for extended threshold properties
  const thresholds = config.thresholds;

  if ("minBuildCostIncrease" in thresholds && typeof thresholds.minBuildCostIncrease === "number") {
    constraints.push(minCostIncrease(thresholds.minBuildCostIncrease));
  }

  if ("minComponentReusePercent" in thresholds && typeof thresholds.minComponentReusePercent === "number") {
    constraints.push(minTotalRecovery(thresholds.minComponentReusePercent));
  }

  if ("maxWastedGold" in thresholds && typeof thresholds.maxWastedGold === "number") {
    constraints.push(maxWastedGold(thresholds.maxWastedGold));
  }

  return allConstraints(...constraints);
};

// ─────────────────────────────────────────────────────────────
// Explained Constraint Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Convert a simple constraint to an explained constraint.
 *
 * @param constraint - Simple constraint
 * @param failureReason - Function to generate failure reason
 * @returns Explained constraint
 */
export const withExplanation = (
  constraint: TransitionConstraint,
  failureReason: (t: LoadoutTransition) => string
): ExplainedConstraint => (t) => ({
  satisfied: constraint(t),
  reason: constraint(t) ? undefined : failureReason(t),
});

/**
 * Combine explained constraints, collecting all failure reasons.
 *
 * @param constraints - Explained constraints to combine
 * @returns Combined explained constraint with all failure reasons
 */
export const allExplainedConstraints = (
  ...constraints: ExplainedConstraint[]
): ((t: LoadoutTransition) => { satisfied: boolean; reasons: string[] }) => (t) => {
  const results = constraints.map((c) => c(t));
  const failures = results.filter((r) => !r.satisfied);
  return {
    satisfied: failures.length === 0,
    reasons: failures.map((r) => r.reason).filter((r): r is string => r !== undefined),
  };
};
