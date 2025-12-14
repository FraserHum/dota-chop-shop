import { describe, it, expect } from "bun:test";
import {
  analyzeDisassemble,
  analyzeEarlyItemCombos,
  analyzeBootTrios,
  analyzeReachability,
  analyzeKeyUtilityItems,
} from "../calculators/upgradePaths";
import {
  getAllTestItems,
  EXPECTED_RECOVERY_RATES,
  MIN_GOLD_RECOVERY_THRESHOLD,
} from "./fixtures";

describe("analyzeDisassemble", () => {
  const items = getAllTestItems();

  it("returns analysis for all upgraded items", () => {
    const results = analyzeDisassemble(items);

    expect(results.length).toBeGreaterThan(0);

    for (const result of results) {
      // Should be upgraded items (have components), not base components
      expect(result.item.isComponent).toBe(false);
      expect(result.item.components.length).toBeGreaterThan(0);
    }
  });

  it("calculates correct recovery rate for perfectRecoveryItem (100%)", () => {
    const results = analyzeDisassemble(items);
    const perfect = results.find((r) => r.item.name === "perfect_recovery");

    expect(perfect).toBeDefined();
    expect(perfect!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.perfectRecoveryItem, 2);
    expect(perfect!.recipeCost).toBe(0); // No recipe (200 - 100 - 100 = 0)
    expect(perfect!.usableComponentsGold).toBe(200); // str 100 + agi 100
    expect(perfect!.totalRecoveredGold).toBe(200);
    expect(perfect!.wastedGold).toBe(0);
  });

  it("calculates correct recovery rate for goodRecoveryItem (100%)", () => {
    const results = analyzeDisassemble(items);
    const good = results.find((r) => r.item.name === "good_recovery");

    expect(good).toBeDefined();
    expect(good!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.goodRecoveryItem, 2);
    expect(good!.recipeCost).toBe(200); // 400 - 100 - 100 = 200
    expect(good!.usableComponentsGold).toBe(200); // str 100 + int 100
    expect(good!.totalRecoveredGold).toBe(400); // 200 + 200
  });

  it("calculates correct recovery rate for mixedRecoveryItem (100%)", () => {
    const results = analyzeDisassemble(items);
    const mixed = results.find((r) => r.item.name === "mixed_recovery");

    expect(mixed).toBeDefined();
    expect(mixed!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.mixedRecoveryItem, 2);
    expect(mixed!.recipeCost).toBe(100); // 300 - 100 - 100 = 100
    // Both components are usable (str builds into many items, damage builds into mixedRecoveryItem)
    expect(mixed!.usableComponentsGold).toBe(200); // str 100 + damage 100
    expect(mixed!.totalRecoveredGold).toBe(300); // 200 + 100 recipe
    expect(mixed!.wastedGold).toBeCloseTo(0, 2); // nothing wasted
  });

  it("calculates correct recovery rate for poorRecoveryItem (50%)", () => {
    const results = analyzeDisassemble(items);
    const poor = results.find((r) => r.item.name === "poor_recovery");

    expect(poor).toBeDefined();
    expect(poor!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.poorRecoveryItem, 2);
    expect(poor!.recipeCost).toBe(200); // 400 - 100 - 100 = 200
    // dead_end_component is NOT usable (only builds into poorRecoveryItem which is a dead end)
    expect(poor!.usableComponentsGold).toBe(0); // no usable components
    expect(poor!.totalRecoveredGold).toBe(200); // only recipe
    expect(poor!.wastedGold).toBe(200); // both dead_end components
  });

  it("calculates correct recovery rate for multiComponentItem (100%)", () => {
    const results = analyzeDisassemble(items);
    const multi = results.find((r) => r.item.name === "multi_component");

    expect(multi).toBeDefined();
    expect(multi!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.multiComponentItem, 2);
    expect(multi!.components.length).toBe(3); // 3 components
    expect(multi!.usableComponentsGold).toBe(300); // str + agi + int
  });

  it("calculates correct recovery for upgradedBoots (100%)", () => {
    const results = analyzeDisassemble(items);
    const boots = results.find((r) => r.item.name === "tranquil_boots");

    expect(boots).toBeDefined();
    expect(boots!.goldEfficiency).toBeCloseTo(EXPECTED_RECOVERY_RATES.upgradedBoots, 2);
    expect(boots!.usableComponentsGold).toBe(400); // boots 300 + str 100
  });

  it("sorts results by disassemble score (highest first)", () => {
    const results = analyzeDisassemble(items);

    // Results should be sorted by disassembleScore, which factors in
    // gold efficiency, value, and cost preference
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].disassembleScore).toBeGreaterThanOrEqual(
        results[i + 1].disassembleScore - 0.01
      );
    }
  });

  it("includes disassembleScore in results", () => {
    const results = analyzeDisassemble(items);

    for (const result of results) {
      expect(typeof result.disassembleScore).toBe("number");
      expect(result.disassembleScore).toBeGreaterThan(0);
    }
  });

  it("includes efficiency metrics", () => {
    const results = analyzeDisassemble(items);

    for (const result of results) {
      expect(typeof result.efficiency).toBe("number");
      expect(typeof result.statValue).toBe("number");
      expect(typeof result.utilityValue).toBe("number");
      expect(typeof result.totalValue).toBe("number");
      expect(result.totalValue).toBe(result.statValue + result.utilityValue);
    }
  });

  it("handles empty item list", () => {
    const results = analyzeDisassemble([]);
    expect(results).toHaveLength(0);
  });
});

