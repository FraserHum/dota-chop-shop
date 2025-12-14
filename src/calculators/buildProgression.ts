/**
 * Build Progression Analysis
 *
 * Unified module for analyzing build paths through multiple stages.
 * Supports both cost-based sequences (like the sequences command) and
 * target-item pathfinding (like the pathfind command).
 *
 * Key features:
 * - Stage definitions with cost thresholds AND required items
 * - Beam search for efficient exploration
 * - Component reuse tracking between stages
 * - Flexible scoring and constraints
 *
 * @example
 * ```ts
 * // Cost-based progression
 * const result1 = analyzeProgression(items, config, {
 *   stages: [
 *     { maxCost: 2000 },
 *     { maxCost: 4000 },
 *     { maxCost: 7000 },
 *   ],
 * });
 *
 * // Target-based progression
 * const result2 = analyzeProgression(items, config, {
 *   stages: [
 *     { maxCost: 3000 },
 *     { maxCost: 15000, requiredItems: ["Force Staff", "Skadi"] },
 *   ],
 * });
 *
 * // Progressive target acquisition
 * const result3 = analyzeProgression(items, config, {
 *   stages: [
 *     { maxCost: 2500 },
 *     { maxCost: 4500, requiredItems: ["Force Staff"] },
 *     { maxCost: 8000, requiredItems: ["Skadi"] },
 *   ],
 * });
 * ```
 */

import { Item, StatValuation } from "../models/types";
import {
  BuildStage,
  BuildSequence,
  BuildProgressionOptions,
  BuildProgressionResult,
  BuildProgressionStats,
  StageDefinition,
  StageConstraint,
  StageScorer,
  StageAnalysisStats,
  ComponentPool,
  ProgressionProgressCallback,
  ProgressionProgressUpdate,
  ProgressionPhase,
  Loadout,
} from "../models/buildTypes";
import { ItemRepository } from "../data/ItemRepository";
import { AnalysisConfig, DEFAULT_CONFIG } from "../config/analysisConfig";
import {
  createTransition,
  disassembleLoadout,
  planAssemblyFromPool,
  createLoadoutWithLeftovers,
  createLoadout,
  SlotOptions,
} from "./loadout";
import {
  filteredCombinations,
  variableSizeCombinations,
  noDuplicateBoots as noDuplicateBootsItemFilter,
  maxTotalCost,
  minTotalCost,
  combineFilters,
} from "./combinations";
import {
  standardSequenceConstraints,
  allStageConstraints,
  minTotalRecoveryFromPrevious,
  fromLoadoutConstraint,
  loadoutMustContain,
  loadoutMustNotContain,
} from "./stageConstraints";
import { createBalancedStageScorer } from "./stageScorers";
import {
  LoadoutCache,
  BoundedPriorityQueue,
  hasGoodGoldRecovery,
  findRelevantUpgradeTargets,
  findRelevantItems,
  quickReuseRatio,
  combinationsWithRequired,
  variableCombinationsWithRequired,
} from "./searchUtils";
import { resolveStageTargets } from "./itemResolution";

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Build a constraint that requires specific items in the loadout.
 */
function requiredItemsConstraint(items: readonly Item[]): StageConstraint {
  if (items.length === 0) return () => true;
  
  const constraints = items.map((item) =>
    fromLoadoutConstraint(loadoutMustContain(item.name))
  );
  return allStageConstraints(...constraints);
}

/**
 * Build a constraint that excludes specific items from the loadout.
 */
function excludedItemsConstraint(itemNames: readonly string[]): StageConstraint {
  if (itemNames.length === 0) return () => true;
  
  const constraints = itemNames.map((name) =>
    fromLoadoutConstraint(loadoutMustNotContain(name))
  );
  return allStageConstraints(...constraints);
}

/**
 * Create an empty component pool.
 * Used as the starting point for stage 0.
 */
function createEmptyPool(): ComponentPool {
  return {
    components: [],
    componentCounts: {},
    totalValue: 0,
    recipeRecovery: 0,
  };
}

/**
 * Inject boots into a component pool.
 * 
 * If the pool doesn't already contain "boots", adds one.
 * This is used to enforce boot requirements by injection rather than filtering.
 * Once boots are in the pool, they will naturally flow through all subsequent
 * stages (either assembled into a boot item or as leftover components).
 * 
 * @param pool - Existing component pool
 * @param repo - ItemRepository for looking up boots cost
 * @returns Component pool with boots guaranteed to be present
 */
function injectBootsIntoPool(
  pool: ComponentPool,
  repo: ItemRepository
): ComponentPool {
  // Check if boots already in pool
  if ((pool.componentCounts["boots"] ?? 0) > 0) {
    return pool;
  }
  
  const newComponents = [...pool.components, "boots"];
  
  // Add boots to existing pool
  return {
    components: newComponents,
    componentCounts: { ...pool.componentCounts, boots: 1 },
    totalValue: repo.getComponentsGoldValue(newComponents),
    recipeRecovery: pool.recipeRecovery,
  };
}


/**
 * Create a progress update object with a formatted message.
 */
