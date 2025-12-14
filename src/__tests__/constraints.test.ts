import { describe, it, expect } from "bun:test";
import {
  costIncreaseConstraint,
  minCostIncrease,
  minTotalRecovery,
  maxWastedGold,
  maxWastedPercent,
  minFinalItems,
  maxFinalItems,
  allConstraints,
  anyConstraint,
  notConstraint,
  finalMustContain,
  costIncreaseConstraintExplained,
  withExplanation,
} from "../calculators/constraints";
import { createLoadout, createTransition } from "../calculators/loadout";
import { ItemRepository } from "../data/ItemRepository";
import {
  getAllTestItems,
  perfectRecoveryItem,
  goodRecoveryItem,
  fullyReachableLateItem,
} from "./fixtures";

describe("constraint functions", () => {
  const items = getAllTestItems();
  const repo = new ItemRepository(items);

  // Helper to create test transitions
  const makeTransition = (fromItems: typeof perfectRecoveryItem[], toItems: typeof perfectRecoveryItem[]) => {
    const from = createLoadout(fromItems, repo);
    const to = createLoadout(toItems, repo);
    return createTransition(from, to, repo);
  };

  describe("costIncreaseConstraint", () => {
    it("returns true when final cost > initial cost", () => {
      const transition = makeTransition(
        [perfectRecoveryItem], // 200g
        [fullyReachableLateItem] // 3000g
      );

      expect(costIncreaseConstraint(transition)).toBe(true);
    });

    it("returns false when final cost <= initial cost", () => {
      const transition = makeTransition(
        [fullyReachableLateItem], // 3000g
        [perfectRecoveryItem] // 200g
      );

      expect(costIncreaseConstraint(transition)).toBe(false);
    });

    it("returns false when costs are equal", () => {
      const transition = makeTransition(
        [perfectRecoveryItem], // 200g
        [perfectRecoveryItem] // 200g
      );

      expect(costIncreaseConstraint(transition)).toBe(false);
    });
  });

  describe("minCostIncrease", () => {
    it("returns true when delta >= minimum", () => {
      const transition = makeTransition(
        [perfectRecoveryItem], // 200g
        [fullyReachableLateItem] // 3000g, delta = 2800
      );

      expect(minCostIncrease(1000)(transition)).toBe(true);
      expect(minCostIncrease(2800)(transition)).toBe(true);
    });

    it("returns false when delta < minimum", () => {
      const transition = makeTransition(
        [perfectRecoveryItem], // 200g
        [goodRecoveryItem] // 400g, delta = 200
      );

      expect(minCostIncrease(500)(transition)).toBe(false);
    });
  });

  describe("minTotalRecovery", () => {
    it("returns true when total recovery >= threshold", () => {
      // perfectRecoveryItem (str + agi, no recipe) -> goodRecoveryItem (str + int)
      // str is reused (100g), agi is wasted (100g), no recipe to recover
      // Total recovery = (100 + 0) / 200 = 50%
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );

      expect(minTotalRecovery(0.5)(transition)).toBe(true);
      expect(minTotalRecovery(0.4)(transition)).toBe(true);
    });

    it("returns false when total recovery < threshold", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );

      expect(minTotalRecovery(0.6)(transition)).toBe(false);
    });

    it("returns true for empty from loadout", () => {
      const from = createLoadout([], repo);
      const to = createLoadout([perfectRecoveryItem], repo);
      const transition = createTransition(from, to, repo);

      expect(minTotalRecovery(0.5)(transition)).toBe(true);
    });
  });

  describe("maxWastedGold", () => {
    it("returns true when wasted <= max", () => {
      const transition = makeTransition(
        [perfectRecoveryItem], // str(100) + agi(100)
        [goodRecoveryItem] // str(100) + int(100)
      );
      // Wasted: agi(100)

      expect(maxWastedGold(100)(transition)).toBe(true);
      expect(maxWastedGold(200)(transition)).toBe(true);
    });

    it("returns false when wasted > max", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );

      expect(maxWastedGold(50)(transition)).toBe(false);
    });
  });

  describe("maxWastedPercent", () => {
    it("returns true when waste percent <= max", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );
      // 100g wasted out of 200g = 50%

      expect(maxWastedPercent(0.5)(transition)).toBe(true);
    });

    it("returns false when waste percent > max", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );

      expect(maxWastedPercent(0.4)(transition)).toBe(false);
    });
  });

  describe("item count constraints", () => {
    it("minFinalItems checks final loadout size", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem, fullyReachableLateItem]
      );

      expect(minFinalItems(2)(transition)).toBe(true);
      expect(minFinalItems(3)(transition)).toBe(false);
    });

    it("maxFinalItems checks final loadout size", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem, fullyReachableLateItem]
      );

      expect(maxFinalItems(2)(transition)).toBe(true);
      expect(maxFinalItems(1)(transition)).toBe(false);
    });
  });

  describe("finalMustContain", () => {
    it("returns true when item is in final loadout", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [fullyReachableLateItem]
      );

      expect(finalMustContain("fully_reachable")(transition)).toBe(true);
      expect(finalMustContain("Fully Reachable Late Item")(transition)).toBe(true);
    });

    it("returns false when item is not in final loadout", () => {
      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );

      expect(finalMustContain("fully_reachable")(transition)).toBe(false);
    });
  });

  describe("constraint combinators", () => {
    it("allConstraints requires all to pass", () => {
      const combined = allConstraints(
        costIncreaseConstraint,
        minFinalItems(1)
      );

      const validTransition = makeTransition(
        [perfectRecoveryItem],
        [fullyReachableLateItem]
      );
      expect(combined(validTransition)).toBe(true);

      const invalidTransition = makeTransition(
        [fullyReachableLateItem],
        [perfectRecoveryItem]
      );
      expect(combined(invalidTransition)).toBe(false);
    });

    it("anyConstraint requires at least one to pass", () => {
      const combined = anyConstraint(
        minCostIncrease(10000), // Will fail
        minFinalItems(1) // Will pass
      );

      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem]
      );
      expect(combined(transition)).toBe(true);
    });

    it("notConstraint negates result", () => {
      const noCostIncrease = notConstraint(costIncreaseConstraint);

      const downgrade = makeTransition(
        [fullyReachableLateItem],
        [perfectRecoveryItem]
      );
      expect(noCostIncrease(downgrade)).toBe(true);
    });
  });

  describe("explained constraints", () => {
    it("costIncreaseConstraintExplained provides reason on failure", () => {
      const transition = makeTransition(
        [fullyReachableLateItem],
        [perfectRecoveryItem]
      );

      const result = costIncreaseConstraintExplained(transition);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain("must exceed");
    });

    it("withExplanation wraps constraint with custom reason", () => {
      const explained = withExplanation(
        minCostIncrease(1000),
        (t) => `Need at least 1000g increase, got ${t.costDelta}g`
      );

      const transition = makeTransition(
        [perfectRecoveryItem],
        [goodRecoveryItem] // delta = 200
      );

      const result = explained(transition);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain("200g");
    });
  });
});
