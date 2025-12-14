import { describe, it, expect } from "bun:test";
import { ItemRepository } from "../data/ItemRepository";
import { createLoadout, createTransition } from "../calculators/loadout";
import {
  getAllTestItems,
  perfectRecoveryItem,
  goodRecoveryItem,
  mixedRecoveryItem,
  fullyReachableLateItem,
} from "./fixtures";
import {
  BuildStage,
  LoadoutTransition,
} from "../models/buildTypes";

// ─────────────────────────────────────────────────────────────
// Import Stage Constraints
// ─────────────────────────────────────────────────────────────
import {
  fromLoadoutConstraint,
  fromTransitionConstraint,
  maxLoadoutCost,
  minLoadoutCost,
  maxItemCount,
  minItemCount,
  loadoutMustContain,
  loadoutMustNotContain,
  allItemsMatch,
  someItemsMatch,
  withinCostThreshold,
  costMustIncrease,
  minCostIncrease,
  maxCostIncrease,
  minReuseFromPrevious,
  maxWasteFromPrevious,
  atStageIndex,
  onlyAtStage,
  afterStage,
  allStageConstraints,
  anyStageConstraint,
  notStageConstraint,
  allLoadoutConstraints,
  standardSequenceConstraints,
  strictSequenceConstraints,
  relaxedSequenceConstraints,
} from "../calculators/stageConstraints";

// ─────────────────────────────────────────────────────────────
// Import Stage Scorers
// ─────────────────────────────────────────────────────────────
import {
  fromTransitionScorer,
  loadoutEfficiencyScore,
  budgetUtilizationScore,
  budgetRemainingScore,
  averageItemEfficiencyScore,
  loadoutStatValueScore,
  stageReuseScore,
  stageWasteAvoidanceScore,
  transitionValueEfficiencyScore,
  weightedStageScore,
  maxStageScore,
  minStageScore,
  averageStageScore,
  transformStageScore,
  clampStageScore,
  createBalancedStageScorer,
  createReuseStageScorer,
  createValueStageScorer,
  createEconomyStageScorer,
  scoreSequence,
  createScoredSequence,
  createWeightedSequenceScorer,
} from "../calculators/stageScorers";

// ─────────────────────────────────────────────────────────────
// Import Build Progression Analysis
// ─────────────────────────────────────────────────────────────
import {
  analyzeProgression,
  stagesFromCosts,
  stagesForTargets,
  stagesForIncrementalTargets,
  formatProgression,
  formatProgressionStats,
} from "../calculators/buildProgression";

// ─────────────────────────────────────────────────────────────
// Import Search Utilities (for internal tests)
// ─────────────────────────────────────────────────────────────
import {
  BoundedPriorityQueue,
  LoadoutCache,
  quickReuseRatio,
  itemsToKey,
} from "../calculators/searchUtils";

import { DEFAULT_CONFIG } from "../config/analysisConfig";
import { calculateStatValuation } from "../calculators/statValuation";

// ─────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────