function createProgressUpdate(
  phase: ProgressionPhase,
  totalStages: number,
  startTime: number,
  opts: {
    stageIndex?: number;
    evaluated?: number;
    valid?: number;
    sequenceIndex?: number;
    totalSequences?: number;
  } = {}
): ProgressionProgressUpdate {
  const elapsedMs = Date.now() - startTime;
  const { stageIndex, evaluated, valid, sequenceIndex, totalSequences } = opts;

  // Build human-readable message
  let message: string;
  switch (phase) {
    case 'initializing':
      message = 'Initializing analysis...';
      break;
    case 'resolving':
      message = 'Resolving target items...';
      break;
    case 'generating':
      if (stageIndex !== undefined) {
        const evalStr = evaluated !== undefined ? ` (${evaluated.toLocaleString()} evaluated` : '';
        const validStr = valid !== undefined ? `, ${valid.toLocaleString()} valid)` : evalStr ? ')' : '';
        message = `Stage ${stageIndex + 1}/${totalStages}: Generating loadouts...${evalStr}${validStr}`;
      } else {
        message = 'Generating loadouts...';
      }
      break;
    case 'expanding':
      if (stageIndex !== undefined) {
        const seqStr = sequenceIndex !== undefined && totalSequences !== undefined
          ? ` (seq ${sequenceIndex + 1}/${totalSequences})`
          : '';
        const evalStr = evaluated !== undefined ? ` [${evaluated.toLocaleString()} evaluated]` : '';
        message = `Stage ${stageIndex + 1}/${totalStages}: Expanding${seqStr}${evalStr}`;
      } else {
        message = 'Expanding sequences...';
      }
      break;
    case 'finalizing':
      message = `Finalizing results... (${totalStages} stages complete)`;
      break;
    default:
      message = 'Processing...';
  }

  return {
    phase,
    stageIndex,
    totalStages,
    evaluated,
    valid,
    sequenceIndex,
    totalSequences,
    elapsedMs,
    message,
  };
}

/**
 * Build the item pool for a stage, considering required items and filters.
 * 
 * Note: We don't enforce a minimum item cost by default. The natural constraints
 * of limited inventory slots, budget utilization scoring, and component reuse
 * incentives will push toward higher-value items without artificial floors.
 * 
 * @param includeComponents - If true (default), includes component items like
 *   Boots of Speed, Blades of Attack, etc. in the pool as standalone items.
 */
function buildStageItemPool(
  repo: ItemRepository,
  config: AnalysisConfig,
  stage: StageDefinition,
  requiredItems: readonly Item[],
  includeComponents: boolean = true
): Item[] {
  // Start with upgraded items (items with components)
  const allUpgraded = repo.getAllUpgradedItems();
  
  // Optionally include component items (base items with no components)
  // These can be useful as standalone items in early game builds
  let basePool: Item[];
  if (includeComponents) {
    // Include both upgraded items and component items that have stats
    const componentItems = repo.getAll().filter(
      (item) =>
        item.isComponent &&
        !item.isConsumable &&
        Object.keys(item.stats).length > 0 // Only include components that provide stats
    );
    basePool = [...allUpgraded, ...componentItems];
  } else {
    basePool = allUpgraded;
  }
  
  // Filter by max cost and gold recovery (no minimum cost by default)
  let pool = basePool.filter(
    (item) =>
      item.cost <= stage.maxCost &&
      // For component items, skip gold recovery check (they have no components to recover)
      (item.isComponent || hasGoodGoldRecovery(item, repo, config))
  );
  
  // Apply excluded items
  if (stage.excludedItems && stage.excludedItems.length > 0) {
    const excludedSet = new Set(
      stage.excludedItems.map((n) => n.toLowerCase())
    );
    pool = pool.filter(
      (item) =>
        !excludedSet.has(item.name.toLowerCase()) &&
        !excludedSet.has(item.displayName.toLowerCase())
    );
  }
  
  // Remove required items from pool (they'll be added separately)
  const requiredNames = new Set(requiredItems.map((i) => i.name));
  pool = pool.filter((item) => !requiredNames.has(item.name));
  
  // If we have required items, prioritize items that share components
  if (requiredItems.length > 0) {
    const relevantItems = findRelevantItems(requiredItems, pool, repo);
    const relevantSet = new Set(relevantItems.map((i) => i.name));
    
    // Sort: relevant items first, then by cost
    pool.sort((a, b) => {
      const aRelevant = relevantSet.has(a.name) ? 1 : 0;
      const bRelevant = relevantSet.has(b.name) ? 1 : 0;
      if (aRelevant !== bRelevant) return bRelevant - aRelevant;
      return b.cost - a.cost; // Higher cost items first (more likely to use budget)
    });
  }
  
  return pool;
}

// ─────────────────────────────────────────────────────────────
// Stage Generation
// ─────────────────────────────────────────────────────────────

interface StageCandidateResult {
  stages: BuildStage[];
  stats: StageAnalysisStats;
}

/**
 * Generate stage loadouts from a component pool.
 * 
 * This is the unified stage generation function that treats all stages
 * the same way: given an input component pool, generate valid loadouts
 * by assembling items from that pool (plus new purchases within budget).
 * 
 * For stage 0, pass an empty pool (or a pool with boots if required).
 * For later stages, pass the disassembled components from the previous stage.
 * 
 * @param repo - ItemRepository for component resolution
 * @param config - Analysis configuration
 * @param stageDef - Stage definition (cost limits, requirements, etc.)
 * @param itemCount - Maximum number of assembled items
 * @param statValuation - Stat valuations for scoring
 * @param constraint - Stage constraint to apply
 * @param scorer - Stage scorer
 * @param beamWidth - Number of top candidates to keep
 * @param requiredItems - Items that must be in the loadout
 * @param inputPool - Component pool to build from
 * @param includeComponents - Include component items in pool (default: true)
 * @param slotOptions - Slot configuration for inventory/backpack
 * @param onEvaluationProgress - Optional callback for progress updates (called every 10k evals)
 */
