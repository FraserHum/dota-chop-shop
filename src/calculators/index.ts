// Analysis context for shared state
export { 
  AnalysisContext,
  createAnalysisContext,
  DisassembleCandidateAnalysis,
  UpgradeTarget,
} from "./AnalysisContext";

// Build types (from models)
export type {
  Loadout,
  ComponentFlow,
  LoadoutTransition,
  TransitionConstraint,
  TransitionScorer,
  ConstraintResult,
  ExplainedConstraint,
  ScoredTransition,
  BuildAnalysisResult,
  BuildAnalysisStats,
  BuildAnalysisOptions,
  TransitionValidation,
} from "../models/buildTypes";

// Loadout utilities
export {
  createLoadout,
  emptyLoadout,
  analyzeComponentFlow,
  createTransition,
  createTransitionFromItems,
  getTotalRecoveryPercentage,
  getWastedPercentage,
  getLoadoutItemNames,
  formatTransition,
} from "./loadout";

// Transition constraints
export {
  costIncreaseConstraint,
  costIncreaseConstraintExplained,
  minCostIncrease,
  maxCostIncrease,
  minTotalRecovery,
  maxWastedGold,
  maxWastedPercent,
  minFinalItems,
  maxFinalItems,
  minInitialItems,
  maxInitialItems,
  minFinalCost,
  maxFinalCost,
  noDuplicateBoots,
  finalMustContain,
  finalMustNotContain,
  initialMustContain,
  allFinalItemsMatch,
  someFinalItemsMatch,
  allConstraints,
  anyConstraint,
  notConstraint,
  optionalConstraint,
  buildStandardConstraints,
  withExplanation,
  allExplainedConstraints,
} from "./constraints";

// Transition scorers
export {
  reuseEfficiencyScore,
  wasteAvoidanceScore,
  rawReusedGoldScore,
  totalRecoveredGoldScore,
  rawCostDeltaScore,
  costDeltaScore,
  valueGainScore,
  valueEfficiencyScore,
  componentCountScore,
  finalCostScore,
  budgetFinalScore,
  transitionAffordabilityScore,
  weightedScore,
  maxScore,
  minScore,
  averageScore,
  productScore,
  transformScore,
  clampScore,
  invertScore,
  defaultTransitionScorer,
  conservativeScorer,
  aggressiveScorer,
  economyScorer,
  greedyReuseScorer,
  // New early build quality scorers
  earlyBuildEfficiencyScore,
  earlyBuildValueScore,
  earlyAffordabilityScore,
  earlyUtilityScore,
  // New composite scorers
  createImprovedScorer,
  createSupportScorer,
  createCoreScorer,
} from "./scorers";

// Item combinations (lazy generators)
export {
  combinations,
  filteredCombinations,
  collectCombinations,
  countCombinations,
  noDuplicateBoots as noDuplicateBootsFilter,
  hasAtLeastOneBoot,
  hasExactlyOneBoot,
  hasNoBoots,
  maxTotalCost,
  minTotalCost,
  mustIncludeItem,
  mustExcludeItem,
  combineFilters,
  bootTrioCombinations,
  countBootTrioCombinations,
  pairs,
  cartesianProduct,
} from "./combinations";
export type { BootTrioResult } from "./combinations";

// Build analysis pipeline
export {
  analyzeValidTransitions,
  analyzePairTransitions,
  analyzeTrioTransitions,
  analyzeAsymmetricTransitions,
  validateTransition,
  meetsReuseThreshold,
  findTransitionsToItem,
  findTransitionsFromItem,
} from "./buildAnalysis";

// Component utilities
export {
  ComponentBreakdown,
  ComponentInfo,
  countOccurrences,
  categorizeComponents,
  findMatchingComponents,
  collectAvailableComponents,
  getComponentSources,
} from "./componentUtils";

// Efficiency calculations
export {
  calculateItemEfficiency,
  getItemsByEfficiency,
  ValueRankingResult,
  getItemsByValue,
  getItemsByValueSplit,
} from "./efficiency";

// Scoring functions
export {
  SynergyScoreInputs,
  EarlyItemMetrics,
  calculateSynergyScore,
  calculateEarlyItemMetrics,
} from "./scoring";

// Stat valuation
export {
  calculateStatValuation,
  formatStatValuation,
} from "./statValuation";

