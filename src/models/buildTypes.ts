/**
 * Build-level types for loadout transition analysis.
 *
 * These types support the functional approach to build validation,
 * where constraints are evaluated at the build level (total cost)
 * rather than at the individual item level.
 */

import { Item, StatValuation } from "./types";

// ─────────────────────────────────────────────────────────────
// Core Data Structures
// ─────────────────────────────────────────────────────────────

/**
 * Immutable snapshot of items at a point in time.
 * Represents either an "early game" or "final" loadout.
 */
export interface Loadout {
  /** 
   * Items in the active inventory (provide stats).
   * Limited by inventorySlots (default 6).
   */
  readonly inventory: readonly Item[];
  
  /** 
   * Items in the backpack (no stats, held for later).
   * Limited by backpackSlots (default 3).
   */
  readonly backpack: readonly Item[];
  
  /** 
   * Items sold due to space constraints.
   * Recover 50% of cost (or 100% for recipes).
   */
  readonly sold: readonly Item[];
  
  /** Gold recovered from sold items */
  readonly soldRecovery: number;
  
  /** 
   * Value of items currently held (Inventory + Backpack).
   */
  readonly netWorth: number;

  /** Assembled items in this loadout (legacy field, acts as all retained items) */
  readonly items: readonly Item[];
  /** Sum of all item costs (retained items only) */
  readonly totalCost: number;
  /** Flattened base components from retained items */
  readonly components: readonly string[];
  /** Count of each component (handles duplicates) */
  readonly componentCounts: Readonly<Record<string, number>>;
  /** Total stat value of INVENTORY items only (gold equivalent) */
  readonly totalStatValue: number;
  /** Gold efficiency of the loadout (totalStatValue / totalInvestedCost) */
  readonly efficiency: number;
  
  /**
   * Leftover components not used in assembled items.
   * Note: In the new system, these are distributed into inventory/backpack/sold.
   * Kept for backward compatibility/reference.
   */
  readonly leftoverComponents?: readonly Item[];
  
  /**
   * Total cost including leftover components.
   * This is what the player has actually spent to reach this stage.
   * Formula: (InventoryCost + BackpackCost + SoldCost) - SoldRecovery
   */
  readonly totalInvestedCost?: number;
}

/**
 * Pool of components available for building the next stage.
 * 
 * When transitioning between stages:
 * 1. All items from the previous stage are disassembled
 * 2. Recipes are sold (100% recovery - Gyro's innate)
 * 3. All base components become available for the next stage
 * 
 * The next stage MUST use all these components (no waste allowed).
 */
export interface ComponentPool {
  /** Base component names available (with duplicates for items needing 2x of something) */
  readonly components: readonly string[];
  /** Count of each component */
  readonly componentCounts: Readonly<Record<string, number>>;
  /** Total gold value of all components */
  readonly totalValue: number;
  /** Gold recovered from selling recipes */
  readonly recipeRecovery: number;
}

/**
 * Flow of components between two loadouts.
 * Tracks which components are reused, wasted, or newly acquired.
 */
export interface ComponentFlow {
  /** Components that exist in both loadouts (transferred) */
  readonly reused: readonly string[];
  /** Components in "from" but not "to" (lost value) */
  readonly wasted: readonly string[];
  /** Components in "to" but not "from" (must purchase) */
  readonly acquired: readonly string[];
  /** Gold value of reused components */
  readonly reusedGold: number;
  /** Gold value of wasted components */
  readonly wastedGold: number;
  /** Gold value of acquired components (base components only) */
  readonly acquiredGold: number;
  /** Recipe costs recovered from disassembling "from" items (Gyro innate: 100% recovery) */
  readonly recoveredRecipeCost: number;
  /** Recipe costs needed to build "to" items */
  readonly targetRecipeCost: number;
  /** Net recipe cost: targetRecipeCost - recoveredRecipeCost (can be negative = profit) */
  readonly netRecipeCost: number;
  /** Total gold needed to complete transition: acquiredGold + netRecipeCost */
  readonly totalGoldNeeded: number;
}

/**
 * A transition from one loadout to another.
 * This is the primary unit of analysis for build validation.
 */
export interface LoadoutTransition {
  /** Starting loadout (early game items) */
  readonly from: Loadout;
  /** Ending loadout (target items) */
  readonly to: Loadout;
  /** Cost difference (to.totalCost - from.totalCost) */
  readonly costDelta: number;
  /** Analysis of component flow between loadouts */
  readonly componentFlow: ComponentFlow;
}

// ─────────────────────────────────────────────────────────────
// Functional Types
// ─────────────────────────────────────────────────────────────