function generateStageLoadouts(
  repo: ItemRepository,
  config: AnalysisConfig,
  stageDef: StageDefinition,
  itemCount: number,
  statValuation: StatValuation | undefined,
  constraint: StageConstraint,
  scorer: StageScorer,
  beamWidth: number,
  requiredItems: readonly Item[],
  inputPool: ComponentPool,
  includeComponents: boolean = true,
  slotOptions?: SlotOptions,
  onEvaluationProgress?: (evaluated: number, valid: number) => void
): StageCandidateResult {
  // Build item pool (items we can potentially assemble)
  const itemPool = buildStageItemPool(
    repo,
    config,
    stageDef,
    requiredItems,
    includeComponents
  );
  
  const results = new BoundedPriorityQueue<{ stage: BuildStage; score: number }>(
    beamWidth,
    (a, b) => b.score - a.score
  );
  
  // Calculate budget for new purchases
  // Budget = maxCost - poolValue + recipeRecovery
  const newPurchaseBudget = stageDef.maxCost - inputPool.totalValue + inputPool.recipeRecovery;
  
  // If budget is negative, we can't build anything meaningful
  if (newPurchaseBudget < 0) {
    return {
      stages: [],
      stats: {
        stageIndex: 0,
        costThreshold: stageDef.maxCost,
        candidatesEvaluated: 0,
        validCandidates: 0,
        averageScore: 0,
      },
    };
  }
  
  const bootFilter = noDuplicateBootsItemFilter(config);
  // Upper bound on item cost (will do precise check with planAssemblyFromPool)
  const costFilter = maxTotalCost(stageDef.maxCost + inputPool.recipeRecovery);
  const minCostFilter = stageDef.minCost ? minTotalCost(stageDef.minCost) : undefined;
  const combinedFilter = minCostFilter
    ? combineFilters(bootFilter, costFilter, minCostFilter)
    : combineFilters(bootFilter, costFilter);
  
  let evaluated = 0;
  let valid = 0;
  let scoreSum = 0;
  
  // Generate variable-size combinations (1 to itemCount items)
  const readonlyFilter = combinedFilter as (items: readonly Item[]) => boolean;
  const comboGen =
    requiredItems.length > 0
      ? variableCombinationsWithRequired(itemPool, itemCount, requiredItems, readonlyFilter)
      : variableSizeCombinations(itemPool, itemCount, combinedFilter);
  
  for (const combo of comboGen) {
    evaluated++;

    // Report progress every 5,000 evaluations (or on first evaluation)
    if (onEvaluationProgress && (evaluated === 1 || evaluated % 5000 === 0)) {
      onEvaluationProgress(evaluated, valid);
    }
    
    // Plan how to assemble this combo from our pool
    const plan = planAssemblyFromPool(combo, inputPool, repo, stageDef.maxCost);
    
    // Skip invalid assemblies (over budget)
    if (!plan.isValid) continue;
    
    // Check if we can afford the new purchases
    if (plan.totalNewGoldNeeded > newPurchaseBudget) continue;
    
    // Create loadout with any leftover components
    const loadout = createLoadoutWithLeftovers(
      combo,
      plan.leftoverFromPool,
      repo,
      statValuation,
      slotOptions
    );
    
    const stage: BuildStage = {
      loadout,
      stageIndex: 0, // Will be set by caller
      costThreshold: stageDef.maxCost,
      transition: null, // Will be set by caller for non-initial stages
    };
    
    if (constraint(stage, null)) {
      const score = scorer(stage, null);
      valid++;
      scoreSum += score;
      results.add({ stage, score });
    }
  }
  
  // Final progress report
  if (onEvaluationProgress) {
    onEvaluationProgress(evaluated, valid);
  }

  return {
    stages: results.toArray().map((r) => r.stage),
    stats: {
      stageIndex: 0,
      costThreshold: stageDef.maxCost,
      candidatesEvaluated: evaluated,
      validCandidates: valid,
      averageScore: valid > 0 ? scoreSum / valid : 0,
    },
  };
}

/**
 * Expand sequences to the next stage using component retention model.
 * 
 * When transitioning between stages:
 * 1. Disassemble all items from previous stage into base components
 * 2. Sell recipes (100% recovery - Gyro's innate)
 * 3. ALL components must be retained (either in assembled items or as leftovers)
 * 4. Budget for new purchases = maxCost - poolValue + recipeRecovery
 * 5. Leftover components count toward cost but not item limit
 */
