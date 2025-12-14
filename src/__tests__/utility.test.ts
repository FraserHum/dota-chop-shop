import { describe, it, expect } from "bun:test";
import {
  calculateUtilityValue,
  getItemUtilityCategories,
  formatUtilityCategories,
  UtilityCategory,
  UTILITY_VALUES,
  ITEM_UTILITY,
} from "../calculators/utility";

describe("utility", () => {
  describe("calculateUtilityValue", () => {
    it("returns 0 for items without utility", () => {
      expect(calculateUtilityValue("branches")).toBe(0);
      expect(calculateUtilityValue("gauntlets")).toBe(0);
      expect(calculateUtilityValue("unknown_item")).toBe(0);
    });

    it("returns correct value for single-category items", () => {
      // Blink has only Mobility
      expect(calculateUtilityValue("blink")).toBe(UTILITY_VALUES[UtilityCategory.Mobility]);

      // Glimmer cape has only Save
      expect(calculateUtilityValue("glimmer_cape")).toBe(UTILITY_VALUES[UtilityCategory.Save]);

      // Black King Bar has only Spell Immunity
      expect(calculateUtilityValue("black_king_bar")).toBe(UTILITY_VALUES[UtilityCategory.SpellImmunity]);
    });

    it("sums values for multi-category items", () => {
      // Force Staff has Mobility + Save
      const forceStaffValue = calculateUtilityValue("force_staff");
      expect(forceStaffValue).toBe(
        UTILITY_VALUES[UtilityCategory.Mobility] + UTILITY_VALUES[UtilityCategory.Save]
      );

      // Eul's (cyclone) has Dispel + Disable
      const eulsValue = calculateUtilityValue("cyclone");
      expect(eulsValue).toBe(
        UTILITY_VALUES[UtilityCategory.Dispel] + UTILITY_VALUES[UtilityCategory.Disable]
      );

      // Wind Waker has Dispel + Mobility + Save
      const windWakerValue = calculateUtilityValue("wind_waker");
      expect(windWakerValue).toBe(
        UTILITY_VALUES[UtilityCategory.Dispel] +
        UTILITY_VALUES[UtilityCategory.Mobility] +
        UTILITY_VALUES[UtilityCategory.Save]
      );
    });

    it("handles items with damage amp correctly", () => {
      // Medallion of Courage has DamageAmp
      expect(calculateUtilityValue("medallion_of_courage")).toBe(
        UTILITY_VALUES[UtilityCategory.DamageAmp]
      );

      // Solar Crest has Save + DamageAmp
      expect(calculateUtilityValue("solar_crest")).toBe(
        UTILITY_VALUES[UtilityCategory.Save] + UTILITY_VALUES[UtilityCategory.DamageAmp]
      );
    });

    it("handles team utility items", () => {
      // Mekansm has TeamUtility
      expect(calculateUtilityValue("mekansm")).toBe(UTILITY_VALUES[UtilityCategory.TeamUtility]);

      // Drum of Endurance has TeamUtility
      expect(calculateUtilityValue("drum_of_endurance")).toBe(
        UTILITY_VALUES[UtilityCategory.TeamUtility]
      );
    });
  });

  describe("getItemUtilityCategories", () => {
    it("returns empty array for items without utility", () => {
      expect(getItemUtilityCategories("branches")).toEqual([]);
      expect(getItemUtilityCategories("unknown_item")).toEqual([]);
    });

    it("returns correct categories for items", () => {
      expect(getItemUtilityCategories("blink")).toEqual([UtilityCategory.Mobility]);
      
      expect(getItemUtilityCategories("force_staff")).toContain(UtilityCategory.Mobility);
      expect(getItemUtilityCategories("force_staff")).toContain(UtilityCategory.Save);
      
      expect(getItemUtilityCategories("guardian_greaves")).toContain(UtilityCategory.Dispel);
      expect(getItemUtilityCategories("guardian_greaves")).toContain(UtilityCategory.TeamUtility);
    });
  });

  describe("formatUtilityCategories", () => {
    it("returns '-' for items without utility", () => {
      expect(formatUtilityCategories("branches")).toBe("-");
      expect(formatUtilityCategories("unknown_item")).toBe("-");
    });

    it("returns formatted string for single-category items", () => {
      expect(formatUtilityCategories("blink")).toBe("mobility");
    });

    it("returns comma-separated string for multi-category items", () => {
      const result = formatUtilityCategories("force_staff");
      expect(result).toContain("mobility");
      expect(result).toContain("save");
      expect(result).toContain(", ");
    });
  });

  describe("UTILITY_VALUES", () => {
    it("has positive values for all categories", () => {
      for (const category of Object.values(UtilityCategory)) {
        expect(UTILITY_VALUES[category], `${category} should have positive value`).toBeGreaterThan(0);
      }
    });

    it("has expected relative values", () => {
      // Mobility and Spell Immunity should be highest value
      expect(UTILITY_VALUES[UtilityCategory.Mobility]).toBeGreaterThanOrEqual(
        UTILITY_VALUES[UtilityCategory.TeamUtility]
      );
      expect(UTILITY_VALUES[UtilityCategory.SpellImmunity]).toBeGreaterThanOrEqual(
        UTILITY_VALUES[UtilityCategory.TeamUtility]
      );
    });
  });

  describe("ITEM_UTILITY coverage", () => {
    it("includes key support items", () => {
      const supportItems = [
        "force_staff",
        "glimmer_cape",
        "lotus_orb",
        "mekansm",
        "pipe",
        "guardian_greaves",
      ];
      
      for (const item of supportItems) {
        expect(ITEM_UTILITY[item], `${item} should have utility categories`).toBeDefined();
        expect(ITEM_UTILITY[item].length).toBeGreaterThan(0);
      }
    });

    it("includes key disable items", () => {
      const disableItems = [
        "sheepstick",
        "abyssal_blade",
        "rod_of_atos",
        "orchid",
      ];
      
      for (const item of disableItems) {
        expect(ITEM_UTILITY[item], `${item} should have utility categories`).toBeDefined();
        expect(ITEM_UTILITY[item]).toContain(UtilityCategory.Disable);
      }
    });

    it("includes all blink variants", () => {
      const blinkItems = [
        "blink",
        "swift_blink",
        "arcane_blink",
        "overwhelming_blink",
      ];
      
      for (const item of blinkItems) {
        expect(ITEM_UTILITY[item], `${item} should have utility categories`).toBeDefined();
        expect(ITEM_UTILITY[item]).toContain(UtilityCategory.Mobility);
      }
    });
  });
});