/**
 * A predicate that determines if a transition is valid.
 * Returns true if the transition meets the constraint.
 */
export type TransitionConstraint = (transition: LoadoutTransition) => boolean;

/**
 * A function that scores a transition.
 * Higher scores indicate better transitions.
 */
export type TransitionScorer = (transition: LoadoutTransition) => number;

/**
 * Result of an explained constraint check.
 * Includes the reason for failure when not satisfied.
 */
export interface ConstraintResult {
  /** Whether the constraint is satisfied */
  satisfied: boolean;
  /** Human-readable reason for failure (only present when !satisfied) */
  reason?: string;
}

/**
 * A constraint that provides an explanation for its result.
 */
export type ExplainedConstraint = (
  transition: LoadoutTransition
) => ConstraintResult;

// ─────────────────────────────────────────────────────────────
// Analysis Result Types
// ─────────────────────────────────────────────────────────────

/**
 * A transition with its computed score.
 */
export interface ScoredTransition extends LoadoutTransition {
  /** Computed score for this transition */
  readonly score: number;
}

/**
 * Result of build analysis containing valid transitions and stats.
 */
export interface BuildAnalysisResult {
  /** Valid transitions sorted by score */
  readonly transitions: readonly ScoredTransition[];
  /** Summary statistics */
  readonly stats: BuildAnalysisStats;
}

/**
 * Statistics from a build analysis run.
 */
export interface BuildAnalysisStats {
  /** Total number of transitions evaluated */
  readonly totalEvaluated: number;
  /** Number of transitions that passed all constraints */
  readonly validCount: number;
  /** Average score of valid transitions */
  readonly averageScore: number;
  /** Highest score among valid transitions */
  readonly bestScore: number;
}

/**
 * Options for configuring build analysis.
 */
export interface BuildAnalysisOptions {
  /** Number of items in early loadout (default: 2) */
  readonly earlyItemCount?: number;
  /** Number of items in final loadout (default: 2) */
  readonly finalItemCount?: number;
  /** Maximum results to return (default: 20) */
  readonly resultLimit?: number;
  /** Custom constraint (default: cost increase required) */
  readonly constraint?: TransitionConstraint;
  /** Custom scorer (default: balanced scorer) */
  readonly scorer?: TransitionScorer;
  /** Stat valuations for efficiency-based scoring (enables improved scorer) */
  readonly statValuation?: StatValuation;
  /** Maximum total cost for the initial/early build (default: unlimited) */
  readonly initialBuildMaxCost?: number;
}

/**
 * Result of validating a specific transition.
 */
export interface TransitionValidation {
  /** Whether the transition is valid */
  readonly valid: boolean;
  /** The analyzed transition */
  readonly transition: LoadoutTransition;
  /** Reasons for invalidity (empty if valid) */
  readonly reasons: readonly string[];
}

// ─────────────────────────────────────────────────────────────
// Path Finding Types
// ─────────────────────────────────────────────────────────────

/**
 * User's desired final build specification.
 * Can be fully specified (all items) or partial (some required, rest optimized).
 */
export interface BuildTarget {
  /** Items that MUST be in the final build (names or display names) */
  readonly requiredItems: readonly string[];
  /** Number of items in early build (default: 3) */
  readonly earlyItemCount?: number;
  /** Number of items in final build (default: 3) */
  readonly finalItemCount?: number;
  /** Optional: specific early items to prefer (otherwise optimized) */
  readonly preferredEarlyItems?: readonly string[];
  /** Optional: items to exclude from consideration */
  readonly excludedItems?: readonly string[];
}

/**
 * Result of path finding - a complete build path recommendation.
 */
export interface BuildPath {
  /** The transition from early to final build */
  readonly transition: ScoredTransition;
  /** Which required items were successfully included */
  readonly includedTargets: readonly Item[];
  /** Any required items that couldn't be included (constraint violations) */
  readonly excludedTargets: readonly Item[];
  /** Why items were excluded (if any) */
  readonly exclusionReasons: readonly string[];
  /** Component coverage: how much of required items come from early build */
  readonly targetComponentCoverage: number;
  /** Specific path score (weighted for target inclusion) */
  readonly pathScore: number;
}

/**
 * Complete result of a path finding query.
 */
export interface PathFindingResult {
  /** Top recommended build paths */
  readonly paths: readonly BuildPath[];
  /** The original target specification */
  readonly target: BuildTarget;
  /** Resolved target items (from names to Item objects) */
  readonly resolvedTargets: readonly Item[];
  /** Any target names that couldn't be resolved */
  readonly unresolvedTargets: readonly string[];
  /** Statistics about the search */
  readonly stats: PathFindingStats;
}