function expandToNextStage(
  currentSequences: BuildSequence[],
  repo: ItemRepository,
  config: AnalysisConfig,
  stageIndex: number,
  stageDef: StageDefinition,
  itemCount: number,
  statValuation: StatValuation | undefined,
  constraint: StageConstraint,
  scorer: StageScorer,
  beamWidth: number,
  minReuseRatio: number,
  requiredItems: readonly Item[],
  includeComponents: boolean = true,
  slotOptions?: SlotOptions,
  onExpansionProgress?: (sequenceIndex: number, totalSequences: number, evaluated: number, valid: number) => void
): { sequences: BuildSequence[]; stats: StageAnalysisStats } {
  const results = new BoundedPriorityQueue<BuildSequence>(
    beamWidth,
    (a, b) => b.totalScore - a.totalScore
  );
  
  const bootFilter = noDuplicateBootsItemFilter(config);
  
  let evaluated = 0;
  let valid = 0;
  let scoreSum = 0;
  const totalSequences = currentSequences.length;
  
  for (let seqIdx = 0; seqIdx < currentSequences.length; seqIdx++) {
    const sequence = currentSequences[seqIdx];
    const lastStage = sequence.stages[sequence.stages.length - 1];
    const lastLoadout = lastStage.loadout;

    // Report progress at start of each sequence
    if (onExpansionProgress) {
      onExpansionProgress(seqIdx, totalSequences, evaluated, valid);
    }
    
    // Step 1: Disassemble previous loadout into component pool
    let componentPool = disassembleLoadout(lastLoadout, repo);
    
    // Inject boots if required for this stage (and not already present)
    if (stageDef.requireBoots) {
      componentPool = injectBootsIntoPool(componentPool, repo);
    }
    
    // Step 2: Calculate budget for new purchases
    // Budget = maxCost - poolValue + recipeRecovery
    const newPurchaseBudget = stageDef.maxCost - componentPool.totalValue + componentPool.recipeRecovery;
    
    // If budget is negative, we can't progress (previous stage too expensive)
    if (newPurchaseBudget < 0) continue;
    
    // Step 3: Build item pool - items we might want to assemble
    // These should be items that either:
    // - Use components from our pool
    // - Are affordable within our budget for new components
    // - Were in the previous loadout (can be "kept" by rebuilding)
    const pool = buildStageItemPool(
      repo,
      config,
      stageDef,
      requiredItems,
      includeComponents
    );
    
    // Prioritize items that share components with our pool
    const relevantPool = findRelevantUpgradeTargets(lastLoadout, pool, repo);
    const searchPool = relevantPool.length >= itemCount ? relevantPool : pool;
    
    // Filter: no duplicate boots, respect stage max cost
    // Note: We'll do more precise budget checking with planAssemblyFromPool
    const combinedFilter = combineFilters(
      bootFilter,
      maxTotalCost(stageDef.maxCost + componentPool.recipeRecovery) // Upper bound
    );
    
    // Generate combinations of assembled items
    const readonlyFilter = combinedFilter as (items: readonly Item[]) => boolean;
    const comboGen =
      requiredItems.length > 0
        ? variableCombinationsWithRequired(searchPool, itemCount, requiredItems, readonlyFilter)
        : variableSizeCombinations(searchPool, itemCount, combinedFilter);
    
    for (const combo of comboGen) {
      evaluated++;
      
      // Step 4: Plan how to assemble this combo from our pool
      const plan = planAssemblyFromPool(combo, componentPool, repo, stageDef.maxCost);
      
      // Check if assembly is valid (within budget)
      if (!plan.isValid) continue;
      
      // Check if we can afford the new purchases
      if (plan.totalNewGoldNeeded > newPurchaseBudget) continue;
      
      // Step 5: Create loadout with leftover components
      const nextLoadout = createLoadoutWithLeftovers(
        combo,
        plan.leftoverFromPool,
        repo,
        statValuation,
        slotOptions
      );
      
      // Calculate reuse ratio based on components (not item overlap)
      // Reuse = components used from pool / total pool components
      const reuseRatio = componentPool.components.length > 0
        ? plan.usedFromPool.length / componentPool.components.length
        : 0;
      
      if (reuseRatio < minReuseRatio) continue;
      
      // Create transition and stage
      const transition = createTransition(lastLoadout, nextLoadout, repo);
      const nextStage: BuildStage = {
        loadout: nextLoadout,
        stageIndex,
        costThreshold: stageDef.maxCost,
        transition,
      };
      
      // Apply constraints
      if (!constraint(nextStage, lastStage)) continue;
      
      // Score the stage
      const stageScore = scorer(nextStage, lastStage);
      valid++;
      scoreSum += stageScore;
      
      // Build new sequence
      const newStages = [...sequence.stages, nextStage];
      const newStageScores = [...sequence.stageScores, stageScore];
      const newTotalScore =
        newStageScores.reduce((sum, s) => sum + s, 0) / newStageScores.length;
      
      results.add({
        stages: newStages,
        totalScore: newTotalScore,
        stageScores: newStageScores,
      });
    }
  }
  
  return {
    sequences: results.toArray(),
    stats: {
      stageIndex,
      costThreshold: stageDef.maxCost,
      candidatesEvaluated: evaluated,
      validCandidates: valid,
      averageScore: valid > 0 ? scoreSum / valid : 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Main Analysis Function
// ─────────────────────────────────────────────────────────────

/**
 * Analyze build progression through multiple stages.
 *
 * Supports both cost-based sequences and target-item pathfinding
 * through a unified interface.
 *
 * @param items - All available items
 * @param config - Analysis configuration
 * @param options - Progression analysis options
 * @param itemRepo - Optional pre-built ItemRepository
 * @returns Analysis result with top sequences and statistics
 *
 * @example
 * ```ts
 * // Simple cost thresholds
 * const result = analyzeProgression(items, config, {
 *   stages: [
 *     { maxCost: 2000 },
 *     { maxCost: 4000 },
 *     { maxCost: 7000 },
 *   ],
 * });
 *
 * // With required items
 * const result2 = analyzeProgression(items, config, {
 *   stages: [
 *     { maxCost: 3000 },
 *     { maxCost: 6000, requiredItems: ["Force Staff"] },
 *   ],
 * });
 * ```
 */
export function analyzeProgression(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  options: BuildProgressionOptions,
  itemRepo?: ItemRepository
): BuildProgressionResult {
  const startTime = Date.now();
  const repo = itemRepo ?? new ItemRepository(items);
  
  const {
    stages,
    globalConstraints = [],
    defaultScorer,
    defaultItemCount = 3,
    resultLimit = 20,
    beamWidth = resultLimit * 10,
    minTotalRecovery = 0.3,
    statValuation,
    auraMultiplier = 1.0,
    targetCoverageWeight = 0.4,
    inventorySlots,
    backpackSlots,
    onProgress,
  } = options;

  const slotOptions = { inventorySlots, backpackSlots };
  const totalStages = stages.length;

  // Helper to report progress if callback provided
  const reportProgress = (
    phase: ProgressionPhase,
    opts: Parameters<typeof createProgressUpdate>[3] = {}
  ) => {
    if (onProgress) {
      onProgress(createProgressUpdate(phase, totalStages, startTime, opts));
    }
  };
  
  // Handle empty stages
  if (stages.length === 0) {
    return {
      sequences: [],
      resolvedTargets: new Map(),
      unresolvedTargets: new Map(),
      stats: {
        totalEvaluated: 0,
        validCount: 0,
        averageScore: 0,
        bestScore: 0,
        stageStats: [],
        searchTimeMs: 0,
        targetCoverage: 0,
        totalRequiredItems: 0,
        resolvedRequiredItems: 0,
      },
    };
  }
  
  // Report initialization
  reportProgress('initializing');

  // Resolve required items for each stage
  reportProgress('resolving');
  const stageTargetsMap = new Map<number, readonly string[]>();
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].requiredItems && stages[i].requiredItems!.length > 0) {
      stageTargetsMap.set(i, stages[i].requiredItems!);
    }
  }
  
  const { resolved: resolvedTargets, unresolved: unresolvedTargets } =
    resolveStageTargets(stageTargetsMap, repo);
  
  // Count total and resolved required items
  let totalRequiredItems = 0;
  let resolvedRequiredItems = 0;
  for (const [stageIdx, names] of stageTargetsMap) {
    totalRequiredItems += names.length;
    resolvedRequiredItems += resolvedTargets.get(stageIdx)?.length ?? 0;
  }
  
  // Build default scorer if not provided
  const scorer =
    defaultScorer ??
    (statValuation
      ? createBalancedStageScorer(statValuation, auraMultiplier)
      : createBalancedStageScorer({} as StatValuation, auraMultiplier));
  
  // Build base constraints
  const baseConstraint = standardSequenceConstraints(config);
  const reuseConstraint = minTotalRecoveryFromPrevious(minTotalRecovery);
  
  const stageStats: StageAnalysisStats[] = [];
  let totalEvaluated = 0;
  
  // Process stage 0
  const stage0Def = stages[0];
  const stage0Required = resolvedTargets.get(0) ?? [];
  const stage0ItemCount = stage0Def.itemCount ?? defaultItemCount;
  
  // Build stage 0 constraints
  let stage0Constraint = allStageConstraints(baseConstraint, reuseConstraint);
  if (globalConstraints.length > 0) {
    stage0Constraint = allStageConstraints(stage0Constraint, ...globalConstraints);
  }
  if (stage0Def.constraints) {
    stage0Constraint = allStageConstraints(stage0Constraint, ...stage0Def.constraints);
  }
  if (stage0Required.length > 0) {
    stage0Constraint = allStageConstraints(
      stage0Constraint,
      requiredItemsConstraint(stage0Required)
    );
  }
  if (stage0Def.excludedItems && stage0Def.excludedItems.length > 0) {
    stage0Constraint = allStageConstraints(
      stage0Constraint,
      excludedItemsConstraint(stage0Def.excludedItems)
    );
  }
  // Note: requireBoots is handled via pool injection, not constraints
  
  const stage0Scorer = stage0Def.scorer ?? scorer;
  
  // Create initial component pool (empty, or with boots if required)
  let stage0Pool = createEmptyPool();
  if (stage0Def.requireBoots) {
    stage0Pool = injectBootsIntoPool(stage0Pool, repo);
  }
  
  // Determine whether to include component items for stage 0
  // Default to true if not specified at the stage level
  const stage0IncludeComponents = stage0Def.allowRawComponents ?? true;

  // Report stage 0 generation start
  reportProgress('generating', { stageIndex: 0 });

  const { stages: initialStages, stats: stage0Stats } = generateStageLoadouts(
    repo,
    config,
    stage0Def,
    stage0ItemCount,
    statValuation,
    stage0Constraint,
    stage0Scorer,
    beamWidth,
    stage0Required,
    stage0Pool,
    stage0IncludeComponents,
    slotOptions,
    onProgress
      ? (evaluated, valid) => reportProgress('generating', { stageIndex: 0, evaluated, valid })
      : undefined
  );
  
  stageStats.push(stage0Stats);
  totalEvaluated += stage0Stats.candidatesEvaluated;
  
  if (initialStages.length === 0) {
    return {
      sequences: [],
      resolvedTargets,
      unresolvedTargets,
      stats: {
        totalEvaluated,
        validCount: 0,
        averageScore: 0,
        bestScore: 0,
        stageStats,
        searchTimeMs: Date.now() - startTime,
        targetCoverage: 0,
        totalRequiredItems,
        resolvedRequiredItems,
      },
    };
  }
  
  // Convert initial stages to sequences
  let currentSequences: BuildSequence[] = initialStages.map((stage) => ({
    stages: [stage],
    totalScore: stage0Scorer(stage, null),
    stageScores: [stage0Scorer(stage, null)],
  }));
  
  // Process remaining stages
  for (let i = 1; i < stages.length; i++) {
    const stageDef = stages[i];
    const stageRequired = resolvedTargets.get(i) ?? [];
    const stageItemCount = stageDef.itemCount ?? defaultItemCount;
    
    // Build stage constraints
    let stageConstraint = allStageConstraints(baseConstraint, reuseConstraint);
    if (globalConstraints.length > 0) {
      stageConstraint = allStageConstraints(stageConstraint, ...globalConstraints);
    }
    if (stageDef.constraints) {
      stageConstraint = allStageConstraints(stageConstraint, ...stageDef.constraints);
    }
    if (stageRequired.length > 0) {
      stageConstraint = allStageConstraints(
        stageConstraint,
        requiredItemsConstraint(stageRequired)
      );
    }
    if (stageDef.excludedItems && stageDef.excludedItems.length > 0) {
      stageConstraint = allStageConstraints(
        stageConstraint,
        excludedItemsConstraint(stageDef.excludedItems)
      );
    }
    // Note: requireBoots is handled via pool injection in expandToNextStage
    
    const stageScorer = stageDef.scorer ?? scorer;

    // Determine whether to include component items for this stage
    // Default to true if not specified at the stage level
    const stageIncludeComponents = stageDef.allowRawComponents ?? true;

    // Report stage expansion start
    reportProgress('expanding', {
      stageIndex: i,
      totalSequences: currentSequences.length,
    });
    
    const { sequences: nextSequences, stats: nextStats } = expandToNextStage(
      currentSequences,
      repo,
      config,
      i,
      stageDef,
      stageItemCount,
      statValuation,
      stageConstraint,
      stageScorer,
      beamWidth,
      minTotalRecovery,
      stageRequired,
      stageIncludeComponents,
      slotOptions,
      onProgress
        ? (seqIdx, totalSeqs, evaluated, valid) =>
            reportProgress('expanding', {
              stageIndex: i,
              sequenceIndex: seqIdx,
              totalSequences: totalSeqs,
              evaluated,
              valid,
            })
        : undefined
    );
    
    stageStats.push(nextStats);
    totalEvaluated += nextStats.candidatesEvaluated;
    
    if (nextSequences.length === 0) {
      // No valid sequences at this stage
      return {
        sequences: [],
        resolvedTargets,
        unresolvedTargets,
        stats: {
          totalEvaluated,
          validCount: 0,
          averageScore: 0,
          bestScore: 0,
          stageStats,
          searchTimeMs: Date.now() - startTime,
          targetCoverage: resolvedRequiredItems / Math.max(1, totalRequiredItems),
          totalRequiredItems,
          resolvedRequiredItems,
        },
      };
    }
    
    currentSequences = nextSequences;
  }
  
  // Report finalizing
  reportProgress('finalizing', { evaluated: totalEvaluated });

  // Sort and limit final results
  currentSequences.sort((a, b) => b.totalScore - a.totalScore);
  const topSequences = currentSequences.slice(0, resultLimit);
  
  // Calculate stats
  const validCount = topSequences.length;
  const averageScore =
    validCount > 0
      ? topSequences.reduce((sum, s) => sum + s.totalScore, 0) / validCount
      : 0;
  const bestScore = validCount > 0 ? topSequences[0].totalScore : 0;
  
  // Calculate target coverage from actual results
  const targetCoverage =
    totalRequiredItems > 0
      ? resolvedRequiredItems / totalRequiredItems
      : 1;
  
  return {
    sequences: topSequences,
    resolvedTargets,
    unresolvedTargets,
    stats: {
      totalEvaluated,
      validCount,
      averageScore,
      bestScore,
      stageStats,
      searchTimeMs: Date.now() - startTime,
      targetCoverage,
      totalRequiredItems,
      resolvedRequiredItems,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────

/**
 * Create stage definitions from simple cost thresholds.
 *
 * Convenience function for converting sequence-style cost arrays
 * to stage definitions.
 *
 * @param costs - Array of cost thresholds
 * @returns Array of stage definitions
 *
 * @example
 * ```ts
 * const stages = stagesFromCosts([2000, 4000, 7000]);
 * // [{ maxCost: 2000 }, { maxCost: 4000 }, { maxCost: 7000 }]
 * ```
 */
export function stagesFromCosts(costs: readonly number[]): StageDefinition[] {
  return costs.map((maxCost) => ({ maxCost }));
}

/**
 * Create a two-stage progression for building towards target items.
 *
 * Creates stages where:
 * - Stage 1: Early items within earlyMaxCost
 * - Stage 2: Target items within finalMaxCost
 *
 * @param targetItems - Items required in the final stage
 * @param earlyMaxCost - Maximum cost for the early stage
 * @param finalMaxCost - Maximum cost for the final stage
 * @returns Array of stage definitions
 *
 * @example
 * ```ts
 * const stages = stagesForTargets(
 *   ["Force Staff", "Skadi"],
 *   3000,
 *   15000
 * );
 * // Stage 1: { maxCost: 3000 }
 * // Stage 2: { maxCost: 15000, requiredItems: ["Force Staff", "Skadi"] }
 * ```
 */
export function stagesForTargets(
  targetItems: readonly string[],
  earlyMaxCost: number,
  finalMaxCost: number
): StageDefinition[] {
  return [
    { maxCost: earlyMaxCost },
    { maxCost: finalMaxCost, requiredItems: targetItems },
  ];
}

/**
 * Create a multi-stage progression that acquires targets incrementally.
 *
 * Each stage adds one target item.
 *
 * @param targetItems - Items to acquire in order
 * @param costThresholds - Cost threshold for each stage (must have length = targetItems.length + 1)
 * @returns Array of stage definitions
 *
 * @example
 * ```ts
 * const stages = stagesForIncrementalTargets(
 *   ["Force Staff", "Skadi"],
 *   [2000, 4500, 10000]
 * );
 * // Stage 1: { maxCost: 2000 }
 * // Stage 2: { maxCost: 4500, requiredItems: ["Force Staff"] }
 * // Stage 3: { maxCost: 10000, requiredItems: ["Skadi"] }
 * ```
 */
export function stagesForIncrementalTargets(
  targetItems: readonly string[],
  costThresholds: readonly number[]
): StageDefinition[] {
  if (costThresholds.length !== targetItems.length + 1) {
    throw new Error(
      `costThresholds length (${costThresholds.length}) must be targetItems length + 1 (${targetItems.length + 1})`
    );
  }
  
  const stages: StageDefinition[] = [{ maxCost: costThresholds[0] }];
  
  for (let i = 0; i < targetItems.length; i++) {
    stages.push({
      maxCost: costThresholds[i + 1],
      requiredItems: [targetItems[i]],
    });
  }
  
  return stages;
}

// ─────────────────────────────────────────────────────────────
// Formatting Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Format a build progression result for display.
 *
 * @param result - The progression result to format
 * @param verbose - Include detailed transition info
 * @returns Formatted string
 */
export function formatProgression(
  result: BuildProgressionResult,
  verbose: boolean = false
): string {
  const lines: string[] = [];
  
  // Report unresolved targets
  if (result.unresolvedTargets.size > 0) {
    lines.push("⚠ Unresolved target items:");
    for (const [stageIdx, names] of result.unresolvedTargets) {
      lines.push(`  Stage ${stageIdx + 1}: ${names.join(", ")}`);
    }
    lines.push("");
  }
  
  if (result.sequences.length === 0) {
    lines.push("No valid build progressions found.");
    return lines.join("\n");
  }
  
  lines.push(`Found ${result.sequences.length} build progression(s):\n`);
  
  for (let seqIdx = 0; seqIdx < result.sequences.length; seqIdx++) {
    const sequence = result.sequences[seqIdx];
    
    lines.push(`═══ Progression ${seqIdx + 1} (Score: ${sequence.totalScore.toFixed(3)}) ═══`);
    
    for (let i = 0; i < sequence.stages.length; i++) {
      const stage = sequence.stages[i];
      const loadout = stage.loadout;
      
      // Format assembled items
      const itemNames = loadout.items
        .map((item) => item.displayName)
        .join(" + ");
      
      // Format leftover components (if any)
      const leftovers = loadout.leftoverComponents ?? [];
      const leftoverNames = leftovers.length > 0
        ? ` + [${leftovers.map((c) => c.displayName).join(", ")}]`
        : "";
      
      // Use total invested cost if available, otherwise totalCost
      const cost = loadout.totalInvestedCost ?? loadout.totalCost;
      const threshold = stage.costThreshold;
      const score = sequence.stageScores[i]?.toFixed(2) ?? "N/A";
      
      // Check for required items in this stage
      const requiredItems = result.resolvedTargets.get(i);
      const hasRequired = requiredItems && requiredItems.length > 0;
      const requiredMarker = hasRequired ? " [TARGET]" : "";
      
      if (i === 0) {
        lines.push(
          `Stage ${i + 1} (≤${threshold}g): ${itemNames}${leftoverNames} (${cost}g)${requiredMarker} [score: ${score}]`
        );
      } else {
        const prevStage = sequence.stages[i - 1];
        const prevCost = prevStage.loadout.totalInvestedCost ?? prevStage.loadout.totalCost;
        const transition = stage.transition;
        const goldDelta = cost - prevCost;
        // Include both reused components AND recovered recipe costs
        // This gives the intuitive result: keeping Pavise (1400g) = 100% reuse
        const reusePercent = transition
          ? Math.round(
              ((transition.componentFlow.reusedGold +
                transition.componentFlow.recoveredRecipeCost) /
                prevStage.loadout.totalCost) *
                100
            )
          : 0;
        
        lines.push(`    ↓ +${goldDelta}g, ${reusePercent}% reuse`);
        lines.push(
          `Stage ${i + 1} (≤${threshold}g): ${itemNames}${leftoverNames} (${cost}g)${requiredMarker} [score: ${score}]`
        );
        
        if (verbose && transition) {
          const flow = transition.componentFlow;
          lines.push(`      Components used: ${flow.reused.join(", ") || "none"}`);
          if (leftovers.length > 0) {
            lines.push(`      Leftovers (retained): ${leftovers.map((c) => c.displayName).join(", ")}`);
          }
          if (flow.acquired.length > 0) {
            lines.push(`      New components: ${flow.acquired.join(", ")}`);
          }
          lines.push(`      New gold needed: ${flow.totalGoldNeeded}g`);
        }
      }
    }
    
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format progression statistics for display.
 *
 * @param stats - The statistics to format
 * @returns Formatted string
 */
export function formatProgressionStats(stats: BuildProgressionStats): string {
  const lines: string[] = [
    `Total Evaluated: ${stats.totalEvaluated.toLocaleString()}`,
    `Valid Sequences: ${stats.validCount}`,
    `Average Score: ${stats.averageScore.toFixed(3)}`,
    `Best Score: ${stats.bestScore.toFixed(3)}`,
    `Search Time: ${stats.searchTimeMs}ms`,
  ];
  
  if (stats.totalRequiredItems > 0) {
    lines.push(
      `Target Coverage: ${(stats.targetCoverage * 100).toFixed(0)}% (${stats.resolvedRequiredItems}/${stats.totalRequiredItems})`
    );
  }
  
  lines.push("", "Per-Stage Statistics:");
  
  for (const stageStat of stats.stageStats) {
    lines.push(
      `  Stage ${stageStat.stageIndex + 1} (≤${stageStat.costThreshold}g): ` +
        `${stageStat.candidatesEvaluated.toLocaleString()} evaluated, ` +
        `${stageStat.validCandidates} valid, ` +
        `avg score ${stageStat.averageScore.toFixed(3)}`
    );
  }
  
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Async Worker-Based Analysis
// ─────────────────────────────────────────────────────────────

import {
  ProgressionWorkerInput,
  ProgressionWorkerMessage,
  SerializedBuildSequence,
} from "../workers/types";

/**
 * Options for async progression analysis.
 */
export interface AsyncProgressionOptions extends Omit<BuildProgressionOptions, 'onProgress'> {
  /** Progress callback - will be called from the main thread */
  onProgress?: ProgressionProgressCallback;
}

/**
 * Run progression analysis asynchronously in a worker thread.
 *
 * This allows the main thread to remain responsive and update the UI
 * (e.g., spinner animations) while the analysis runs.
 *
 * @param items - All available items
 * @param config - Analysis configuration
 * @param options - Analysis options including progress callback
 * @param itemRepo - Optional pre-built ItemRepository (not used, items are passed to worker)
 * @returns Promise resolving to the analysis result
 */
export async function analyzeProgressionAsync(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  options: AsyncProgressionOptions,
  itemRepo?: ItemRepository
): Promise<BuildProgressionResult> {
  const {
    stages,
    defaultItemCount = 3,
    resultLimit = 20,
    beamWidth = resultLimit * 10,
    minTotalRecovery = 0.3,
    statValuation,
    auraMultiplier = 1.0,
    targetCoverageWeight = 0.4,
    inventorySlots,
    backpackSlots,
    onProgress,
  } = options;

  // Prepare worker input
  const workerInput: ProgressionWorkerInput = {
    allItems: items,
    config,
    stages: stages as StageDefinition[], // Cast away readonly for serialization
    defaultItemCount,
    resultLimit,
    beamWidth,
    minTotalRecovery,
    statValuation,
    auraMultiplier,
    targetCoverageWeight,
    inventorySlots,
    backpackSlots,
  };

  return new Promise((resolve, reject) => {
    const workerUrl = new URL("../workers/progressionWorker.ts", import.meta.url);
    const worker = new Worker(workerUrl.href);

    worker.onmessage = (event: MessageEvent<ProgressionWorkerMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "progress":
          if (onProgress) {
            onProgress({
              phase: message.phase,
              stageIndex: message.stageIndex,
              totalStages: message.totalStages,
              evaluated: message.evaluated,
              valid: message.valid,
              sequenceIndex: message.sequenceIndex,
              totalSequences: message.totalSequences,
              elapsedMs: message.elapsedMs,
              message: message.message,
            });
          }
          break;

        case "result":
          worker.terminate();

          // Reconstruct the result with proper Item references
          const repo = itemRepo ?? new ItemRepository(items);
          const sequences = deserializeBuildSequences(
            message.sequences,
            repo,
            statValuation
          );

          // Convert arrays back to Maps
          const resolvedTargets = new Map<number, readonly Item[]>();
          for (const [stageIdx, itemNames] of message.resolvedTargets) {
            const resolvedItems = itemNames
              .map((name) => repo.getByName(name))
              .filter((item): item is Item => item !== undefined);
            resolvedTargets.set(stageIdx, resolvedItems);
          }

          const unresolvedTargets = new Map<number, readonly string[]>();
          for (const [stageIdx, names] of message.unresolvedTargets) {
            unresolvedTargets.set(stageIdx, names);
          }

          resolve({
            sequences,
            resolvedTargets,
            unresolvedTargets,
            stats: message.stats,
          });
          break;

        case "error":
          worker.terminate();
          reject(new Error(message.error));
          break;
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage(workerInput);
  });
}

/**
 * Deserialize build sequences from worker output.
 * Recreates transitions between stages for proper display.
 */
function deserializeBuildSequences(
  serialized: SerializedBuildSequence[],
  repo: ItemRepository,
  statValuation?: StatValuation
): BuildSequence[] {
  return serialized.map((s) => {
    // First pass: create all loadouts
    const loadouts: Loadout[] = s.stageItems.map((itemNames) => {
      const items = itemNames
        .map((name) => repo.getByName(name))
        .filter((item): item is Item => item !== undefined);

      return createLoadoutWithLeftovers(items, [], repo, statValuation);
    });

    // Second pass: create stages with transitions
    const stages: BuildStage[] = loadouts.map((loadout, stageIndex) => {
      // Recreate transition from previous stage
      const transition =
        stageIndex > 0
          ? createTransition(loadouts[stageIndex - 1], loadout, repo)
          : null;

      return {
        loadout,
        stageIndex,
        costThreshold: s.stageThresholds[stageIndex],
        transition,
      };
    });

    return {
      stages,
      totalScore: s.totalScore,
      stageScores: s.stageScores,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Exports for testing
// ─────────────────────────────────────────────────────────────

export const _testing = {
  buildStageItemPool,
  requiredItemsConstraint,
  excludedItemsConstraint,
  generateStageLoadouts,
  expandToNextStage,
  createEmptyPool,
  injectBootsIntoPool,
};
