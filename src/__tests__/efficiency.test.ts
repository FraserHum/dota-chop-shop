import { describe, it, expect } from "bun:test";
import {
  calculateItemEfficiency,
  getItemsByEfficiency,
  getItemsByValue,
  getItemsByValueSplit,
} from "../calculators/efficiency";
import { Item, StatValuation } from "../models/types";
import {
  strengthComponent,
  agilityComponent,
  intelligenceComponent,
  perfectRecoveryItem,
  keyUtilityItem,
  getAllTestItems,
  getMinimalTestItems,
  EXPECTED_STAT_VALUES,
} from "./fixtures";

describe("efficiency", () => {
  describe("calculateItemEfficiency", () => {
    // Use expected stat values from fixtures for predictable tests
    const fixedValuation: StatValuation = {
      strength: EXPECTED_STAT_VALUES.strength,
      agility: EXPECTED_STAT_VALUES.agility,
      intelligence: EXPECTED_STAT_VALUES.intelligence,
      armor: EXPECTED_STAT_VALUES.armor,
      healthRegen: EXPECTED_STAT_VALUES.healthRegen,
      manaRegen: EXPECTED_STAT_VALUES.manaRegen,
      moveSpeed: EXPECTED_STAT_VALUES.moveSpeed,
    };

    it("calculates efficiency for a single-stat item", () => {
      const result = calculateItemEfficiency(strengthComponent, fixedValuation);

      // strengthComponent: 2 str * 50g/point = 100g value, cost 100g
      expect(result.totalStatValue).toBe(2 * 50);
      expect(result.efficiency).toBeCloseTo(100 / 100, 4);
      expect(result.item).toBe(strengthComponent);
    });

    it("calculates efficiency for multi-stat items", () => {
      const result = calculateItemEfficiency(perfectRecoveryItem, fixedValuation);

      // perfectRecoveryItem: 2 str + 2 agi = 4 * 50 = 200g value, cost 200g
      expect(result.totalStatValue).toBe(4 * 50);
      expect(result.efficiency).toBeCloseTo(200 / 200, 4);
    });

    it("includes utility value in total and efficiencyWithUtility", () => {
      // keyUtilityItem has utility (force_staff has mobility + save)
      const result = calculateItemEfficiency(keyUtilityItem, fixedValuation);

      // keyUtilityItem: 10 int * 50 + 2 healthRegen * 100 = 700g stat value
      expect(result.totalStatValue).toBe(10 * 50 + 2 * 100);
      expect(result.utilityValue).toBeGreaterThan(0);
      expect(result.totalValue).toBe(result.totalStatValue + result.utilityValue);
      expect(result.efficiencyWithUtility).toBeGreaterThan(result.efficiency);
    });

    it("handles items with zero stats but utility", () => {
      // Create an item with no stats but named to have utility
      const utilityOnlyItem: Item = {
        id: "blink",
        name: "blink",
        displayName: "Blink Dagger",
        cost: 2000,
        stats: {},
        isComponent: true,
        isConsumable: false,
        components: [],
      };

      const result = calculateItemEfficiency(utilityOnlyItem, fixedValuation);

      expect(result.totalStatValue).toBe(0);
      expect(result.efficiency).toBe(0);
      expect(result.utilityValue).toBeGreaterThan(0);
      expect(result.totalValue).toBe(result.utilityValue);
      expect(result.efficiencyWithUtility).toBeGreaterThan(0);
    });

    it("returns stat breakdown", () => {
      const result = calculateItemEfficiency(perfectRecoveryItem, fixedValuation);

      expect(result.statBreakdown).toHaveLength(2);

      const strBreakdown = result.statBreakdown.find((b) => b.stat === "strength");
      expect(strBreakdown).toBeDefined();
      expect(strBreakdown!.amount).toBe(2);
      expect(strBreakdown!.goldValue).toBe(100);

      const agiBreakdown = result.statBreakdown.find((b) => b.stat === "agility");
      expect(agiBreakdown).toBeDefined();
      expect(agiBreakdown!.amount).toBe(2);
      expect(agiBreakdown!.goldValue).toBe(100);
    });

    it("handles items with zero cost gracefully", () => {
      const zeroCostItem: Item = {
        id: "test",
        name: "test",
        displayName: "Test",
        cost: 0,
        stats: { strength: 5 },
        isComponent: true,
        isConsumable: false,
        components: [],
      };

      const result = calculateItemEfficiency(zeroCostItem, fixedValuation);
      expect(result.efficiency).toBe(0);
      expect(result.efficiencyWithUtility).toBe(0);
    });

    it("handles items with no stats", () => {
      const noStatItem: Item = {
        id: "test",
        name: "test",
        displayName: "Test",
        cost: 100,
        stats: {},
        isComponent: true,
        isConsumable: false,
        components: [],
      };

      const result = calculateItemEfficiency(noStatItem, fixedValuation);
      expect(result.totalStatValue).toBe(0);
      expect(result.statBreakdown).toHaveLength(0);
    });
  });

  describe("getItemsByEfficiency", () => {
    it("returns items sorted by efficiency (highest first)", () => {
      const items = [strengthComponent, agilityComponent, intelligenceComponent];
      const results = getItemsByEfficiency(items);

      expect(results).toHaveLength(3);

      // Should be sorted by efficiency descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].efficiency).toBeGreaterThanOrEqual(results[i + 1].efficiency);
      }
    });

    it("handles empty array", () => {
      const results = getItemsByEfficiency([]);
      expect(results).toHaveLength(0);
    });

    it("calculates efficiency using derived stat valuation", () => {
      const items = getMinimalTestItems();
      const results = getItemsByEfficiency(items);

      expect(results.length).toBeGreaterThan(0);

      // All efficiencies should be non-negative
      for (const result of results) {
        expect(result.efficiency).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("getItemsByValue", () => {
    it("returns items sorted by value score (highest first)", () => {
      const items = getMinimalTestItems();
      const results = getItemsByValue(items);

      // Should be sorted by valueScore descending
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].valueScore).toBeGreaterThanOrEqual(results[i + 1].valueScore);
      }
    });

    it("filters out items with zero total value", () => {
      const noValueItem: Item = {
        id: "test",
        name: "test",
        displayName: "Test",
        cost: 100,
        stats: {},
        isComponent: true,
        isConsumable: false,
        components: [],
      };

      const items = [strengthComponent, noValueItem];
      const results = getItemsByValue(items);

      // Should only include items with value
      expect(results.length).toBeLessThanOrEqual(items.length);
      for (const result of results) {
        expect(result.totalValue).toBeGreaterThan(0);
      }
    });

    it("includes normalized scores between 0 and 1", () => {
      const items = getMinimalTestItems();
      const results = getItemsByValue(items);

      for (const result of results) {
        expect(result.normalizedEfficiency).toBeGreaterThanOrEqual(0);
        expect(result.normalizedEfficiency).toBeLessThanOrEqual(1);
        expect(result.normalizedCost).toBeGreaterThanOrEqual(0);
        expect(result.normalizedCost).toBeLessThanOrEqual(1);
        expect(result.valueScore).toBeGreaterThanOrEqual(0);
        expect(result.valueScore).toBeLessThanOrEqual(1);
      }
    });

    it("handles empty array", () => {
      const results = getItemsByValue([]);
      expect(results).toHaveLength(0);
    });

    it("value score is average of normalized efficiency and cost", () => {
      const items = getMinimalTestItems();
      const results = getItemsByValue(items);

      for (const result of results) {
        const expectedScore = (result.normalizedEfficiency + result.normalizedCost) / 2;
        expect(result.valueScore).toBeCloseTo(expectedScore, 5);
      }
    });
  });

  describe("getItemsByValueSplit", () => {
    it("separates component and upgraded items", () => {
      const items = getAllTestItems();
      const { simpleItems, upgradedItems } = getItemsByValueSplit(items);

      // All simple items should be components
      for (const result of simpleItems) {
        expect(result.item.isComponent).toBe(true);
      }

      // All upgraded items should not be components
      for (const result of upgradedItems) {
        expect(result.item.isComponent).toBe(false);
      }
    });

    it("maintains sorted order in both lists", () => {
      const items = getAllTestItems();
      const { simpleItems, upgradedItems } = getItemsByValueSplit(items);

      // Simple items should be sorted
      for (let i = 0; i < simpleItems.length - 1; i++) {
        expect(simpleItems[i].valueScore).toBeGreaterThanOrEqual(simpleItems[i + 1].valueScore);
      }

      // Upgraded items should be sorted
      for (let i = 0; i < upgradedItems.length - 1; i++) {
        expect(upgradedItems[i].valueScore).toBeGreaterThanOrEqual(upgradedItems[i + 1].valueScore);
      }
    });

    it("includes all items with value", () => {
      const items = getAllTestItems();
      const { simpleItems, upgradedItems } = getItemsByValueSplit(items);

      // Total should match getItemsByValue result count
      const allValueItems = getItemsByValue(items);
      expect(simpleItems.length + upgradedItems.length).toBe(allValueItems.length);
    });

    it("handles empty arrays", () => {
      const { simpleItems, upgradedItems } = getItemsByValueSplit([]);
      expect(simpleItems).toHaveLength(0);
      expect(upgradedItems).toHaveLength(0);
    });
  });
});