/**
 * Statistics from a path finding search.
 */
export interface PathFindingStats {
  /** Total combinations evaluated */
  readonly totalEvaluated: number;
  /** Number of valid paths found */
  readonly validPathsFound: number;
  /** Average component coverage across valid paths */
  readonly averageComponentCoverage: number;
  /** Search duration in milliseconds */
  readonly searchTimeMs: number;
}

/**
 * Options for configuring path finding.
 */
export interface PathFindingOptions {
  /** Number of items in early build (default: 3) */
  readonly earlyItemCount?: number;
  /** Number of items in final build (default: 3) */
  readonly finalItemCount?: number;
  /** Maximum results to return (default: 10) */
  readonly resultLimit?: number;
  /** Weight for target coverage in scoring (0-1, default: 0.4) */
  readonly targetCoverageWeight?: number;
  /** Minimum total gold recovery percentage (0-1, default: 0.3) */
  readonly minTotalRecovery?: number;
}

// ─────────────────────────────────────────────────────────────
// Build Sequence Types (Iterative Build Paths)
// ─────────────────────────────────────────────────────────────

/**
 * A single stage in a build sequence.
 * 
 * Represents either an initial purchase or an upgrade from a previous stage.
 * This unified abstraction allows the same constraint and scoring logic
 * to work across all stages of a build.
 */
export interface BuildStage {
  /** The loadout at this stage */
  readonly loadout: Loadout;
  /** Zero-based index of this stage in the sequence */
  readonly stageIndex: number;
  /** Maximum cost budget for this stage */
  readonly costThreshold: number;
  /** Transition from previous stage (null for initial stage) */
  readonly transition: LoadoutTransition | null;
}

/**
 * A constraint that operates on a build stage.
 * 
 * Works for both initial stages (no transition) and upgrade stages.
 * Receives the previous stage for context when evaluating upgrade constraints.
 * 
 * @param stage - The current stage being evaluated
 * @param prev - The previous stage (null for initial stage)
 * @returns true if the constraint is satisfied
 */
export type StageConstraint = (stage: BuildStage, prev: BuildStage | null) => boolean;

/**
 * A scorer that evaluates a stage's quality.
 * 
 * Can consider both the stage's loadout and its transition from the previous stage.
 * 
 * @param stage - The current stage being scored
 * @param prev - The previous stage (null for initial stage)
 * @returns A numeric score (higher is better)
 */
export type StageScorer = (stage: BuildStage, prev: BuildStage | null) => number;

/**
 * A constraint that operates on a loadout (not a transition).
 * 
 * Works for any stage since all stages have a loadout.
 * Use this for constraints like "no duplicate boots" or "max cost".
 */
export type LoadoutConstraint = (loadout: Loadout) => boolean;

/**
 * Complete build path through multiple stages.
 */
export interface BuildSequence {
  /** All stages in order (stage 0 is initial) */
  readonly stages: readonly BuildStage[];
  /** Aggregate score across all stages */
  readonly totalScore: number;
  /** Individual scores for each stage */
  readonly stageScores: readonly number[];
}

/**
 * Configuration for a single stage in the sequence.
 */
export interface StageConfig {
  /** Maximum total cost for items at this stage */
  readonly maxCost: number;
  /** Number of items in loadout (default: inherits from options) */
  readonly itemCount?: number;
  /** Stage-specific constraints (combined with global constraints) */
  readonly constraints?: readonly StageConstraint[];
  /** Stage-specific scorer (defaults to global scorer) */
  readonly scorer?: StageScorer;
}

/**
 * Options for multi-stage build sequence analysis.
 */
export interface BuildSequenceOptions {
  /** Cost thresholds for each stage, e.g., [2000, 3000, 5000] */
  readonly costThresholds: readonly number[];
  /** Per-stage configuration (optional, indexed by stage) */
  readonly stageConfigs?: readonly (StageConfig | undefined)[];
  /** Global constraints applied to all stages */
  readonly globalConstraints?: readonly StageConstraint[];
  /** Default scorer for all stages */
  readonly defaultScorer?: StageScorer;
  /** Number of top results to return (default: 20) */
  readonly resultLimit?: number;
  /** Default item count for loadouts (default: 3) */
  readonly defaultItemCount?: number;
  /** Stat valuations for efficiency scoring */
  readonly statValuation?: StatValuation;
  /** Beam width - candidates to keep at each stage (default: resultLimit * 10) */
  readonly beamWidth?: number;
  /** Minimum total gold recovery percentage for transitions (0-1, default: 0.3) */
  readonly minTotalRecovery?: number;
}

