import { describe, it, expect } from "bun:test";
import { ItemRepository } from "../data/ItemRepository";
import {
  getAllTestItems,
  strengthComponent,
  perfectRecoveryItem,
  goodRecoveryItem,
} from "./fixtures";

describe("ItemRepository", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  describe("basic lookups", () => {
    it("getByName returns correct item", () => {
      const item = repo.getByName("strength_component");
      expect(item).toBeDefined();
      expect(item?.displayName).toBe("Strength Component");
    });

    it("getByDisplayName returns correct item", () => {
      const item = repo.getByDisplayName("Strength Component");
      expect(item).toBeDefined();
      expect(item?.name).toBe("strength_component");
    });

    it("has returns true for existing items", () => {
      expect(repo.has("strength_component")).toBe(true);
      expect(repo.has("nonexistent")).toBe(false);
    });

    it("getAll returns all items", () => {
      expect(repo.getAll()).toHaveLength(items.length);
    });
  });

  describe("getBaseComponents", () => {
    it("returns item name for base components", () => {
      const components = repo.getBaseComponents(strengthComponent);
      expect(components).toEqual(["strength_component"]);
    });

    it("returns base components for upgraded items", () => {
      const components = repo.getBaseComponents(perfectRecoveryItem);
      expect(components).toContain("strength_component");
      expect(components).toContain("agility_component");
      expect(components).toHaveLength(2);
    });

    it("returns base components for multi-component items", () => {
      const multiItem = repo.getByName("multi_component");
      expect(multiItem).toBeDefined();
      const components = repo.getBaseComponents(multiItem!);
      expect(components).toContain("strength_component");
      expect(components).toContain("agility_component");
      expect(components).toContain("intelligence_component");
      expect(components).toHaveLength(3);
    });

    it("memoizes results", () => {
      const first = repo.getBaseComponents(perfectRecoveryItem);
      const second = repo.getBaseComponents(perfectRecoveryItem);
      expect(first).toBe(second); // Same reference
    });
  });

  describe("getRecipeCost", () => {
    it("returns 0 for base components", () => {
      expect(repo.getRecipeCost(strengthComponent)).toBe(0);
    });

    it("returns 0 for items with no recipe cost", () => {
      // perfectRecoveryItem: 200g = 100g str + 100g agi + 0 recipe
      expect(repo.getRecipeCost(perfectRecoveryItem)).toBe(0);
    });

    it("calculates recipe cost correctly", () => {
      // goodRecoveryItem: 400g = 100g str + 100g int + 200g recipe
      expect(repo.getRecipeCost(goodRecoveryItem)).toBe(200);
    });

    it("memoizes results", () => {
      const first = repo.getRecipeCost(goodRecoveryItem);
      const second = repo.getRecipeCost(goodRecoveryItem);
      expect(first).toBe(second);
    });
  });

  describe("getComponentsGoldValue", () => {
    it("calculates total gold value", () => {
      const value = repo.getComponentsGoldValue([
        "strength_component",
        "agility_component",
      ]);
      expect(value).toBe(200); // 100 + 100
    });

    it("returns 0 for empty array", () => {
      expect(repo.getComponentsGoldValue([])).toBe(0);
    });

    it("returns 0 for unknown components", () => {
      expect(repo.getComponentsGoldValue(["nonexistent"])).toBe(0);
    });
  });

  describe("getComponentIndex", () => {
    it("builds index mapping components to items", () => {
      const index = repo.getComponentIndex();
      expect(index).toBeInstanceOf(Map);

      // strength_component is used in multiple items
      const strengthUsers = index.get("strength_component");
      expect(strengthUsers).toBeDefined();
      expect(strengthUsers!.length).toBeGreaterThan(0);
    });

    it("memoizes the index", () => {
      const first = repo.getComponentIndex();
      const second = repo.getComponentIndex();
      expect(first).toBe(second); // Same reference
    });
  });

  describe("findUpgradeTargets (deprecated)", () => {
    it("returns items above cost threshold", () => {
      // Use a threshold that exists in our test fixtures
      // Our "late" items are 2500-3000g
      const targets = repo.findUpgradeTargets("strength_component", 2500);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.cost).toBeGreaterThanOrEqual(2500);
      }
    });

    it("filters out items below threshold", () => {
      const targets = repo.findUpgradeTargets("strength_component", 10000);
      expect(targets).toHaveLength(0);
    });
  });

  describe("findAllUpgradeTargets", () => {
    it("returns ALL items using a component regardless of cost", () => {
      const allTargets = repo.findAllUpgradeTargets("strength_component");
      const filteredTargets = repo.findUpgradeTargets("strength_component", 2500);

      // Should have more or equal items since no filter
      expect(allTargets.length).toBeGreaterThanOrEqual(filteredTargets.length);
    });

    it("includes low-cost items that would be filtered", () => {
      const allTargets = repo.findAllUpgradeTargets("strength_component");
      const targetNames = allTargets.map((i) => i.name);

      // perfectRecoveryItem (200g) uses strength_component
      expect(targetNames).toContain("perfect_recovery");
    });

    it("returns empty array for unused components", () => {
      const targets = repo.findAllUpgradeTargets("nonexistent");
      expect(targets).toHaveLength(0);
    });

    it("returns items for dead_end_component (used in poor_recovery)", () => {
      // dead_end_component IS used in poor_recovery (early item)
      const targets = repo.findAllUpgradeTargets("dead_end_component");
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.some((t) => t.name === "poor_recovery")).toBe(true);
    });

    it("supports exclude parameter to filter out specific items", () => {
      // When analyzing poor_recovery's disassemble potential,
      // we exclude poor_recovery itself to prevent circular logic
      const allTargets = repo.findAllUpgradeTargets("dead_end_component");
      const excludedTargets = repo.findAllUpgradeTargets("dead_end_component", ["poor_recovery"]);
      
      expect(allTargets.some((t) => t.name === "poor_recovery")).toBe(true);
      expect(excludedTargets.some((t) => t.name === "poor_recovery")).toBe(false);
      expect(excludedTargets.length).toBe(0); // dead_end only builds into poor_recovery
    });
  });

  describe("findAllUpgradeTargetNames", () => {
    it("returns display names of all upgrade targets", () => {
      const names = repo.findAllUpgradeTargetNames("strength_component");
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((n) => typeof n === "string")).toBe(true);

      // Should include Perfect Recovery Item
      expect(names).toContain("Perfect Recovery Item");
    });
  });

  describe("getAllUpgradedItems", () => {
    it("returns all items with components", () => {
      const upgraded = repo.getAllUpgradedItems();
      expect(upgraded.length).toBeGreaterThan(0);

      for (const item of upgraded) {
        expect(item.components.length).toBeGreaterThan(0);
      }
    });

    it("excludes base components", () => {
      const upgraded = repo.getAllUpgradedItems();
      const names = upgraded.map((i) => i.name);

      expect(names).not.toContain("strength_component");
      expect(names).not.toContain("agility_component");
    });

    it("includes items of varying costs", () => {
      const upgraded = repo.getAllUpgradedItems();
      const costs = upgraded.map(i => i.cost);
      
      // Should have a range of costs
      const minCost = Math.min(...costs);
      const maxCost = Math.max(...costs);
      expect(maxCost).toBeGreaterThan(minCost);
    });

    it("returns more items than cost-filtered methods", () => {
      const all = repo.getAllUpgradedItems();
      const expensive = repo.getLateGameItems(2500);

      expect(all.length).toBeGreaterThan(expensive.length);
    });
  });

  describe("getEarlyGameItems", () => {
    it("returns upgraded items under cost threshold", () => {
      const maxCost = 1000;
      const early = repo.getEarlyGameItems(maxCost);
      expect(early.length).toBeGreaterThan(0);

      for (const item of early) {
        expect(item.cost).toBeLessThanOrEqual(maxCost);
        expect(item.components.length).toBeGreaterThan(0);
        expect(item.isComponent).toBe(false);
      }
    });
  });

  describe("getLateGameItems", () => {
    it("returns items at or above cost threshold", () => {
      const minCost = 2500;
      const late = repo.getLateGameItems(minCost);
      expect(late.length).toBeGreaterThan(0);

      for (const item of late) {
        expect(item.cost).toBeGreaterThanOrEqual(minCost);
        expect(item.components.length).toBeGreaterThan(0);
      }
    });
  });

  describe("filter", () => {
    it("filters items by predicate", () => {
      const cheap = repo.filter((i) => i.cost < 200);
      expect(cheap.length).toBeGreaterThan(0);
      for (const item of cheap) {
        expect(item.cost).toBeLessThan(200);
      }
    });
  });
});

describe("ItemRepository edge cases", () => {
  it("handles empty item list", () => {
    const emptyRepo = new ItemRepository([]);
    expect(emptyRepo.getAll()).toHaveLength(0);
    expect(emptyRepo.getAllUpgradedItems()).toHaveLength(0);
    expect(emptyRepo.findAllUpgradeTargets("anything")).toHaveLength(0);
  });

  it("handles items with missing component references", () => {
    const itemWithMissingComponent = {
      id: "test",
      name: "test",
      displayName: "Test",
      cost: 100,
      stats: {},
      isComponent: false,
      isConsumable: false,
      auraStats: {},
      components: ["nonexistent_component"],
    };

    const repo = new ItemRepository([itemWithMissingComponent]);
    const components = repo.getBaseComponents(itemWithMissingComponent);

    // Should include the missing component name as-is
    expect(components).toContain("nonexistent_component");
  });
});
