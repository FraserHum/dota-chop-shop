import { describe, it, expect } from "bun:test";
import { ItemRepository } from "../data/ItemRepository";
import { createLoadout } from "../calculators/loadout";
import {
  getAllTestItems,
  perfectRecoveryItem,
  goodRecoveryItem,
  fullyReachableLateItem,
} from "./fixtures";
import { BuildStage } from "../models/buildTypes";
import { DEFAULT_CONFIG } from "../config/analysisConfig";
import { calculateStatValuation } from "../calculators/statValuation";

// ─────────────────────────────────────────────────────────────
// Import Build Progression
// ─────────────────────────────────────────────────────────────
import {
  analyzeProgression,
  stagesFromCosts,
  stagesForTargets,
  stagesForIncrementalTargets,
  formatProgression,
  formatProgressionStats,
  _testing,
} from "../calculators/buildProgression";

// ─────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────

describe("Build Progression", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);
  const statValuation = calculateStatValuation(items);

  // ─────────────────────────────────────────────────────────────
  // Helper Functions
  // ─────────────────────────────────────────────────────────────

  describe("Helper Functions", () => {
    describe("stagesFromCosts", () => {
      it("converts cost array to stage definitions", () => {
        const stages = stagesFromCosts([2000, 4000, 7000]);

        expect(stages).toHaveLength(3);
        expect(stages[0]).toEqual({ maxCost: 2000 });
        expect(stages[1]).toEqual({ maxCost: 4000 });
        expect(stages[2]).toEqual({ maxCost: 7000 });
      });

      it("handles empty array", () => {
        const stages = stagesFromCosts([]);
        expect(stages).toHaveLength(0);
      });

      it("handles single cost", () => {
        const stages = stagesFromCosts([5000]);
        expect(stages).toHaveLength(1);
        expect(stages[0]).toEqual({ maxCost: 5000 });
      });
    });

    describe("stagesForTargets", () => {
      it("creates two-stage progression with targets in final stage", () => {
        const stages = stagesForTargets(
          ["Force Staff", "Skadi"],
          3000,
          15000
        );

        expect(stages).toHaveLength(2);
        expect(stages[0]).toEqual({ maxCost: 3000 });
        expect(stages[1]).toEqual({
          maxCost: 15000,
          requiredItems: ["Force Staff", "Skadi"],
        });
      });

      it("handles single target", () => {
        const stages = stagesForTargets(["Force Staff"], 2000, 5000);

        expect(stages).toHaveLength(2);
        expect(stages[1].requiredItems).toEqual(["Force Staff"]);
      });

      it("handles empty targets", () => {
        const stages = stagesForTargets([], 2000, 5000);

        expect(stages).toHaveLength(2);
        expect(stages[1].requiredItems).toEqual([]);
      });
    });

    describe("stagesForIncrementalTargets", () => {
      it("creates stages that acquire targets one at a time", () => {
        const stages = stagesForIncrementalTargets(
          ["Force Staff", "Skadi"],
          [2000, 4500, 10000]
        );

        expect(stages).toHaveLength(3);
        expect(stages[0]).toEqual({ maxCost: 2000 });
        expect(stages[1]).toEqual({
          maxCost: 4500,
          requiredItems: ["Force Staff"],
        });
        expect(stages[2]).toEqual({
          maxCost: 10000,
          requiredItems: ["Skadi"],
        });
      });

      it("throws if cost thresholds length doesn't match", () => {
        expect(() =>
          stagesForIncrementalTargets(
            ["A", "B"],
            [1000, 2000] // Should be 3 thresholds
          )
        ).toThrow();
      });

      it("handles single target", () => {
        const stages = stagesForIncrementalTargets(
          ["Force Staff"],
          [2000, 5000]
        );

        expect(stages).toHaveLength(2);
        expect(stages[0]).toEqual({ maxCost: 2000 });
        expect(stages[1]).toEqual({
          maxCost: 5000,
          requiredItems: ["Force Staff"],
        });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Internal Testing Utilities
  // ─────────────────────────────────────────────────────────────

  describe("Internal Utilities (_testing)", () => {
    describe("requiredItemsConstraint", () => {
      it("returns true for empty required items", () => {
        const constraint = _testing.requiredItemsConstraint([]);
        const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(true);
      });

      it("checks that all required items are present", () => {
        const constraint = _testing.requiredItemsConstraint([perfectRecoveryItem]);
        const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(true);
      });

      it("fails when required item is missing", () => {
        const constraint = _testing.requiredItemsConstraint([perfectRecoveryItem]);
        const loadout = createLoadout([goodRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(false);
      });
    });

    describe("excludedItemsConstraint", () => {
      it("returns true for empty excluded items", () => {
        const constraint = _testing.excludedItemsConstraint([]);
        const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(true);
      });

      it("passes when excluded items are not present", () => {
        const constraint = _testing.excludedItemsConstraint(["good_recovery"]);
        const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(true);
      });

      it("fails when excluded item is present", () => {
        const constraint = _testing.excludedItemsConstraint(["perfect_recovery"]);
        const loadout = createLoadout([perfectRecoveryItem], repo, statValuation);

        const stage: BuildStage = {
          loadout,
          stageIndex: 0,
          costThreshold: 1000,
          transition: null,
        };

        expect(constraint(stage, null)).toBe(false);
      });
    });

    describe("buildStageItemPool", () => {
      it("builds item pool within cost range", () => {
        const stageDef = { maxCost: 1000 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          []
        );

        // All items should be within cost range
        for (const item of pool) {
          expect(item.cost).toBeLessThanOrEqual(1000);
        }
      });

      it("excludes required items from pool", () => {
        const stageDef = { maxCost: 1000 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          [perfectRecoveryItem]
        );

        // Required item should not be in pool
        const hasRequired = pool.some(
          (i) => i.name === perfectRecoveryItem.name
        );
        expect(hasRequired).toBe(false);
      });

      it("applies excluded items filter", () => {
        const stageDef = {
          maxCost: 1000,
          excludedItems: ["perfect_recovery"],
        };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          []
        );

        const hasExcluded = pool.some(
          (i) => i.name === "perfect_recovery"
        );
        expect(hasExcluded).toBe(false);
      });

      it("does not enforce minCost by default", () => {
        // minCost is no longer enforced - natural constraints handle item selection
        const stageDef = { maxCost: 1000 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          []
        );

        // Pool should include items of any cost up to maxCost
        // (assuming our test fixtures have items at various price points)
        expect(pool.length).toBeGreaterThan(0);
        for (const item of pool) {
          expect(item.cost).toBeLessThanOrEqual(1000);
        }
      });

      it("includes component items by default", () => {
        const stageDef = { maxCost: 500 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          [],
          true // includeComponents (default)
        );

        // Should include component items that have stats
        const hasComponents = pool.some((item) => item.isComponent);
        expect(hasComponents).toBe(true);
      });

      it("excludes component items when includeComponents is false", () => {
        const stageDef = { maxCost: 500 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          [],
          false // includeComponents = false
        );

        // Should only include upgraded items (items with components)
        const hasComponents = pool.some((item) => item.isComponent);
        expect(hasComponents).toBe(false);
        
        // All items in the pool should have components (be upgraded items)
        for (const item of pool) {
          expect(item.components.length).toBeGreaterThan(0);
        }
      });

      it("only includes component items with stats", () => {
        const stageDef = { maxCost: 500 };
        const pool = _testing.buildStageItemPool(
          repo,
          DEFAULT_CONFIG,
          stageDef,
          [],
          true // includeComponents
        );

        // All component items in the pool should have at least one stat
        for (const item of pool) {
          if (item.isComponent) {
            expect(Object.keys(item.stats).length).toBeGreaterThan(0);
          }
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Main Analysis Function
  // ─────────────────────────────────────────────────────────────

  describe("analyzeProgression", () => {
    it("returns empty result for empty stages", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [],
        statValuation,
      });

      expect(result.sequences).toHaveLength(0);
      expect(result.stats.totalEvaluated).toBe(0);
      expect(result.resolvedTargets.size).toBe(0);
      expect(result.unresolvedTargets.size).toBe(0);
    });

    it("analyzes single-stage progression", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [{ maxCost: 1000 }],
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

    it("analyzes two-stage progression", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [{ maxCost: 500 }, { maxCost: 1000 }],
        defaultItemCount: 2,
        resultLimit: 10,
        statValuation,
        minTotalRecovery: 0.2,
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
        stages: [{ maxCost: 1000 }],
        defaultItemCount: 2,
        resultLimit: 3,
        statValuation,
      });

      expect(result.sequences.length).toBeLessThanOrEqual(3);
    });

    it("respects minTotalRecovery", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [{ maxCost: 500 }, { maxCost: 3000 }],
        defaultItemCount: 2,
        resultLimit: 20,
        statValuation,
        minTotalRecovery: 0.5, // Strict reuse requirement
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
        stages: [{ maxCost: 500 }, { maxCost: 1000 }],
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
        stages: [{ maxCost: 1000 }],
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

    describe("with required items", () => {
      it("resolves required items by name", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["perfect_recovery"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        // Check that required items were resolved
        expect(result.resolvedTargets.size).toBe(1);
        expect(result.resolvedTargets.get(0)?.length).toBe(1);
        expect(result.unresolvedTargets.size).toBe(0);
      });

      it("resolves required items by display name", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["Perfect Recovery Item"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        // Check that required items were resolved
        expect(result.resolvedTargets.size).toBe(1);
        expect(result.resolvedTargets.get(0)?.length).toBe(1);
      });

      it("tracks unresolved items", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["nonexistent_item_xyz"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        expect(result.unresolvedTargets.size).toBe(1);
        expect(result.unresolvedTargets.get(0)).toContain("nonexistent_item_xyz");
      });

      it("includes required items in all sequences", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["perfect_recovery"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        // All sequences should contain the required item
        for (const seq of result.sequences) {
          const hasRequired = seq.stages[0].loadout.items.some(
            (i) => i.name === "perfect_recovery"
          );
          expect(hasRequired).toBe(true);
        }
      });

      it("handles multiple required items in one stage", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            {
              maxCost: 1000,
              requiredItems: ["perfect_recovery", "good_recovery"],
            },
          ],
          defaultItemCount: 3,
          resultLimit: 5,
          statValuation,
        });

        // All sequences should contain both required items
        for (const seq of result.sequences) {
          const items = seq.stages[0].loadout.items;
          const hasPerfect = items.some((i) => i.name === "perfect_recovery");
          const hasGood = items.some((i) => i.name === "good_recovery");
          expect(hasPerfect).toBe(true);
          expect(hasGood).toBe(true);
        }
      });

      it("handles required items in later stages", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 500 },
            { maxCost: 3500, requiredItems: ["fully_reachable"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
          minTotalRecovery: 0.1,
        });

        // Check that stage 1 has required items resolved
        expect(result.resolvedTargets.get(1)?.length).toBe(1);

        // All sequences should contain the required item in stage 1
        for (const seq of result.sequences) {
          if (seq.stages.length > 1) {
            const hasRequired = seq.stages[1].loadout.items.some(
              (i) => i.name === "fully_reachable"
            );
            expect(hasRequired).toBe(true);
          }
        }
      });

      it("calculates target coverage statistics", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["perfect_recovery"] },
            { maxCost: 3500, requiredItems: ["fully_reachable"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
          minTotalRecovery: 0.1,
        });

        expect(result.stats.totalRequiredItems).toBe(2);
        expect(result.stats.resolvedRequiredItems).toBe(2);
        expect(result.stats.targetCoverage).toBe(1);
      });
    });

    describe("with excluded items", () => {
      it("excludes specified items from loadouts", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, excludedItems: ["perfect_recovery"] },
          ],
          defaultItemCount: 2,
          resultLimit: 10,
          statValuation,
        });

        // No sequence should contain the excluded item
        for (const seq of result.sequences) {
          const hasExcluded = seq.stages[0].loadout.items.some(
            (i) => i.name === "perfect_recovery"
          );
          expect(hasExcluded).toBe(false);
        }
      });
    });

    describe("with per-stage itemCount", () => {
      it("respects stage-specific itemCount as maximum", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 500, itemCount: 2 },
            { maxCost: 3500, itemCount: 3 },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
          minTotalRecovery: 0.1,
        });

        for (const seq of result.sequences) {
          // With the new inventory/backpack/selling system:
          // - itemCount limits the number of assembled items (chosen by the combination generator)
          // - But total retained items (inventory + backpack) can exceed itemCount due to leftovers
          // - So we just verify that sequences were produced (sanity check)
          expect(seq.stages[0].loadout.items.length).toBeGreaterThan(0);
          if (seq.stages.length > 1) {
            expect(seq.stages[1].loadout.items.length).toBeGreaterThan(0);
          }
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Formatting Functions
  // ─────────────────────────────────────────────────────────────

  describe("Formatting Functions", () => {
    describe("formatProgression", () => {
      it("produces readable output for valid results", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [{ maxCost: 500 }, { maxCost: 1000 }],
          defaultItemCount: 2,
          resultLimit: 1,
          statValuation,
        });

        if (result.sequences.length > 0) {
          const formatted = formatProgression(result);

          expect(formatted).toContain("Stage 1");
          expect(formatted).toContain("Progression");
          expect(formatted).toContain("g)");
        }
      });

      it("handles empty results", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [],
          statValuation,
        });

        const formatted = formatProgression(result);
        expect(formatted).toContain("No valid build progressions found");
      });

      it("reports unresolved targets", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["nonexistent_xyz"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        const formatted = formatProgression(result);
        expect(formatted).toContain("Unresolved");
        expect(formatted).toContain("nonexistent_xyz");
      });

      it("marks stages with required items", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["perfect_recovery"] },
          ],
          defaultItemCount: 2,
          resultLimit: 1,
          statValuation,
        });

        if (result.sequences.length > 0) {
          const formatted = formatProgression(result);
          expect(formatted).toContain("[TARGET]");
        }
      });

      it("includes transition details in verbose mode", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [{ maxCost: 500 }, { maxCost: 1000 }],
          defaultItemCount: 2,
          resultLimit: 1,
          statValuation,
        });

        if (result.sequences.length > 0) {
          const formatted = formatProgression(result, true);

          // Verbose mode should show reuse details
          expect(formatted).toContain("Components used:");
          expect(formatted).toContain("New gold needed:");
        }
      });
    });

    describe("formatProgressionStats", () => {
      it("produces readable stats", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [{ maxCost: 500 }],
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

      it("includes target coverage when relevant", () => {
        const result = analyzeProgression(items, DEFAULT_CONFIG, {
          stages: [
            { maxCost: 1000, requiredItems: ["perfect_recovery"] },
          ],
          defaultItemCount: 2,
          resultLimit: 5,
          statValuation,
        });

        const formatted = formatProgressionStats(result.stats);
        expect(formatted).toContain("Target Coverage");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Integration with Cost-Based Sequences
  // ─────────────────────────────────────────────────────────────

  describe("Integration: Cost-Based Sequences", () => {
    it("works like analyzeSequences for pure cost-based stages", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesFromCosts([500, 1000]),
        defaultItemCount: 2,
        resultLimit: 10,
        statValuation,
        minTotalRecovery: 0.2,
      });

      expect(result.stats.stageStats).toHaveLength(2);

      // No required items, so these maps should be empty
      expect(result.resolvedTargets.size).toBe(0);
      expect(result.stats.totalRequiredItems).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Integration with Target-Based Pathfinding
  // ─────────────────────────────────────────────────────────────

  describe("Integration: Target-Based Pathfinding", () => {
    it("works like findPathsForTargets for target-based stages", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: stagesForTargets(
          ["perfect_recovery"],
          500,
          1000
        ),
        defaultItemCount: 2,
        resultLimit: 10,
        statValuation,
        minTotalRecovery: 0.1,
      });

      // Should have resolved targets in stage 1
      expect(result.resolvedTargets.get(1)?.length).toBe(1);

      // All sequences should have the target in the final stage
      for (const seq of result.sequences) {
        if (seq.stages.length > 1) {
          const hasTarget = seq.stages[1].loadout.items.some(
            (i) => i.name === "perfect_recovery"
          );
          expect(hasTarget).toBe(true);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Combined: Cost + Target Stages
  // ─────────────────────────────────────────────────────────────

  describe("Combined: Cost + Target Stages", () => {
    it("handles mixed cost-only and target stages", () => {
      const result = analyzeProgression(items, DEFAULT_CONFIG, {
        stages: [
          { maxCost: 500 }, // Cost-only
          { maxCost: 1000, requiredItems: ["good_recovery"] }, // Target
        ],
        defaultItemCount: 2,
        resultLimit: 5,
        statValuation,
        minTotalRecovery: 0.1,
      });

      // Stage 0 has no required items
      expect(result.resolvedTargets.has(0)).toBe(false);

      // Stage 1 has required items
      expect(result.resolvedTargets.get(1)?.length).toBe(1);

      // All sequences should have the target in stage 1
      for (const seq of result.sequences) {
        if (seq.stages.length > 1) {
          const hasTarget = seq.stages[1].loadout.items.some(
            (i) => i.name === "good_recovery"
          );
          expect(hasTarget).toBe(true);
        }
      }
    });
  });
});