/**
 * Result of build sequence analysis.
 */
export interface BuildSequenceResult {
  /** Top-scoring build sequences */
  readonly sequences: readonly BuildSequence[];
  /** Summary statistics */
  readonly stats: BuildSequenceStats;
}

/**
 * Statistics from a build sequence analysis.
 */
export interface BuildSequenceStats {
  /** Total stage transitions evaluated */
  readonly totalEvaluated: number;
  /** Number of complete valid sequences found */
  readonly validCount: number;
  /** Average score of valid sequences */
  readonly averageScore: number;
  /** Highest score among valid sequences */
  readonly bestScore: number;
  /** Per-stage statistics */
  readonly stageStats: readonly StageAnalysisStats[];
  /** Search duration in milliseconds */
  readonly searchTimeMs: number;
}

/**
 * Statistics for a single stage in sequence analysis.
 */
export interface StageAnalysisStats {
  /** Stage index */
  readonly stageIndex: number;
  /** Cost threshold for this stage */
  readonly costThreshold: number;
  /** Number of candidates evaluated at this stage */
  readonly candidatesEvaluated: number;
  /** Number of valid candidates found */
  readonly validCandidates: number;
  /** Average score at this stage */
  readonly averageScore: number;
}

// ─────────────────────────────────────────────────────────────
// Unified Build Progression Types
// ─────────────────────────────────────────────────────────────

/**
 * Definition for a single stage in a build progression.
 *
 * Combines cost-based and item-based constraints, allowing flexible
 * stage specification. Can be used for simple cost thresholds or
 * complex target-item requirements.
 *
 * @example
 * ```ts
 * // Simple cost threshold
 * const stage1: StageDefinition = { maxCost: 3000 };
 *
 * // Cost + required item
 * const stage2: StageDefinition = {
 *   maxCost: 5000,
 *   requiredItems: ["Force Staff"],
 * };
 *
 * // Full specification
 * const stage3: StageDefinition = {
 *   maxCost: 10000,
 *   minCost: 5001,
 *   requiredItems: ["Skadi"],
 *   excludedItems: ["Dagon"],
 *   itemCount: 4,
 * };
 * ```
 */
export interface StageDefinition {
  /** Maximum total cost for items at this stage */
  readonly maxCost: number;

  /**
   * Minimum total cost for this stage.
   * Default: previous stage cost + 1, or 0 for first stage.
   */
  readonly minCost?: number;

  /**
   * Items that MUST be in this stage's loadout.
   * Specified by name or display name.
   */
  readonly requiredItems?: readonly string[];

  /**
   * Items that MUST NOT be in this stage.
   * Specified by name or display name.
   */
  readonly excludedItems?: readonly string[];

  /**
   * Number of items in loadout.
   * Default: inherits from global defaultItemCount.
   */
  readonly itemCount?: number;

  /** Stage-specific constraints (combined with global constraints) */
  readonly constraints?: readonly StageConstraint[];

  /** Stage-specific scorer (defaults to global scorer) */
  readonly scorer?: StageScorer;

  /**
   * Require at least one boot item in this stage's loadout.
   * Boots are identified by config.bootItems list.
   */
  readonly requireBoots?: boolean;

  /**
   * Whether to allow raw component items (items with no child components)
   * in this stage's item pool.
   *
   * When true (default), component items like Boots of Speed, Blades of Attack,
   * etc. can be included in loadouts as standalone items.
   *
   * When false, only upgraded items (items with components) are considered.
   * This is useful for later game stages where you want to force assembled items.
   *
   * Default: inherits from global includeComponentItems option (typically true).
   */
  readonly allowRawComponents?: boolean;
}

/**
 * Options for unified build progression analysis.
 *
 * Supports both cost-based sequences (like sequences command)
 * and target-item pathfinding (like pathfind command).
 *
 * @example
 * ```ts
 * // Cost-based progression (sequences style)
 * const options1: BuildProgressionOptions = {
 *   stages: [
 *     { maxCost: 2000 },
 *     { maxCost: 4000 },
 *     { maxCost: 7000 },
 *   ],
 * };
 *
 * // Target-based progression (pathfind style)
 * const options2: BuildProgressionOptions = {
 *   stages: [
 *     { maxCost: 3000 },
 *     { maxCost: 15000, requiredItems: ["Force Staff", "Skadi"] },
 *   ],
 * };
 *
 * // Combined: acquire targets progressively
 * const options3: BuildProgressionOptions = {
 *   stages: [
 *     { maxCost: 2500 },
 *     { maxCost: 4500, requiredItems: ["Force Staff"] },
 *     { maxCost: 8000, requiredItems: ["Skadi"] },
 *   ],
 * };
 * ```
 */
