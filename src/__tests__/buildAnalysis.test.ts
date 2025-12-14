import { describe, it, expect } from "bun:test";
import {
  analyzeValidTransitions,
  analyzePairTransitions,
  validateTransition,
  findTransitionsToItem,
  findTransitionsFromItem,
} from "../calculators/buildAnalysis";
import { costIncreaseConstraint, allConstraints, minTotalRecovery } from "../calculators/constraints";
import { reuseEfficiencyScore } from "../calculators/scorers";
import { ItemRepository } from "../data/ItemRepository";
import {
  getAllTestItems,
  perfectRecoveryItem,
  goodRecoveryItem,
  fullyReachableLateItem,
  multiComponentItem,
  upgradedBoots,
  fancyBoots,
  EARLY_GAME_MAX_COST,
} from "./fixtures";
import { DEFAULT_CONFIG } from "../config/analysisConfig";

describe("buildAnalysis", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  describe("analyzeValidTransitions", () => {
    it("returns analysis result with transitions and stats", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
        resultLimit: 10,
      });

      expect(result).toHaveProperty("transitions");
      expect(result).toHaveProperty("stats");
      expect(Array.isArray(result.transitions)).toBe(true);
      expect(result.stats).toHaveProperty("totalEvaluated");
      expect(result.stats).toHaveProperty("validCount");
      expect(result.stats).toHaveProperty("averageScore");
      expect(result.stats).toHaveProperty("bestScore");
    });

    it("only returns transitions with cost increase", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
      });

      for (const transition of result.transitions) {
        expect(transition.costDelta).toBeGreaterThan(0);
      }
    });

    it("respects resultLimit", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
        resultLimit: 5,
      });

      expect(result.transitions.length).toBeLessThanOrEqual(5);
    });

    it("sorts transitions by score descending", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
        resultLimit: 20,
      });

      for (let i = 0; i < result.transitions.length - 1; i++) {
        expect(result.transitions[i].score).toBeGreaterThanOrEqual(
          result.transitions[i + 1].score
        );
      }
    });

    it("uses custom constraint when provided", () => {
      // Constraint: must have high total gold recovery
      const strictConstraint = allConstraints(
        costIncreaseConstraint,
        minTotalRecovery(0.8)
      );

      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
        constraint: strictConstraint,
      });

      // All results should have high total recovery (components + recipes)
      for (const transition of result.transitions) {
        const totalRecovered = 
          transition.componentFlow.reusedGold + transition.componentFlow.recoveredRecipeCost;
        const recoveryPercent = totalRecovered / transition.from.totalCost;
        expect(recoveryPercent).toBeGreaterThanOrEqual(0.8);
      }
    });

    it("uses custom scorer when provided", () => {
      // Use reuse efficiency as the only scorer
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
        scorer: reuseEfficiencyScore,
      });

      // Scores should match reuse efficiency (includes recipe recovery)
      for (const transition of result.transitions) {
        const totalRecovered = 
          transition.componentFlow.reusedGold + transition.componentFlow.recoveredRecipeCost;
        const expectedScore =
          transition.from.totalCost > 0
            ? totalRecovered / transition.from.totalCost
            : 0;
        expect(transition.score).toBeCloseTo(expectedScore, 5);
      }
    });

    it("calculates stats correctly", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
      });

      expect(result.stats.totalEvaluated).toBeGreaterThan(0);
      expect(result.stats.validCount).toBeLessThanOrEqual(result.stats.totalEvaluated);

      if (result.transitions.length > 0) {
        expect(result.stats.bestScore).toBe(result.transitions[0].score);
      }
    });
  });

  describe("analyzePairTransitions", () => {
    it("analyzes 2->2 transitions", () => {
      const result = analyzePairTransitions(items);

      expect(result.transitions.length).toBeGreaterThan(0);

      for (const t of result.transitions) {
        expect(t.from.items.length).toBe(2);
        expect(t.to.items.length).toBe(2);
      }
    });
  });

  describe("validateTransition", () => {
    it("validates a valid transition", () => {
      const result = validateTransition(
        [perfectRecoveryItem, goodRecoveryItem], // 600g
        [fullyReachableLateItem], // 3000g
        DEFAULT_CONFIG
      );

      expect(result.valid).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("rejects transition with no cost increase", () => {
      const result = validateTransition(
        [fullyReachableLateItem], // 3000g
        [perfectRecoveryItem, goodRecoveryItem], // 600g
        DEFAULT_CONFIG
      );

      expect(result.valid).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain("must exceed");
    });

    it("includes transition details", () => {
      const result = validateTransition(
        [perfectRecoveryItem],
        [fullyReachableLateItem],
        DEFAULT_CONFIG
      );

      expect(result.transition).toBeDefined();
      expect(result.transition.from.items).toHaveLength(1);
      expect(result.transition.to.items).toHaveLength(1);
      expect(result.transition.costDelta).toBe(3000 - 200);
    });
  });

  describe("findTransitionsToItem", () => {
    it("finds transitions that include target item", () => {
      const result = findTransitionsToItem(
        items,
        "fully_reachable",
        DEFAULT_CONFIG
      );

      // All transitions should include fully_reachable in final
      for (const t of result.transitions) {
        const finalNames = t.to.items.map((i) => i.name);
        expect(finalNames).toContain("fully_reachable");
      }
    });

    it("returns empty result for nonexistent item", () => {
      const result = findTransitionsToItem(items, "nonexistent_item", DEFAULT_CONFIG);

      expect(result.transitions).toHaveLength(0);
      expect(result.stats.validCount).toBe(0);
    });
  });

  describe("findTransitionsFromItem", () => {
    it("finds transitions starting from specific item", () => {
      const result = findTransitionsFromItem(
        items,
        "perfect_recovery",
        DEFAULT_CONFIG
      );

      // All transitions should include perfect_recovery in initial
      for (const t of result.transitions) {
        const initialNames = t.from.items.map((i) => i.name);
        expect(initialNames).toContain("perfect_recovery");
      }
    });

    it("returns empty result for nonexistent item", () => {
      const result = findTransitionsFromItem(items, "nonexistent_item", DEFAULT_CONFIG);

      expect(result.transitions).toHaveLength(0);
    });
  });

  describe("boot filtering", () => {
    it("excludes combinations with multiple boots in early loadout", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
      });

      const bootNames = new Set(DEFAULT_CONFIG.bootItems);

      for (const t of result.transitions) {
        const earlyBoots = t.from.items.filter((i) => bootNames.has(i.name));
        expect(earlyBoots.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("component flow in transitions", () => {
    it("correctly tracks reused components", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
      });

      for (const t of result.transitions) {
        // Reused + wasted should equal from components
        const fromTotal = t.from.components.length;
        const reusedAndWasted =
          t.componentFlow.reused.length + t.componentFlow.wasted.length;

        expect(reusedAndWasted).toBe(fromTotal);
      }
    });

    it("correctly calculates gold values", () => {
      const result = analyzeValidTransitions(items, DEFAULT_CONFIG, {
        earlyItemCount: 2,
        finalItemCount: 2,
      });

      for (const t of result.transitions) {
        // Sum of component gold should be accounted for
        const totalFromGold =
          t.componentFlow.reusedGold + t.componentFlow.wastedGold;

        // This should roughly equal or be close to the sum of base component costs
        // (may not be exact due to recipe costs not being in components)
        expect(totalFromGold).toBeLessThanOrEqual(t.from.totalCost);
      }
    });
  });
});

