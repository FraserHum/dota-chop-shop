import { describe, it, expect } from "bun:test";
import {
  createLoadout,
  createTransition,
  analyzeComponentFlow,
  emptyLoadout,
  getTotalRecoveryPercentage,
  getWastedPercentage,
  formatTransition,
} from "../calculators/loadout";
import { ItemRepository } from "../data/ItemRepository";
import {
  getAllTestItems,
  perfectRecoveryItem,
  goodRecoveryItem,
  mixedRecoveryItem,
  fullyReachableLateItem,
} from "./fixtures";

describe("loadout utilities", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  describe("createLoadout", () => {
    it("creates loadout with correct total cost", () => {
      const loadout = createLoadout([perfectRecoveryItem, goodRecoveryItem], repo);

      expect(loadout.totalCost).toBe(
        perfectRecoveryItem.cost + goodRecoveryItem.cost
      ); // 200 + 400 = 600
    });

    it("creates loadout with flattened components", () => {
      const loadout = createLoadout([perfectRecoveryItem], repo);

      // perfectRecoveryItem has strength_component + agility_component
      expect(loadout.components).toContain("strength_component");
      expect(loadout.components).toContain("agility_component");
      expect(loadout.components).toHaveLength(2);
    });

    it("creates loadout with component counts", () => {
      const loadout = createLoadout([perfectRecoveryItem, goodRecoveryItem], repo);

      // perfectRecoveryItem: str + agi
      // goodRecoveryItem: str + int
      // Total: 2x str, 1x agi, 1x int
      expect(loadout.componentCounts["strength_component"]).toBe(2);
      expect(loadout.componentCounts["agility_component"]).toBe(1);
      expect(loadout.componentCounts["intelligence_component"]).toBe(1);
    });

    it("handles empty item array", () => {
      const loadout = createLoadout([], repo);

      expect(loadout.items).toHaveLength(0);
      expect(loadout.totalCost).toBe(0);
      expect(loadout.components).toHaveLength(0);
    });
  });

  describe("emptyLoadout", () => {
    it("creates empty loadout", () => {
      const loadout = emptyLoadout();

      expect(loadout.items).toHaveLength(0);
      expect(loadout.totalCost).toBe(0);
      expect(loadout.components).toHaveLength(0);
      expect(Object.keys(loadout.componentCounts)).toHaveLength(0);
    });
  });

  describe("analyzeComponentFlow", () => {
    it("identifies reused components", () => {
      // Both loadouts have strength_component
      const from = createLoadout([perfectRecoveryItem], repo); // str + agi
      const to = createLoadout([goodRecoveryItem], repo); // str + int

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.reused).toContain("strength_component");
      expect(flow.reused).toHaveLength(1);
    });

    it("identifies wasted components", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str + agi
      const to = createLoadout([goodRecoveryItem], repo); // str + int

      const flow = analyzeComponentFlow(from, to, repo);

      // agility_component is in from but not to
      expect(flow.wasted).toContain("agility_component");
      expect(flow.wasted).toHaveLength(1);
    });

    it("identifies acquired components", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str + agi
      const to = createLoadout([goodRecoveryItem], repo); // str + int

      const flow = analyzeComponentFlow(from, to, repo);

      // intelligence_component is in to but not from
      expect(flow.acquired).toContain("intelligence_component");
      expect(flow.acquired).toHaveLength(1);
    });

    it("calculates gold values correctly", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str(100) + agi(100)
      const to = createLoadout([goodRecoveryItem], repo); // str(100) + int(100)

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.reusedGold).toBe(100); // strength_component
      expect(flow.wastedGold).toBe(100); // agility_component
      expect(flow.acquiredGold).toBe(100); // intelligence_component
    });

    it("handles duplicate components correctly", () => {
      // Create loadouts where component appears multiple times
      const from = createLoadout([perfectRecoveryItem, goodRecoveryItem], repo);
      // from has 2x str, 1x agi, 1x int

      const to = createLoadout([fullyReachableLateItem], repo);
      // to has 1x str, 1x agi, 1x int

      const flow = analyzeComponentFlow(from, to, repo);

      // One str should be reused, one wasted
      const strReused = flow.reused.filter((c) => c === "strength_component").length;
      const strWasted = flow.wasted.filter((c) => c === "strength_component").length;

      expect(strReused).toBe(1);
      expect(strWasted).toBe(1);
    });
  });

  describe("createTransition", () => {
    it("creates transition with correct cost delta", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // 200g
      const to = createLoadout([fullyReachableLateItem], repo); // 3000g

      const transition = createTransition(from, to, repo);

      expect(transition.costDelta).toBe(3000 - 200);
    });

    it("creates transition with negative cost delta when downgrading", () => {
      const from = createLoadout([fullyReachableLateItem], repo); // 3000g
      const to = createLoadout([perfectRecoveryItem], repo); // 200g

      const transition = createTransition(from, to, repo);

      expect(transition.costDelta).toBe(200 - 3000);
      expect(transition.costDelta).toBeLessThan(0);
    });

    it("includes component flow analysis", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([fullyReachableLateItem], repo);

      const transition = createTransition(from, to, repo);

      expect(transition.componentFlow).toBeDefined();
      expect(transition.componentFlow.reused).toBeDefined();
      expect(transition.componentFlow.wasted).toBeDefined();
      expect(transition.componentFlow.acquired).toBeDefined();
    });
  });

  describe("getTotalRecoveryPercentage", () => {
    it("returns percentage of gold recovered (components + recipes)", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str(100) + agi(100), no recipe = 200g
      const to = createLoadout([goodRecoveryItem], repo); // str(100) + int(100)

      const transition = createTransition(from, to, repo);
      const percent = getTotalRecoveryPercentage(transition);

      // 100g reused + 0g recipe = 100g recovered out of 200g = 50%
      expect(percent).toBeCloseTo(0.5, 2);
    });

    it("returns 0 for empty from loadout", () => {
      const from = emptyLoadout();
      const to = createLoadout([perfectRecoveryItem], repo);

      const transition = createTransition(from, to, repo);
      const percent = getTotalRecoveryPercentage(transition);

      expect(percent).toBe(0);
    });

    it("returns 1 for full reuse", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str + agi
      const to = createLoadout([perfectRecoveryItem], repo); // same

      const transition = createTransition(from, to, repo);
      const percent = getTotalRecoveryPercentage(transition);

      expect(percent).toBeCloseTo(1.0, 2);
    });
  });

  describe("getWastedPercentage", () => {
    it("returns percentage of gold wasted", () => {
      const from = createLoadout([perfectRecoveryItem], repo); // str(100) + agi(100) = 200g
      const to = createLoadout([goodRecoveryItem], repo); // str(100) + int(100)

      const transition = createTransition(from, to, repo);
      const percent = getWastedPercentage(transition);

      // 100g wasted out of 200g = 50%
      expect(percent).toBeCloseTo(0.5, 2);
    });

    it("returns 0 for no waste", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo);

      const transition = createTransition(from, to, repo);
      const percent = getWastedPercentage(transition);

      expect(percent).toBe(0);
    });
  });

  describe("formatTransition", () => {
    it("formats transition as readable string", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const transition = createTransition(from, to, repo);
      const formatted = formatTransition(transition);

      expect(formatted).toContain("Perfect Recovery Item");
      expect(formatted).toContain("Good Recovery Item");
      expect(formatted).toContain("→");
    });
  });

  // =========================================================================
  // Recipe Cost Calculations (Gyrocopter's 100% Recipe Recovery)
  // =========================================================================

  describe("recipe cost calculations", () => {
    it("calculates recoveredRecipeCost for items with recipes", () => {
      // goodRecoveryItem: 400g = 100 str + 100 int + 200 recipe
      const from = createLoadout([goodRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo); // no recipe

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.recoveredRecipeCost).toBe(200); // goodRecoveryItem has 200g recipe
    });

    it("calculates zero recoveredRecipeCost for items without recipes", () => {
      // perfectRecoveryItem: 200g = 100 str + 100 agi, no recipe
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.recoveredRecipeCost).toBe(0); // perfectRecoveryItem has no recipe
    });

    it("calculates targetRecipeCost for items with recipes", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      // goodRecoveryItem: 400g = 100 str + 100 int + 200 recipe
      const to = createLoadout([goodRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.targetRecipeCost).toBe(200); // goodRecoveryItem has 200g recipe
    });

    it("calculates zero targetRecipeCost for items without recipes", () => {
      const from = createLoadout([goodRecoveryItem], repo);
      // perfectRecoveryItem: 200g = 100 str + 100 agi, no recipe
      const to = createLoadout([perfectRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.targetRecipeCost).toBe(0);
    });

    it("calculates netRecipeCost correctly (target - recovered)", () => {
      // goodRecoveryItem has 200g recipe, perfectRecoveryItem has no recipe
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      // net = target(200) - recovered(0) = 200
      expect(flow.netRecipeCost).toBe(200);
    });

    it("calculates negative netRecipeCost when recovering more than spending", () => {
      // goodRecoveryItem: 200g recipe
      // perfectRecoveryItem: 0g recipe
      const from = createLoadout([goodRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      // net = target(0) - recovered(200) = -200
      expect(flow.netRecipeCost).toBe(-200);
    });

    it("calculates totalGoldNeeded correctly (acquired + netRecipe)", () => {
      // From: perfectRecoveryItem (str + agi components)
      // To: goodRecoveryItem (str + int components + 200g recipe)
      // 
      // Reused: str (100g)
      // Acquired: int (100g)
      // Net recipe: 200 - 0 = 200
      // Total needed: 100 + 200 = 300g
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.acquiredGold).toBe(100); // intelligence_component
      expect(flow.netRecipeCost).toBe(200);
      expect(flow.totalGoldNeeded).toBe(300);
    });

    it("calculates totalGoldNeeded with recipe recovery profit", () => {
      // From: goodRecoveryItem (str + int + 200g recipe)
      // To: perfectRecoveryItem (str + agi, no recipe)
      //
      // Reused: str (100g)
      // Acquired: agi (100g)
      // Net recipe: 0 - 200 = -200 (profit!)
      // Total needed: 100 + (-200) = -100g (net gain)
      const from = createLoadout([goodRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.acquiredGold).toBe(100); // agility_component
      expect(flow.netRecipeCost).toBe(-200);
      expect(flow.totalGoldNeeded).toBe(-100); // Actually a net gain!
    });

    it("handles multiple items with recipes in from loadout", () => {
      // goodRecoveryItem: 200g recipe
      // mixedRecoveryItem: 300g = 100 str + 100 damage + 100 recipe
      const from = createLoadout([goodRecoveryItem, mixedRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      // Total recovered: 200 + 100 = 300
      expect(flow.recoveredRecipeCost).toBe(300);
    });

    it("handles multiple items with recipes in to loadout", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      // goodRecoveryItem: 200g recipe
      // mixedRecoveryItem: 100g recipe  
      const to = createLoadout([goodRecoveryItem, mixedRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      // Total target: 200 + 100 = 300
      expect(flow.targetRecipeCost).toBe(300);
    });

    it("handles both from and to having recipes", () => {
      // goodRecoveryItem: 200g recipe
      // mixedRecoveryItem: 100g recipe
      const from = createLoadout([goodRecoveryItem], repo);
      const to = createLoadout([mixedRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.recoveredRecipeCost).toBe(200);
      expect(flow.targetRecipeCost).toBe(100);
      expect(flow.netRecipeCost).toBe(-100); // Net profit
    });

    it("handles empty from loadout (no recipes to recover)", () => {
      const from = emptyLoadout();
      const to = createLoadout([goodRecoveryItem], repo);

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.recoveredRecipeCost).toBe(0);
      expect(flow.targetRecipeCost).toBe(200);
      expect(flow.netRecipeCost).toBe(200);
    });

    it("handles empty to loadout (only recovering recipes)", () => {
      const from = createLoadout([goodRecoveryItem], repo);
      const to = emptyLoadout();

      const flow = analyzeComponentFlow(from, to, repo);

      expect(flow.recoveredRecipeCost).toBe(200);
      expect(flow.targetRecipeCost).toBe(0);
      expect(flow.netRecipeCost).toBe(-200);
    });
  });

  describe("totalGoldNeeded in transitions", () => {
    it("includes totalGoldNeeded in createTransition result", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const transition = createTransition(from, to, repo);

      expect(transition.componentFlow.totalGoldNeeded).toBeDefined();
      expect(transition.componentFlow.totalGoldNeeded).toBe(300); // 100g comp + 200g recipe
    });

    it("totalGoldNeeded differs from acquiredGold when recipes involved", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([goodRecoveryItem], repo);

      const transition = createTransition(from, to, repo);

      // Without recipe tracking, you'd think you only need acquiredGold
      // But with recipes, you need acquiredGold + netRecipeCost
      expect(transition.componentFlow.acquiredGold).toBe(100);
      expect(transition.componentFlow.totalGoldNeeded).toBe(300);
      expect(transition.componentFlow.totalGoldNeeded).not.toBe(
        transition.componentFlow.acquiredGold
      );
    });

    it("totalGoldNeeded equals acquiredGold when no recipes involved", () => {
      const from = createLoadout([perfectRecoveryItem], repo);
      const to = createLoadout([perfectRecoveryItem], repo); // same item, no recipe

      const transition = createTransition(from, to, repo);

      // No recipes = totalGoldNeeded should equal acquiredGold
      expect(transition.componentFlow.totalGoldNeeded).toBe(
        transition.componentFlow.acquiredGold
      );
    });
  });
});