export interface BuildProgressionOptions {
  /** Stage definitions - each specifies cost and/or item constraints */
  readonly stages: readonly StageDefinition[];

  /** Global constraints applied to all stages */
  readonly globalConstraints?: readonly StageConstraint[];

  /** Default scorer for stages without a specific scorer */
  readonly defaultScorer?: StageScorer;

  /** Default item count for stages (default: 3) */
  readonly defaultItemCount?: number;

  /** Number of top results to return (default: 20) */
  readonly resultLimit?: number;

  /** Beam width for search (default: resultLimit * 10) */
  readonly beamWidth?: number;

  /** Minimum total gold recovery between stages (0-1, default: 0.3) */
  readonly minTotalRecovery?: number;

  /** Stat valuations for scoring */
  readonly statValuation?: StatValuation;

  /**
   * Multiplier for aura stats to account for team-wide benefit.
   * 1.0 = solo, 2.5 = average teamfight, 5.0 = full team.
   * Default: 1.0
   */
  readonly auraMultiplier?: number;

  /**
   * Weight for required item coverage in scoring (0-1, default: 0.4).
   * Higher values prioritize reaching required items over efficiency.
   */
  readonly targetCoverageWeight?: number;

  /** Number of active inventory slots (default: 6) */
  readonly inventorySlots?: number;

  /** Number of backpack slots (default: 3) */
  readonly backpackSlots?: number;

  /**
   * Callback for receiving progress updates during analysis.
   *
   * When provided, this callback will be invoked at key points during
   * the analysis to report progress. Useful for updating spinners,
   * progress bars, or logging.
   *
   * The callback should be fast and non-blocking to avoid impacting
   * analysis performance.
   */
  readonly onProgress?: ProgressionProgressCallback;
}

/**
 * Result of build progression analysis.
 */
export interface BuildProgressionResult {
  /** Top-scoring build sequences */
  readonly sequences: readonly BuildSequence[];

  /**
   * Resolved target items by stage index.
   * Only includes stages that had requiredItems specified.
   */
  readonly resolvedTargets: ReadonlyMap<number, readonly Item[]>;

  /**
   * Unresolved target item names by stage index.
   * Empty map if all targets resolved successfully.
   */
  readonly unresolvedTargets: ReadonlyMap<number, readonly string[]>;

  /** Summary statistics */
  readonly stats: BuildProgressionStats;
}

/**
 * Statistics from build progression analysis.
 */
export interface BuildProgressionStats extends BuildSequenceStats {
  /**
   * Fraction of required items that were successfully included.
   * 1.0 means all required items in all stages were achieved.
   */
  readonly targetCoverage: number;

  /**
   * Number of required items specified across all stages.
   */
  readonly totalRequiredItems: number;

  /**
   * Number of required items successfully resolved.
   */
  readonly resolvedRequiredItems: number;
}

// ─────────────────────────────────────────────────────────────
// Progress Reporting Types
// ─────────────────────────────────────────────────────────────

/**
 * Phase of build progression analysis.
 */
export type ProgressionPhase =
  | 'initializing'
  | 'resolving'
  | 'generating'
  | 'expanding'
  | 'finalizing';

/**
 * Progress update sent during build progression analysis.
 *
 * Provides real-time feedback about analysis progress, useful for
 * updating spinners, progress bars, or logging in CLI applications.
 */
export interface ProgressionProgressUpdate {
  /** Current phase of analysis */
  readonly phase: ProgressionPhase;

  /** Current stage index (0-based), available in generating/expanding phases */
  readonly stageIndex?: number;

  /** Total number of stages */
  readonly totalStages: number;

  /** Combinations evaluated so far in current phase */
  readonly evaluated?: number;

  /** Valid candidates found so far in current phase */
  readonly valid?: number;

  /** Current sequence being expanded (for expanding phase) */
  readonly sequenceIndex?: number;

  /** Total sequences to expand (for expanding phase) */
  readonly totalSequences?: number;

  /** Elapsed time in milliseconds since analysis started */
  readonly elapsedMs: number;

  /** Human-readable status message */
  readonly message: string;
}

/**
 * Callback for receiving progress updates during analysis.
 *
 * @example
 * ```ts
 * const onProgress: ProgressionProgressCallback = (update) => {
 *   spinner.message(update.message);
 * };
 *
 * analyzeProgression(items, config, { stages, onProgress });
 * ```
 */
export type ProgressionProgressCallback = (
  update: ProgressionProgressUpdate
) => void;