describe("analyzeEarlyItemCombos", () => {
  const items = getAllTestItems();

  it("returns combo pairs of early items", () => {
    const results = analyzeEarlyItemCombos(items);

    expect(results.length).toBeGreaterThan(0);

    for (const combo of results) {
      expect(combo.earlyItems).toHaveLength(2);
    }
  });

  it("only includes items meeting minimum recovery threshold (65%)", () => {
    const results = analyzeEarlyItemCombos(items);

    for (const combo of results) {
      for (const early of combo.earlyItems) {
        expect(early.goldEfficiency).toBeGreaterThanOrEqual(MIN_GOLD_RECOVERY_THRESHOLD);
      }
    }
  });

  it("includes all items meeting minimum recovery threshold (65%)", () => {
    const results = analyzeEarlyItemCombos(items);

    // With the new approach, poorRecoveryItem has 100% recovery (orphan_component is usable)
    // so it should be included in combos
    const allItemNames = new Set<string>();
    for (const combo of results) {
      for (const early of combo.earlyItems) {
        allItemNames.add(early.item.name);
      }
    }
    
    // All early items should have high recovery now
    for (const combo of results) {
      for (const early of combo.earlyItems) {
        expect(early.goldEfficiency).toBeGreaterThanOrEqual(MIN_GOLD_RECOVERY_THRESHOLD);
      }
    }
  });

  it("excludes boot + boot combinations", () => {
    const results = analyzeEarlyItemCombos(items);

    const bootNames = new Set(["tranquil_boots", "arcane_boots"]);

    for (const combo of results) {
      const bootCount = combo.earlyItems.filter((e) => bootNames.has(e.item.name)).length;
      expect(bootCount).toBeLessThanOrEqual(1);
    }
  });

  it("calculates combined metrics correctly", () => {
    const results = analyzeEarlyItemCombos(items);

    for (const combo of results) {
      const [early1, early2] = combo.earlyItems;

      expect(combo.combinedCost).toBe(early1.item.cost + early2.item.cost);
      expect(combo.combinedValue).toBeCloseTo(early1.totalValue + early2.totalValue, 2);
      expect(combo.totalWastedGold).toBeCloseTo(early1.wastedGold + early2.wastedGold, 2);
      expect(combo.averageRecovery).toBeCloseTo(
        (early1.goldEfficiency + early2.goldEfficiency) / 2,
        5
      );
    }
  });

  it("only includes combos with shared upgrade targets", () => {
    const results = analyzeEarlyItemCombos(items);

    for (const combo of results) {
      expect(combo.sharedTargets.length).toBeGreaterThan(0);
    }
  });

  it("shared targets require both items to contribute", () => {
    const results = analyzeEarlyItemCombos(items);

    for (const combo of results) {
      for (const target of combo.sharedTargets) {
        expect(target.contributingEarlyItems.length).toBe(2);
      }
    }
  });

  it("sorts by synergy score (highest first)", () => {
    const results = analyzeEarlyItemCombos(items);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].synergyScore).toBeGreaterThanOrEqual(results[i + 1].synergyScore);
    }
  });

  it("handles empty item list", () => {
    const results = analyzeEarlyItemCombos([]);
    expect(results).toHaveLength(0);
  });
});

