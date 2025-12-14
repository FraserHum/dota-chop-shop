import { describe, it, expect } from "bun:test";
import { calculateStatValuation } from "../calculators/statValuation";
import { Item } from "../models/types";
import {
  strengthComponent,
  agilityComponent,
  intelligenceComponent,
  armorComponent,
  regenComponent,
  manaRegenComponent,
  getAllTestItems,
  EXPECTED_STAT_VALUES,
} from "./fixtures";

describe("calculateStatValuation", () => {
  describe("single-stat items", () => {
    it("calculates gold per point for strength", () => {
      const items: Item[] = [strengthComponent];
      const valuation = calculateStatValuation(items);

      // 100g for 2 str = 50g per point
      expect(valuation.strength).toBeCloseTo(EXPECTED_STAT_VALUES.strength, 2);
    });

    it("calculates gold per point for agility", () => {
      const items: Item[] = [agilityComponent];
      const valuation = calculateStatValuation(items);

      expect(valuation.agility).toBeCloseTo(EXPECTED_STAT_VALUES.agility, 2);
    });

    it("calculates gold per point for intelligence", () => {
      const items: Item[] = [intelligenceComponent];
      const valuation = calculateStatValuation(items);

      expect(valuation.intelligence).toBeCloseTo(EXPECTED_STAT_VALUES.intelligence, 2);
    });

    it("calculates gold per point for armor", () => {
      const items: Item[] = [armorComponent];
      const valuation = calculateStatValuation(items);

      // 100g for 1 armor = 100g per point
      expect(valuation.armor).toBeCloseTo(EXPECTED_STAT_VALUES.armor, 2);
    });

    it("calculates gold per point for healthRegen", () => {
      const items: Item[] = [regenComponent];
      const valuation = calculateStatValuation(items);

      // 100g for 1 hp regen = 100g per point
      expect(valuation.healthRegen).toBeCloseTo(EXPECTED_STAT_VALUES.healthRegen, 2);
    });

    it("calculates gold per point for manaRegen", () => {
      const items: Item[] = [manaRegenComponent];
      const valuation = calculateStatValuation(items);

      // 100g for 0.5 mana regen = 200g per point
      expect(valuation.manaRegen).toBeCloseTo(EXPECTED_STAT_VALUES.manaRegen, 2);
    });
  });

  describe("best ratio selection", () => {
    it("uses the most cost-efficient item for each stat", () => {
      // Create two armor items with different ratios
      const cheapArmor: Item = {
        id: "cheap_armor",
        name: "cheap_armor",
        displayName: "Cheap Armor",
        cost: 100,
        stats: { armor: 2 }, // 50g per point (better)
        isComponent: true,
        isConsumable: false,
      auraStats: {},
        components: [],
      };
      const expensiveArmor: Item = {
        id: "expensive_armor",
        name: "expensive_armor",
        displayName: "Expensive Armor",
        cost: 200,
        stats: { armor: 1 }, // 200g per point (worse)
        isComponent: true,
        isConsumable: false,
      auraStats: {},
        components: [],
      };

      const valuation = calculateStatValuation([cheapArmor, expensiveArmor]);

      // Should use the better ratio (50g per point)
      expect(valuation.armor).toBeCloseTo(50, 2);
    });

    it("handles items with different stats independently", () => {
      const items: Item[] = [strengthComponent, armorComponent];
      const valuation = calculateStatValuation(items);

      expect(valuation.strength).toBeCloseTo(EXPECTED_STAT_VALUES.strength, 2);
      expect(valuation.armor).toBeCloseTo(EXPECTED_STAT_VALUES.armor, 2);
    });
  });

  describe("multi-stat items", () => {
    it("does not use multi-stat items for baseline calculation", () => {
      // Multi-stat item should not be used as baseline
      const multiStatItem: Item = {
        id: "multi",
        name: "multi",
        displayName: "Multi Stat",
        cost: 100,
        stats: { strength: 2, agility: 2 },
        isComponent: true,
        isConsumable: false,
      auraStats: {},
        components: [],
      };

      const valuation = calculateStatValuation([multiStatItem]);

      // No single-stat items, so no direct valuations
      expect(valuation.strength).toBeUndefined();
      expect(valuation.agility).toBeUndefined();
    });

    it("ignores multi-stat items when single-stat items exist", () => {
      const multiStatItem: Item = {
        id: "multi",
        name: "multi",
        displayName: "Multi Stat",
        cost: 50, // Very cheap, but multi-stat
        stats: { strength: 2, agility: 2 },
        isComponent: true,
        isConsumable: false,
      auraStats: {},
        components: [],
      };

      const items: Item[] = [strengthComponent, multiStatItem];
      const valuation = calculateStatValuation(items);

      // Should use strengthComponent ratio (50g), not derive from multiStatItem
      expect(valuation.strength).toBeCloseTo(EXPECTED_STAT_VALUES.strength, 2);
    });
  });

  describe("edge cases", () => {
    it("handles empty item list", () => {
      const valuation = calculateStatValuation([]);
      expect(Object.keys(valuation)).toHaveLength(0);
    });

    it("handles items with zero stats", () => {
      const noStatItem: Item = {
        id: "test",
        name: "test",
        displayName: "Test Item",
        cost: 100,
        stats: {},
        isComponent: true,
        isConsumable: false,
      auraStats: {},
        components: [],
      };
      const valuation = calculateStatValuation([noStatItem]);
      expect(Object.keys(valuation)).toHaveLength(0);
    });

    it("skips consumable items", () => {
      const consumable: Item = {
        id: "consumable",
        name: "consumable",
        displayName: "Consumable",
        cost: 50,
        stats: { healthRegen: 10 },
        isComponent: true,
        isConsumable: true,
      auraStats: {},
        components: [],
      };
      const valuation = calculateStatValuation([consumable]);
      expect(valuation.healthRegen).toBeUndefined();
    });
  });

  describe("with full item set", () => {
    it("calculates valuations for all available stats", () => {
      const items = getAllTestItems();
      const valuation = calculateStatValuation(items);

      // Should have valuations for common stats from our fixtures
      expect(valuation.strength).toBeDefined();
      expect(valuation.agility).toBeDefined();
      expect(valuation.intelligence).toBeDefined();
      expect(valuation.armor).toBeDefined();
      expect(valuation.healthRegen).toBeDefined();
      expect(valuation.manaRegen).toBeDefined();
    });

    it("produces expected valuations based on fixture components", () => {
      const items = getAllTestItems();
      const valuation = calculateStatValuation(items);

      expect(valuation.strength).toBeCloseTo(EXPECTED_STAT_VALUES.strength, 2);
      expect(valuation.agility).toBeCloseTo(EXPECTED_STAT_VALUES.agility, 2);
      expect(valuation.intelligence).toBeCloseTo(EXPECTED_STAT_VALUES.intelligence, 2);
      expect(valuation.armor).toBeCloseTo(EXPECTED_STAT_VALUES.armor, 2);
      expect(valuation.healthRegen).toBeCloseTo(EXPECTED_STAT_VALUES.healthRegen, 2);
      expect(valuation.manaRegen).toBeCloseTo(EXPECTED_STAT_VALUES.manaRegen, 2);
    });

    it("produces positive valuations for all stats", () => {
      const items = getAllTestItems();
      const valuation = calculateStatValuation(items);

      for (const [stat, value] of Object.entries(valuation)) {
        expect(value, `${stat} should be positive`).toBeGreaterThan(0);
      }
    });
  });
});