// Upgrade path analysis
export {
  ComponentUpgradeInfo,
  DisassembleAnalysis,
  LateGameTarget,
  SharedTargetInfo,
  EarlyItemCombo,
  BootTrioCombo,
  OrphanComponent,
  LateItemReachability,
  ReachabilityAnalysis,
  KeyItemAnalysis,
  analyzeDisassemble,
  analyzeEarlyItemCombos,
  analyzeBootTrios,
  analyzeReachability,
  analyzeKeyUtilityItems,
} from "./upgradePaths";

// Utility category definitions
export {
  UtilityCategory,
  UTILITY_VALUES,
  ITEM_UTILITY,
  calculateUtilityValue,
  getItemUtilityCategories,
  formatUtilityCategories,
} from "./utility";

// Item resolution (shared between modules)
export {
  resolveTargetItems,
  resolveStageTargets,
  findSimilarItems,
  getItemSuggestions,
} from "./itemResolution";

// Re-export path finding types (still used by buildProgression)
export type {
  BuildTarget,
  BuildPath,
  PathFindingResult,
  PathFindingStats,
  PathFindingOptions,
} from "../models/buildTypes";

// ─────────────────────────────────────────────────────────────
// Build Sequence Analysis (Iterative Build Paths)
// ─────────────────────────────────────────────────────────────

// Stage constraints
export {
  // Adapters
  fromLoadoutConstraint,
  fromTransitionConstraint,
  // Loadout constraints
  maxLoadoutCost,
  minLoadoutCost,
  maxItemCount,
  minItemCount,
  noDuplicateBootsInLoadout,
  loadoutMustContain,
  loadoutMustNotContain,
  allItemsMatch,
  someItemsMatch,
  minLoadoutEfficiency,
  // Stage constraints
  withinCostThreshold,
  costMustIncrease,
  minCostIncrease as minStageCostIncrease,
  maxCostIncrease as maxStageCostIncrease,
  minTotalRecoveryFromPrevious,
  maxWasteFromPrevious,
  maxWastePercentFromPrevious,
  maxTransitionCost,
  atStageIndex,
  onlyAtStage,
  afterStage,
  // Combinators
  allStageConstraints,
  anyStageConstraint,
  notStageConstraint,
  allLoadoutConstraints,
  anyLoadoutConstraint,
  // Pre-built constraint sets
  standardSequenceConstraints,
  strictSequenceConstraints,
  relaxedSequenceConstraints,
} from "./stageConstraints";

// Stage scorers
export {
  // Adapters
  fromTransitionScorer,
  // Loadout-based scorers
  loadoutEfficiencyScore,
  budgetUtilizationScore,
  budgetRemainingScore,
  averageItemEfficiencyScore,
  loadoutUtilityScore,
  loadoutStatValueScore,
  // Transition-based scorers
  stageReuseScore,
  stageWasteAvoidanceScore,
  stageCostDeltaScore,
  stageAffordabilityScore,
  transitionValueEfficiencyScore,
  // Combinators
  weightedStageScore,
  maxStageScore,
  minStageScore,
  averageStageScore,
  transformStageScore,
  clampStageScore,
  // Pre-built scorer configurations
  createBalancedStageScorer,
  createReuseStageScorer,
  createValueStageScorer,
  createEconomyStageScorer,
  // Sequence scoring
  scoreSequence,
  createScoredSequence,
  createWeightedSequenceScorer,
} from "./stageScorers";

// Build progression (unified module)
export {
  analyzeProgression,
  stagesFromCosts,
  stagesForTargets,
  stagesForIncrementalTargets,
  formatProgression,
  formatProgressionStats,
} from "./buildProgression";

// Re-export sequence types
export type {
  BuildStage,
  StageConstraint,
  StageScorer,
  LoadoutConstraint,
  BuildSequence,
  StageConfig,
  BuildSequenceOptions,
  BuildSequenceResult,
  BuildSequenceStats,
  StageAnalysisStats,
  // Build progression types
  StageDefinition,
  BuildProgressionOptions,
  BuildProgressionResult,
  BuildProgressionStats,
  // Progress reporting types
  ProgressionPhase,
  ProgressionProgressUpdate,
  ProgressionProgressCallback,
} from "../models/buildTypes";