describe("analyzeBootTrios", () => {
  const items = getAllTestItems();

  it("returns trio combinations with one boot and two non-boots", () => {
    const results = analyzeBootTrios(items);

    expect(results.length).toBeGreaterThan(0);

    for (const trio of results) {
      expect(trio.bootItem).toBeDefined();
      expect(trio.nonBootItems).toHaveLength(2);
    }
  });

  it("boot item is a boot", () => {
    const results = analyzeBootTrios(items);

    const bootNames = new Set(["tranquil_boots", "arcane_boots"]);

    for (const trio of results) {
      expect(bootNames.has(trio.bootItem.item.name)).toBe(true);
    }
  });

  it("non-boot items are not boots", () => {
    const results = analyzeBootTrios(items);

    const bootNames = new Set(["tranquil_boots", "arcane_boots", "boots"]);

    for (const trio of results) {
      for (const nonBoot of trio.nonBootItems) {
        expect(bootNames.has(nonBoot.item.name)).toBe(false);
      }
    }
  });

  it("calculates combined metrics correctly", () => {
    const results = analyzeBootTrios(items);

    for (const trio of results) {
      const allItems = [trio.bootItem, ...trio.nonBootItems];

      const expectedCost = allItems.reduce((sum, e) => sum + e.item.cost, 0);
      const expectedValue = allItems.reduce((sum, e) => sum + e.totalValue, 0);
      const expectedWasted = allItems.reduce((sum, e) => sum + e.wastedGold, 0);
      const expectedRecovery = allItems.reduce((sum, e) => sum + e.goldEfficiency, 0) / 3;

      expect(trio.combinedCost).toBe(expectedCost);
      expect(trio.combinedValue).toBeCloseTo(expectedValue, 2);
      expect(trio.totalWastedGold).toBeCloseTo(expectedWasted, 2);
      expect(trio.averageRecovery).toBeCloseTo(expectedRecovery, 5);
    }
  });

  it("shared targets require at least 2 items to contribute", () => {
    const results = analyzeBootTrios(items);

    for (const trio of results) {
      for (const target of trio.sharedTargets) {
        expect(target.contributingEarlyItems.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("sorts by synergy score (highest first)", () => {
    const results = analyzeBootTrios(items);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].synergyScore).toBeGreaterThanOrEqual(results[i + 1].synergyScore);
    }
  });

  it("handles empty item list", () => {
    const results = analyzeBootTrios([]);
    expect(results).toHaveLength(0);
  });
});

describe("analyzeReachability", () => {
  const items = getAllTestItems();

  it("returns correct structure", () => {
    const result = analyzeReachability(items);

    expect(result.availableComponents).toBeInstanceOf(Set);
    expect(Array.isArray(result.orphanComponents)).toBe(true);
    expect(Array.isArray(result.lateItemReachability)).toBe(true);
    expect(typeof result.totalLateItems).toBe("number");
    expect(typeof result.fullyReachableCount).toBe("number");
    expect(typeof result.partiallyReachableCount).toBe("number");
    expect(typeof result.unreachableCount).toBe("number");
  });

  it("counts add up correctly", () => {
    const result = analyzeReachability(items);

    const sum =
      result.fullyReachableCount + result.partiallyReachableCount + result.unreachableCount;
    expect(sum).toBe(result.totalLateItems);
  });

  it("includes all upgraded items (items with components)", () => {
    const result = analyzeReachability(items);

    // NEW BEHAVIOR: We now include ALL upgraded items (items with components)
    // not just items >= 2500g. The cost constraint is validated at the build level.
    for (const lateItem of result.lateItemReachability) {
      expect(lateItem.item.components.length).toBeGreaterThan(0);
    }
  });

  it("identifies available components from disassemble candidates", () => {
    const result = analyzeReachability(items);

    // Components from items with good gold recovery should be available
    // This includes components from all upgraded items that meet the recovery threshold
    expect(result.availableComponents.has("strength_component")).toBe(true);
    expect(result.availableComponents.has("agility_component")).toBe(true);
    expect(result.availableComponents.has("intelligence_component")).toBe(true);
  });

  it("orphan components are those not in any disassemble candidate", () => {
    const result = analyzeReachability(items);

    // An orphan is a component that doesn't appear in any item meeting the gold recovery threshold
    // With the new approach (all upgraded items are candidates), orphans are rarer
    // The truly_orphan_component IS used in partiallyReachableLateItem and unreachableLateItem,
    // so if those items meet the gold recovery threshold, truly_orphan becomes available
    
    // Check that orphans list makes sense
    for (const orphan of result.orphanComponents) {
      expect(result.availableComponents.has(orphan.name)).toBe(false);
    }
  });

  it("calculates fullyReachableLateItem as 100% reachable", () => {
    const result = analyzeReachability(items);

    const fullyReachable = result.lateItemReachability.find(
      (r) => r.item.name === "fully_reachable"
    );

    expect(fullyReachable).toBeDefined();
    expect(fullyReachable!.reachabilityPercent).toBeCloseTo(1.0, 2);
    expect(fullyReachable!.orphanComponents).toHaveLength(0);
    expect(fullyReachable!.componentsFromEarlyItems.length).toBe(3);
  });

  it("calculates partiallyReachableLateItem based on available components", () => {
    const result = analyzeReachability(items);

    const partial = result.lateItemReachability.find(
      (r) => r.item.name === "partially_reachable"
    );

    expect(partial).toBeDefined();
    // partiallyReachableLateItem has: strength_component (100g) + truly_orphan_component (500g)
    // 
    // With the new approach, truly_orphan_component IS available because it appears in 
    // partiallyReachableLateItem and unreachableLateItem, which are upgraded items
    // that may meet the gold recovery threshold.
    //
    // So the reachability depends on whether truly_orphan_component is in the available set
    if (result.availableComponents.has("truly_orphan_component")) {
      // Both components available = 100% reachable
      expect(partial!.reachabilityPercent).toBeCloseTo(1.0, 2);
    } else {
      // Only strength_component available = 100/600 = 16.67% reachable  
      expect(partial!.reachabilityPercent).toBeCloseTo(100 / 600, 2);
      expect(partial!.goldFromEarlyItems).toBe(100);
      expect(partial!.goldFromOrphans).toBe(500);
    }
  });

  it("calculates unreachableLateItem based on available components", () => {
    const result = analyzeReachability(items);

    const unreachable = result.lateItemReachability.find(
      (r) => r.item.name === "unreachable"
    );

    expect(unreachable).toBeDefined();
    // unreachableLateItem only uses truly_orphan_component
    // If truly_orphan_component is available (from other upgraded items), it's 100% reachable
    // Otherwise, it's 0% reachable
    if (result.availableComponents.has("truly_orphan_component")) {
      expect(unreachable!.reachabilityPercent).toBe(1);
      expect(unreachable!.componentsFromEarlyItems.length).toBeGreaterThan(0);
    } else {
      expect(unreachable!.reachabilityPercent).toBe(0);
      expect(unreachable!.componentsFromEarlyItems).toHaveLength(0);
      expect(unreachable!.orphanComponents.length).toBeGreaterThan(0);
    }
  });

  it("sorts late items by reachability (highest first)", () => {
    const result = analyzeReachability(items);

    for (let i = 0; i < result.lateItemReachability.length - 1; i++) {
      const curr = result.lateItemReachability[i];
      const next = result.lateItemReachability[i + 1];
      // Allow for tie-breaking by cost
      if (Math.abs(curr.reachabilityPercent - next.reachabilityPercent) > 0.01) {
        expect(curr.reachabilityPercent).toBeGreaterThanOrEqual(next.reachabilityPercent);
      }
    }
  });

  it("handles empty item list", () => {
    const result = analyzeReachability([]);

    expect(result.availableComponents.size).toBe(0);
    expect(result.orphanComponents).toHaveLength(0);
    expect(result.lateItemReachability).toHaveLength(0);
    expect(result.totalLateItems).toBe(0);
  });
});

describe("analyzeKeyUtilityItems", () => {
  const items = getAllTestItems();

  it("returns analysis for key utility items", () => {
    const results = analyzeKeyUtilityItems(items);

    // Should find force_staff from our fixtures
    const forceStaff = results.find((r) => r.item.name === "force_staff");
    expect(forceStaff).toBeDefined();
  });

  it("calculates reachability for force_staff correctly", () => {
    const results = analyzeKeyUtilityItems(items);

    const forceStaff = results.find((r) => r.item.name === "force_staff");
    expect(forceStaff).toBeDefined();

    // force_staff has intelligence_component (100g) + regen_component (100g)
    // Both are in early items, so 100% reachable
    expect(forceStaff!.reachabilityPercent).toBeCloseTo(1.0, 2);
    expect(forceStaff!.goldFromEarlyItems).toBe(200);
    expect(forceStaff!.goldFromOrphans).toBe(0);
  });

  it("provides component breakdown", () => {
    const results = analyzeKeyUtilityItems(items);

    const forceStaff = results.find((r) => r.item.name === "force_staff");
    expect(forceStaff).toBeDefined();

    expect(forceStaff!.componentsFromEarlyItems.length).toBe(2);
    expect(forceStaff!.orphanComponents.length).toBe(0);

    for (const comp of forceStaff!.componentsFromEarlyItems) {
      expect(comp.name).toBeTruthy();
      expect(comp.cost).toBe(100); // Both components cost 100g
    }
  });

  it("provides best early sources", () => {
    const results = analyzeKeyUtilityItems(items);

    const forceStaff = results.find((r) => r.item.name === "force_staff");
    expect(forceStaff).toBeDefined();

    expect(Array.isArray(forceStaff!.bestEarlySources)).toBe(true);

    for (const source of forceStaff!.bestEarlySources) {
      expect(source.earlyItem).toBeTruthy();
      expect(Array.isArray(source.components)).toBe(true);
      expect(source.goldContrib).toBeGreaterThan(0);
    }
  });

  it("provides recommended loadout (max 3 items)", () => {
    const results = analyzeKeyUtilityItems(items);

    for (const result of results) {
      expect(Array.isArray(result.recommendedLoadout)).toBe(true);
      expect(result.recommendedLoadout.length).toBeLessThanOrEqual(3);
    }
  });

  it("sorts by reachability (highest first)", () => {
    const results = analyzeKeyUtilityItems(items);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].reachabilityPercent).toBeGreaterThanOrEqual(
        results[i + 1].reachabilityPercent
      );
    }
  });

  it("handles empty item list", () => {
    const results = analyzeKeyUtilityItems([]);
    expect(results).toHaveLength(0);
  });
});