describe("buildAnalysis with real scenarios", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  it("validates the design doc example concept", () => {
    // The design doc example:
    // Initial: Tranquil (925g) + Pavise (1100g) + Buckler (425g) = 2450g
    // Final: Arcane (1300g) + Drums (1650g) + Force Staff (2200g) = 5150g
    //
    // Our test fixtures are simpler, but the concept is the same:
    // Final cost must exceed initial cost

    const validation = validateTransition(
      [perfectRecoveryItem, goodRecoveryItem], // 600g combined
      [fullyReachableLateItem], // 3000g
      DEFAULT_CONFIG,
      repo // Pass full repo for component lookups
    );

    expect(validation.valid).toBe(true);
    expect(validation.transition.costDelta).toBeGreaterThan(0);
  });

  it("rejects downgrade even with component reuse", () => {
    // Even if components are reused, if final cost < initial cost,
    // the transition is invalid

    const validation = validateTransition(
      [fullyReachableLateItem], // 3000g with str+agi+int
      [perfectRecoveryItem], // 200g with str+agi (subset of components)
      DEFAULT_CONFIG,
      repo // Pass full repo for component lookups
    );

    expect(validation.valid).toBe(false);
    // The component flow shows reuse (str+agi), but cost constraint fails
    // Both strength_component and agility_component are 100g each = 200g reused
    expect(validation.transition.componentFlow.reusedGold).toBe(200);
  });
});