describe("Stage Constraints", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);
  const statValuation = calculateStatValuation(items);

  // Helper to create a stage
  const makeStage = (
    loadoutItems: typeof perfectRecoveryItem[],
    stageIndex: number,
    costThreshold: number,
    prevLoadoutItems?: typeof perfectRecoveryItem[]
  ): BuildStage => {
    const loadout = createLoadout(loadoutItems, repo, statValuation);
    let transition: LoadoutTransition | null = null;

    if (prevLoadoutItems) {
      const prevLoadout = createLoadout(prevLoadoutItems, repo, statValuation);
      transition = createTransition(prevLoadout, loadout, repo);
    }

    return {
      loadout,
      stageIndex,
      costThreshold,
      transition,
    };
  };

  // Helper to create a previous stage
  const makePrevStage = (
    loadoutItems: typeof perfectRecoveryItem[],
    stageIndex: number,
    costThreshold: number
  ): BuildStage => {
    const loadout = createLoadout(loadoutItems, repo, statValuation);
    return {
      loadout,
      stageIndex,
      costThreshold,
      transition: null,
    };
  };

  describe("Constraint Adapters", () => {
    it("fromLoadoutConstraint adapts loadout constraints to stage constraints", () => {
      const maxCost = fromLoadoutConstraint(maxLoadoutCost(500));
      
      const cheapStage = makeStage([perfectRecoveryItem], 0, 1000); // 200g
      const expensiveStage = makeStage([fullyReachableLateItem], 0, 5000); // 3000g
      
      expect(maxCost(cheapStage, null)).toBe(true);
      expect(maxCost(expensiveStage, null)).toBe(false);
    });

    it("fromTransitionConstraint adapts transition constraints", () => {
      const costIncrease = fromTransitionConstraint((t) => t.costDelta > 0);
      
      // Initial stage (no transition) always passes
      const initialStage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(costIncrease(initialStage, null)).toBe(true);
      
      // Upgrade stage with cost increase
      const upgradeStage = makeStage(
        [fullyReachableLateItem],
        1,
        5000,
        [perfectRecoveryItem]
      );
      const prevStage = makePrevStage([perfectRecoveryItem], 0, 1000);
      expect(costIncrease(upgradeStage, prevStage)).toBe(true);
    });
  });

  describe("Loadout Constraints", () => {
    it("maxLoadoutCost limits total cost", () => {
      const constraint = maxLoadoutCost(500);
      const loadout = createLoadout([perfectRecoveryItem], repo, statValuation); // 200g
      
      expect(constraint(loadout)).toBe(true);
      
      const expensiveLoadout = createLoadout([fullyReachableLateItem], repo, statValuation); // 3000g
      expect(constraint(expensiveLoadout)).toBe(false);
    });

    it("minLoadoutCost requires minimum cost", () => {
      const constraint = minLoadoutCost(100);
      const loadout = createLoadout([perfectRecoveryItem], repo, statValuation); // 200g
      
      expect(constraint(loadout)).toBe(true);
      expect(minLoadoutCost(500)(loadout)).toBe(false);
    });

    it("maxItemCount limits item count", () => {
      const loadout = createLoadout(
        [perfectRecoveryItem, goodRecoveryItem, mixedRecoveryItem],
        repo,
        statValuation
      );
      
      expect(maxItemCount(3)(loadout)).toBe(true);
      expect(maxItemCount(2)(loadout)).toBe(false);
    });

    it("minItemCount requires minimum items", () => {
      const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);
      
      expect(minItemCount(1)(loadout)).toBe(true);
      expect(minItemCount(2)(loadout)).toBe(false);
    });

    it("loadoutMustContain checks for specific item", () => {
      const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);
      
      expect(loadoutMustContain("perfect_recovery")(loadout)).toBe(true);
      expect(loadoutMustContain("Perfect Recovery Item")(loadout)).toBe(true);
      expect(loadoutMustContain("nonexistent")(loadout)).toBe(false);
    });

    it("loadoutMustNotContain excludes specific item", () => {
      const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);
      
      expect(loadoutMustNotContain("good_recovery")(loadout)).toBe(true);
      expect(loadoutMustNotContain("perfect_recovery")(loadout)).toBe(false);
    });

    it("allItemsMatch checks all items pass predicate", () => {
      const loadout = createLoadout(
        [perfectRecoveryItem, goodRecoveryItem],
        repo,
        statValuation
      );
      
      expect(allItemsMatch((i) => i.cost < 500)(loadout)).toBe(true);
      expect(allItemsMatch((i) => i.cost < 300)(loadout)).toBe(false);
    });

    it("someItemsMatch checks at least one item passes", () => {
      const loadout = createLoadout(
        [perfectRecoveryItem, goodRecoveryItem], // 200g, 400g
        repo,
        statValuation
      );
      
      expect(someItemsMatch((i) => i.cost > 300)(loadout)).toBe(true);
      expect(someItemsMatch((i) => i.cost > 500)(loadout)).toBe(false);
    });
  });

  describe("Stage Constraints", () => {
    it("withinCostThreshold checks stage cost vs threshold", () => {
      const cheapStage = makeStage([perfectRecoveryItem], 0, 500); // 200g, threshold 500
      const expensiveStage = makeStage([fullyReachableLateItem], 0, 500); // 3000g, threshold 500
      
      expect(withinCostThreshold(cheapStage, null)).toBe(true);
      expect(withinCostThreshold(expensiveStage, null)).toBe(false);
    });

    it("costMustIncrease ensures progression", () => {
      const stage1 = makeStage([perfectRecoveryItem], 0, 1000);
      const stage2 = makeStage([fullyReachableLateItem], 1, 5000, [perfectRecoveryItem]);
      
      // Initial stage always passes
      expect(costMustIncrease(stage1, null)).toBe(true);
      
      // Upgrade with cost increase
      expect(costMustIncrease(stage2, stage1)).toBe(true);
      
      // Downgrade fails
      const downgrade = makeStage([perfectRecoveryItem], 1, 5000, [fullyReachableLateItem]);
      const prevExpensive = makePrevStage([fullyReachableLateItem], 0, 5000);
      expect(costMustIncrease(downgrade, prevExpensive)).toBe(false);
    });

    it("minCostIncrease requires minimum delta", () => {
      const stage1 = makePrevStage([perfectRecoveryItem], 0, 1000); // 200g
      const stage2 = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]); // 400g
      
      expect(minCostIncrease(100)(stage2, stage1)).toBe(true);
      expect(minCostIncrease(500)(stage2, stage1)).toBe(false);
      
      // Initial stage always passes
      expect(minCostIncrease(1000)(stage1, null)).toBe(true);
    });

    it("maxCostIncrease limits jump size", () => {
      const stage1 = makePrevStage([perfectRecoveryItem], 0, 1000); // 200g
      const stage2 = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]); // 400g, delta=200
      
      expect(maxCostIncrease(500)(stage2, stage1)).toBe(true);
      expect(maxCostIncrease(100)(stage2, stage1)).toBe(false);
    });

    it("minReuseFromPrevious checks component reuse", () => {
      // perfectRecoveryItem (str+agi) -> goodRecoveryItem (str+int)
      // str is reused = 100g out of 200g = 50%
      const stage1 = makePrevStage([perfectRecoveryItem], 0, 1000);
      const stage2 = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]);
      
      expect(minReuseFromPrevious(0.4)(stage2, stage1)).toBe(true);
      expect(minReuseFromPrevious(0.6)(stage2, stage1)).toBe(false);
      
      // Initial stage always passes
      expect(minReuseFromPrevious(0.9)(stage1, null)).toBe(true);
    });

    it("maxWasteFromPrevious limits wasted gold", () => {
      // perfectRecoveryItem (str+agi) -> goodRecoveryItem (str+int)
      // agi is wasted = 100g
      const stage2 = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]);
      
      expect(maxWasteFromPrevious(100)(stage2, null)).toBe(true);
      expect(maxWasteFromPrevious(50)(stage2, null)).toBe(false);
    });

    it("atStageIndex matches specific stage", () => {
      const stage0 = makeStage([perfectRecoveryItem], 0, 1000);
      const stage1 = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]);
      
      expect(atStageIndex(0)(stage0, null)).toBe(true);
      expect(atStageIndex(0)(stage1, null)).toBe(false);
      expect(atStageIndex(1)(stage1, null)).toBe(true);
    });

    it("onlyAtStage applies constraint conditionally", () => {
      const maxCostAtStage0 = onlyAtStage(0, fromLoadoutConstraint(maxLoadoutCost(500)));
      
      const stage0Cheap = makeStage([perfectRecoveryItem], 0, 1000); // 200g
      const stage0Expensive = makeStage([fullyReachableLateItem], 0, 5000); // 3000g
      const stage1Expensive = makeStage([fullyReachableLateItem], 1, 5000, [perfectRecoveryItem]); // 3000g
      
      expect(maxCostAtStage0(stage0Cheap, null)).toBe(true);
      expect(maxCostAtStage0(stage0Expensive, null)).toBe(false);
      // Stage 1 skips the constraint
      expect(maxCostAtStage0(stage1Expensive, null)).toBe(true);
    });

    it("afterStage applies constraint only after specified stage", () => {
      const minCostAfterStage0 = afterStage(0, fromLoadoutConstraint(minLoadoutCost(1000)));
      
      const stage0 = makeStage([perfectRecoveryItem], 0, 1000); // 200g
      const stage1Cheap = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]); // 400g
      const stage1Expensive = makeStage([fullyReachableLateItem], 1, 5000, [perfectRecoveryItem]); // 3000g
      
      // Stage 0 skips constraint
      expect(minCostAfterStage0(stage0, null)).toBe(true);
      // Stage 1 applies constraint
      expect(minCostAfterStage0(stage1Cheap, null)).toBe(false);
      expect(minCostAfterStage0(stage1Expensive, null)).toBe(true);
    });
  });

  describe("Constraint Combinators", () => {
    it("allStageConstraints requires all to pass", () => {
      const combined = allStageConstraints(
        withinCostThreshold,
        fromLoadoutConstraint(minItemCount(1))
      );
      
      const validStage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(combined(validStage, null)).toBe(true);
      
      // Fails cost threshold
      const invalidStage = makeStage([fullyReachableLateItem], 0, 500);
      expect(combined(invalidStage, null)).toBe(false);
    });

    it("anyStageConstraint requires at least one to pass", () => {
      const combined = anyStageConstraint(
        fromLoadoutConstraint(maxLoadoutCost(100)), // Will fail (200g)
        fromLoadoutConstraint(minItemCount(1)) // Will pass
      );
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(combined(stage, null)).toBe(true);
    });

    it("notStageConstraint negates result", () => {
      const notWithinThreshold = notStageConstraint(withinCostThreshold);
      
      const underBudget = makeStage([perfectRecoveryItem], 0, 500);
      const overBudget = makeStage([fullyReachableLateItem], 0, 500);
      
      expect(notWithinThreshold(underBudget, null)).toBe(false);
      expect(notWithinThreshold(overBudget, null)).toBe(true);
    });

    it("allLoadoutConstraints combines loadout constraints", () => {
      const combined = allLoadoutConstraints(
        maxLoadoutCost(1000),
        minItemCount(1)
      );
      
      const valid = createLoadout([perfectRecoveryItem], repo, statValuation);
      expect(combined(valid)).toBe(true);
      
      const tooExpensive = createLoadout([fullyReachableLateItem], repo, statValuation);
      expect(combined(tooExpensive)).toBe(false);
    });
  });

  describe("Pre-Built Constraint Sets", () => {
    it("standardSequenceConstraints combines common constraints", () => {
      const constraint = standardSequenceConstraints(DEFAULT_CONFIG);
      
      const validStage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(constraint(validStage, null)).toBe(true);
      
      // Over budget fails
      const overBudget = makeStage([fullyReachableLateItem], 0, 500);
      expect(constraint(overBudget, null)).toBe(false);
    });

    it("strictSequenceConstraints adds reuse requirements", () => {
      const constraint = strictSequenceConstraints(DEFAULT_CONFIG);
      
      const stage1 = makePrevStage([perfectRecoveryItem], 0, 1000);
      
      // Low reuse fails (50% reuse < 50% threshold)
      const lowReuseStage = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]);
      expect(constraint(lowReuseStage, stage1)).toBe(false);
    });

    it("relaxedSequenceConstraints has minimal requirements", () => {
      const constraint = relaxedSequenceConstraints(DEFAULT_CONFIG);
      
      const validStage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(constraint(validStage, null)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Stage Scorers Tests
// ─────────────────────────────────────────────────────────────

describe("Stage Scorers", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);
  const statValuation = calculateStatValuation(items);

  const makeStage = (
    loadoutItems: typeof perfectRecoveryItem[],
    stageIndex: number,
    costThreshold: number,
    prevLoadoutItems?: typeof perfectRecoveryItem[]
  ): BuildStage => {
    const loadout = createLoadout(loadoutItems, repo, statValuation);
    let transition: LoadoutTransition | null = null;

    if (prevLoadoutItems) {
      const prevLoadout = createLoadout(prevLoadoutItems, repo, statValuation);
      transition = createTransition(prevLoadout, loadout, repo);
    }

    return {
      loadout,
      stageIndex,
      costThreshold,
      transition,
    };
  };

  describe("Scorer Adapters", () => {
    it("fromTransitionScorer returns default for initial stages", () => {
      const scorer = fromTransitionScorer((t) => t.costDelta / 1000, 0.5);
      
      const initialStage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(initialStage, null)).toBe(0.5);
    });

    it("fromTransitionScorer applies transition scorer for upgrades", () => {
      const scorer = fromTransitionScorer((t) => t.costDelta > 0 ? 1 : 0, 0.5);
      
      const upgradeStage = makeStage(
        [fullyReachableLateItem],
        1,
        5000,
        [perfectRecoveryItem]
      );
      expect(scorer(upgradeStage, null)).toBe(1);
    });
  });

  describe("Loadout-Based Scorers", () => {
    it("loadoutEfficiencyScore normalizes by max efficiency", () => {
      const scorer = loadoutEfficiencyScore(2.0);
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      const score = scorer(stage, null);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("budgetUtilizationScore measures threshold usage", () => {
      // 200g cost with 1000g threshold = 20% utilization
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      const score = budgetUtilizationScore(stage, null);
      
      expect(score).toBeCloseTo(0.2, 1);
    });

    it("budgetRemainingScore is inverse of utilization", () => {
      const stage = makeStage([perfectRecoveryItem], 0, 1000); // 200g / 1000g = 20%
      const score = budgetRemainingScore(stage, null);
      
      expect(score).toBeCloseTo(0.8, 1);
    });

    it("averageItemEfficiencyScore calculates per-item efficiency", () => {
      const scorer = averageItemEfficiencyScore(statValuation, 2.0);
      const stage = makeStage([perfectRecoveryItem, goodRecoveryItem], 0, 1000);
      
      const score = scorer(stage, null);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("loadoutStatValueScore normalizes total stat value", () => {
      const scorer = loadoutStatValueScore(5000);
      const stage = makeStage([fullyReachableLateItem], 0, 5000);
      
      const score = scorer(stage, null);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("Transition-Based Scorers", () => {
    it("stageReuseScore returns neutral for initial stages", () => {
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(stageReuseScore(stage, null)).toBe(0.5);
    });

    it("stageReuseScore scores component reuse for upgrades", () => {
      // perfectRecoveryItem (str+agi) -> goodRecoveryItem (str+int)
      // 50% reuse
      const stage = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]);
      const score = stageReuseScore(stage, null);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("stageWasteAvoidanceScore measures waste minimization", () => {
      const stage = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]);
      const score = stageWasteAvoidanceScore(stage, null);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("transitionValueEfficiencyScore measures value per gold", () => {
      const scorer = transitionValueEfficiencyScore(2);
      
      // Initial stage returns neutral
      const initial = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(initial, null)).toBe(0.5);
      
      // Upgrade stage scores based on value efficiency
      const upgrade = makeStage(
        [fullyReachableLateItem],
        1,
        5000,
        [perfectRecoveryItem]
      );
      const prev = makeStage([perfectRecoveryItem], 0, 1000);
      const score = scorer(upgrade, prev);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("Scorer Combinators", () => {
    it("weightedStageScore combines scorers with weights", () => {
      const scorer = weightedStageScore([
        { scorer: budgetUtilizationScore, weight: 0.5 },
        { scorer: budgetRemainingScore, weight: 0.5 },
      ]);
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      const score = scorer(stage, null);
      
      // 0.5 * 0.2 + 0.5 * 0.8 = 0.5
      expect(score).toBeCloseTo(0.5, 1);
    });

    it("maxStageScore returns highest score", () => {
      const scorer = maxStageScore(
        () => 0.3,
        () => 0.8,
        () => 0.5
      );
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(stage, null)).toBe(0.8);
    });

    it("minStageScore returns lowest score", () => {
      const scorer = minStageScore(
        () => 0.3,
        () => 0.8,
        () => 0.5
      );
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(stage, null)).toBe(0.3);
    });

    it("averageStageScore returns mean", () => {
      const scorer = averageStageScore(
        () => 0.3,
        () => 0.6,
        () => 0.9
      );
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(stage, null)).toBeCloseTo(0.6, 5);
    });

    it("transformStageScore applies transformation", () => {
      const scorer = transformStageScore(
        () => 0.5,
        (score) => score * 2
      );
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(stage, null)).toBe(1.0);
    });

    it("clampStageScore limits output range", () => {
      const scorer = clampStageScore(() => 2.0, 0, 1);
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      expect(scorer(stage, null)).toBe(1);
    });
  });

  describe("Pre-Built Scorers", () => {
    it("createBalancedStageScorer scores initial and upgrade stages", () => {
      const scorer = createBalancedStageScorer(statValuation);
      
      const initial = makeStage([perfectRecoveryItem], 0, 1000);
      const initialScore = scorer(initial, null);
      expect(initialScore).toBeGreaterThanOrEqual(0);
      expect(initialScore).toBeLessThanOrEqual(1);
      
      const upgrade = makeStage(
        [fullyReachableLateItem],
        1,
        5000,
        [perfectRecoveryItem]
      );
      const upgradeScore = scorer(upgrade, initial);
      expect(upgradeScore).toBeGreaterThanOrEqual(0);
      expect(upgradeScore).toBeLessThanOrEqual(1);
    });

    it("createReuseStageScorer emphasizes component reuse", () => {
      const scorer = createReuseStageScorer(statValuation);
      
      const stage = makeStage([goodRecoveryItem], 1, 1000, [perfectRecoveryItem]);
      const score = scorer(stage, null);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("createValueStageScorer emphasizes stat value", () => {
      const scorer = createValueStageScorer(statValuation);
      
      const stage = makeStage([fullyReachableLateItem], 0, 5000);
      const score = scorer(stage, null);
      
      expect(score).toBeGreaterThan(0);
    });

    it("createEconomyStageScorer emphasizes affordability", () => {
      const scorer = createEconomyStageScorer(statValuation);
      
      const stage = makeStage([perfectRecoveryItem], 0, 1000);
      const score = scorer(stage, null);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("Sequence Scoring", () => {
    it("scoreSequence computes per-stage and total scores", () => {
      const scorer = createBalancedStageScorer(statValuation);
      
      const stage1 = makeStage([perfectRecoveryItem], 0, 1000);
      const stage2 = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]);
      
      const sequence = {
        stages: [stage1, stage2],
        totalScore: 0,
        stageScores: [],
      };
      
      const result = scoreSequence(sequence, scorer);
      
      expect(result.perStage).toHaveLength(2);
      expect(result.perStage[0]).toBeGreaterThanOrEqual(0);
      expect(result.perStage[1]).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeCloseTo(
        (result.perStage[0] + result.perStage[1]) / 2,
        5
      );
    });

    it("createScoredSequence builds sequence with scores", () => {
      const scorer = createBalancedStageScorer(statValuation);
      
      const stage1 = makeStage([perfectRecoveryItem], 0, 1000);
      const stage2 = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]);
      
      const sequence = createScoredSequence([stage1, stage2], scorer);
      
      expect(sequence.stages).toHaveLength(2);
      expect(sequence.stageScores).toHaveLength(2);
      expect(sequence.totalScore).toBeGreaterThan(0);
    });

    it("createWeightedSequenceScorer uses stage weights", () => {
      const baseScorer = () => 1; // Always returns 1
      const weightedScorer = createWeightedSequenceScorer([1, 2], baseScorer);
      
      const stage1 = makeStage([perfectRecoveryItem], 0, 1000);
      const stage2 = makeStage([goodRecoveryItem], 1, 2000, [perfectRecoveryItem]);
      
      // (1 * 1 + 1 * 2) / (1 + 2) = 1
      const score = weightedScorer([stage1, stage2]);
      expect(score).toBeCloseTo(1, 5);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Build Progression Tests
// ─────────────────────────────────────────────────────────────

describe("Build Progression", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);
  const statValuation = calculateStatValuation(items);

  describe("Stage Definition Helpers", () => {
    it("stagesFromCosts creates stage definitions from cost array", () => {
      const stages = stagesFromCosts([2000, 4000, 7000]);
      
      expect(stages).toHaveLength(3);
      expect(stages[0]).toEqual({ maxCost: 2000 });
      expect(stages[1]).toEqual({ maxCost: 4000 });
      expect(stages[2]).toEqual({ maxCost: 7000 });
    });

    it("stagesForTargets creates two-stage progression", () => {
      const stages = stagesForTargets(["Force Staff", "Skadi"], 3000, 15000);
      
      expect(stages).toHaveLength(2);
      expect(stages[0]).toEqual({ maxCost: 3000 });
      expect(stages[1]).toEqual({ maxCost: 15000, requiredItems: ["Force Staff", "Skadi"] });
    });

    it("stagesForIncrementalTargets creates multi-stage progression", () => {
      const stages = stagesForIncrementalTargets(
        ["Force Staff", "Skadi"],
        [2000, 4500, 10000]
      );
      
      expect(stages).toHaveLength(3);
      expect(stages[0]).toEqual({ maxCost: 2000 });
      expect(stages[1]).toEqual({ maxCost: 4500, requiredItems: ["Force Staff"] });
      expect(stages[2]).toEqual({ maxCost: 10000, requiredItems: ["Skadi"] });
    });

    it("stagesForIncrementalTargets throws on mismatched lengths", () => {
      expect(() => {
        stagesForIncrementalTargets(["Force Staff", "Skadi"], [2000, 4500]);
      }).toThrow();
    });
  });

  describe("Search Utilities", () => {
    it("BoundedPriorityQueue maintains size limit", () => {
      const queue = new BoundedPriorityQueue<number>(
        3,
        (a, b) => b - a // Higher is better
      );
      
      queue.add(1);
      queue.add(5);
      queue.add(3);
      queue.add(2);
      queue.add(4);
      
      const result = queue.toArray();
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(5);
      expect(result[1]).toBe(4);
      expect(result[2]).toBe(3);
    });

    it("LoadoutCache caches loadouts", () => {
      const cache = new LoadoutCache(repo, statValuation);
      
      const loadout1 = cache.getOrCreate([perfectRecoveryItem]);
      const loadout2 = cache.getOrCreate([perfectRecoveryItem]);
      
      expect(loadout1).toBe(loadout2); // Same reference
      expect(cache.size).toBe(1);
    });

    it("quickReuseRatio estimates component overlap", () => {
      const from = createLoadout([perfectRecoveryItem], repo, statValuation);
      const to = createLoadout([goodRecoveryItem], repo, statValuation);
      
      // perfectRecoveryItem: str + agi
      // goodRecoveryItem: str + int
      // 1 shared (str) out of 2 = 0.5
      const ratio = quickReuseRatio(from, to);
      expect(ratio).toBeCloseTo(0.5, 1);
    });

    it("itemsToKey creates consistent cache keys", () => {
      const key1 = itemsToKey([perfectRecoveryItem, goodRecoveryItem]);
      const key2 = itemsToKey([goodRecoveryItem, perfectRecoveryItem]);
      
      // Keys should be the same regardless of order
      expect(key1).toBe(key2);
    });
  });

  describe("analyzeProgression", () => {
    it("returns empty result for empty stages", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [],
        statValuation,
      });
      
      expect(result.sequences).toHaveLength(0);
      expect(result.stats.totalEvaluated).toBe(0);
    });

    it("analyzes single-stage progressions", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([1000]),
        defaultItemCount: 2,
        resultLimit: 5,
        statValuation,
      });
      
      expect(result.sequences.length).toBeGreaterThan(0);
      expect(result.sequences.length).toBeLessThanOrEqual(5);
      expect(result.stats.stageStats).toHaveLength(1);
      
      // Each sequence should have 1 stage
      for (const seq of result.sequences) {
        expect(seq.stages).toHaveLength(1);
        expect(seq.stages[0].stageIndex).toBe(0);
        expect(seq.stages[0].transition).toBeNull();
      }
    });

    it("analyzes two-stage progressions", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500, 1000]),
        defaultItemCount: 2,
        resultLimit: 10,
        statValuation,
        minComponentReuse: 0.2,
      });
      
      expect(result.stats.stageStats).toHaveLength(2);
      
      for (const seq of result.sequences) {
        expect(seq.stages).toHaveLength(2);
        
        // Stage 0 should have no transition
        expect(seq.stages[0].transition).toBeNull();
        
        // Stage 1 should have transition
        if (seq.stages[1]) {
          expect(seq.stages[1].transition).not.toBeNull();
        }
      }
    });

    it("respects resultLimit", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([1000]),
        defaultItemCount: 2,
        resultLimit: 3,
        statValuation,
      });
      
      expect(result.sequences.length).toBeLessThanOrEqual(3);
    });

    it("respects minComponentReuse", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500, 3000]),
        defaultItemCount: 2,
        resultLimit: 20,
        statValuation,
        minComponentReuse: 0.5, // Strict reuse requirement
      });
      
      // All sequences should have good reuse
      for (const seq of result.sequences) {
        if (seq.stages.length > 1 && seq.stages[1].transition) {
          const flow = seq.stages[1].transition.componentFlow;
          const prevCost = seq.stages[0].loadout.totalCost;
          const reuseRatio = prevCost > 0 ? flow.reusedGold / prevCost : 0;
          
          // Note: quickReuseRatio is an estimate, so we check against a lower threshold
          expect(reuseRatio).toBeGreaterThanOrEqual(0.3);
        }
      }
    });

    it("returns statistics", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500, 1000]),
        defaultItemCount: 2,
        resultLimit: 10,
        statValuation,
      });
      
      expect(result.stats.totalEvaluated).toBeGreaterThan(0);
      expect(result.stats.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.stageStats).toHaveLength(2);
      
      for (const stageStat of result.stats.stageStats) {
        expect(stageStat.candidatesEvaluated).toBeGreaterThanOrEqual(0);
      }
    });

    it("uses provided scorer", () => {
      const customScorer = () => 0.999; // Always returns same score
      
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([1000]),
        defaultItemCount: 2,
        resultLimit: 5,
        defaultScorer: customScorer,
        statValuation,
      });
      
      // All sequences should have the custom score
      for (const seq of result.sequences) {
        expect(seq.totalScore).toBeCloseTo(0.999, 2);
      }
    });

    it("tracks resolved and unresolved targets", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [
          { maxCost: 1000 },
          { maxCost: 3000, requiredItems: ["nonexistent_item"] },
        ],
        defaultItemCount: 2,
        resultLimit: 5,
        statValuation,
      });
      
      // Should report the unresolved target
      expect(result.unresolvedTargets.size).toBeGreaterThan(0);
    });
  });

  describe("Formatting Functions", () => {
    it("formatProgression produces readable output", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500, 1000]),
        defaultItemCount: 2,
        resultLimit: 1,
        statValuation,
      });
      
      const formatted = formatProgression(result);
      
      if (result.sequences.length > 0) {
        expect(formatted).toContain("Stage 1");
        expect(formatted).toContain("Score");
        expect(formatted).toContain("g)");
      }
    });

    it("formatProgressionStats produces readable stats", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500]),
        defaultItemCount: 2,
        resultLimit: 5,
        statValuation,
      });
      
      const formatted = formatProgressionStats(result.stats);
      
      expect(formatted).toContain("Total Evaluated");
      expect(formatted).toContain("Valid Sequences");
      expect(formatted).toContain("Search Time");
      expect(formatted).toContain("Per-Stage Statistics");
    });
  });
});