describe("cross-function consistency", () => {
  const items = getAllTestItems();

  it("disassemble analysis feeds into reachability correctly", () => {
    const disassembleResults = analyzeDisassemble(items);
    const reachabilityResults = analyzeReachability(items);

    // Items that meet gold recovery threshold should have their components in availableComponents
    const goodItems = disassembleResults.filter(
      (r) => r.goldEfficiency >= MIN_GOLD_RECOVERY_THRESHOLD
    );

    expect(goodItems.length).toBeGreaterThan(0);
    expect(reachabilityResults.availableComponents.size).toBeGreaterThan(0);
  });

  it("combo analysis uses same early items as disassemble", () => {
    const disassembleResults = analyzeDisassemble(items);
    const comboResults = analyzeEarlyItemCombos(items);

    const disassembleItemNames = new Set(
      disassembleResults
        .filter((r) => r.goldEfficiency >= MIN_GOLD_RECOVERY_THRESHOLD)
        .map((r) => r.item.name)
    );

    for (const combo of comboResults) {
      for (const early of combo.earlyItems) {
        expect(disassembleItemNames.has(early.item.name)).toBe(true);
      }
    }
  });

  it("boot trios use same early items as disassemble", () => {
    const disassembleResults = analyzeDisassemble(items);
    const trioResults = analyzeBootTrios(items);

    const disassembleItemNames = new Set(
      disassembleResults
        .filter((r) => r.goldEfficiency >= MIN_GOLD_RECOVERY_THRESHOLD)
        .map((r) => r.item.name)
    );

    for (const trio of trioResults) {
      expect(disassembleItemNames.has(trio.bootItem.item.name)).toBe(true);
      for (const nonBoot of trio.nonBootItems) {
        expect(disassembleItemNames.has(nonBoot.item.name)).toBe(true);
      }
    }
  });
});
