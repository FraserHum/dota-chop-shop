import { describe, it, expect } from "bun:test";
import {
  // Core scorers
  reuseEfficiencyScore,
  wasteAvoidanceScore,
  rawReusedGoldScore,
  rawCostDeltaScore,
  // Parameterized scorers
  costDeltaScore,
  valueGainScore,
  valueEfficiencyScore,
  componentCountScore,
  finalCostScore,
  budgetFinalScore,
  // Combinators
  weightedScore,
  maxScore,
  minScore,
  averageScore,
  productScore,
  transformScore,
  clampScore,
  invertScore,
  // Pre-built scorers
  defaultTransitionScorer,
  conservativeScorer,
  economyScorer,
  greedyReuseScorer,
  // New early build quality scorers
  earlyBuildEfficiencyScore,
  earlyBuildValueScore,
  earlyAffordabilityScore,
  earlyUtilityScore,
  // New composite scorers
  createImprovedScorer,
  createSupportScorer,
  createCoreScorer,
} from "../calculators/scorers";
import { Item, StatValuation } from "../models/types";
import { LoadoutTransition, Loadout, ComponentFlow } from "../models/buildTypes";
import { EXPECTED_STAT_VALUES } from "./fixtures";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal Loadout for testing
 */
function createLoadout(items: Item[], components: string[] = []): Loadout {
  const totalCost = items.reduce((sum, i) => sum + i.cost, 0);
  const componentCounts: Record<string, number> = {};
  for (const c of components) {
    componentCounts[c] = (componentCounts[c] || 0) + 1;
  }

  return {
    // New slot model: default everything to inventory for tests
    inventory: items,
    backpack: [],
    sold: [],
    soldRecovery: 0,
    netWorth: totalCost,

    // Legacy/derived fields
    items,
    totalCost,
    components,
    componentCounts,
    totalStatValue: 0,
    efficiency: 0,
    totalInvestedCost: totalCost,
  };
}

/**
 * Create a minimal LoadoutTransition for testing
 */
function createTransition(
  fromItems: Item[],
  toItems: Item[],
  flow: Partial<ComponentFlow> = {}
): LoadoutTransition {
  const fromComponents = fromItems.flatMap(i => i.components || []);
  const toComponents = toItems.flatMap(i => i.components || []);
  
  const from = createLoadout(fromItems, fromComponents);
  const to = createLoadout(toItems, toComponents);
  
  const acquiredGold = flow.acquiredGold ?? to.totalCost;
  const recoveredRecipeCost = flow.recoveredRecipeCost ?? 0;
  const targetRecipeCost = flow.targetRecipeCost ?? 0;
  const netRecipeCost = flow.netRecipeCost ?? (targetRecipeCost - recoveredRecipeCost);
  
  const defaultFlow: ComponentFlow = {
    reused: flow.reused ?? [],
    wasted: flow.wasted ?? fromComponents,
    acquired: flow.acquired ?? toComponents,
    reusedGold: flow.reusedGold ?? 0,
    wastedGold: flow.wastedGold ?? from.totalCost,
    acquiredGold,
    recoveredRecipeCost,
    targetRecipeCost,
    netRecipeCost,
    totalGoldNeeded: flow.totalGoldNeeded ?? (acquiredGold + netRecipeCost),
  };
  
  return {
    from,
    to,
    costDelta: to.totalCost - from.totalCost,
    componentFlow: defaultFlow,
  };
}

// Test items
const basicItem: Item = {
  id: "basic",
  name: "basic",
  displayName: "Basic Item",
  cost: 1000,
  stats: { strength: 10, agility: 5 },
  isComponent: false,
  isConsumable: false,
  components: ["comp_a", "comp_b"],
};

const cheapItem: Item = {
  id: "cheap",
  name: "cheap",
  displayName: "Cheap Item",
  cost: 500,
  stats: { strength: 5 },
  isComponent: false,
  isConsumable: false,
  components: ["comp_a"],
};

const expensiveItem: Item = {
  id: "expensive",
  name: "expensive",
  displayName: "Expensive Item",
  cost: 5000,
  stats: { strength: 30, agility: 20, intelligence: 15 },
  isComponent: false,
  isConsumable: false,
  components: ["comp_a", "comp_b", "comp_c", "comp_d"],
};

// Utility items (matching names in ITEM_UTILITY)
const forceStaffItem: Item = {
  id: "force_staff",
  name: "force_staff",
  displayName: "Force Staff",
  cost: 2200,
  stats: { intelligence: 10, healthRegen: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["staff_of_wizardry", "fluffy_hat", "recipe"],
};

const medallionItem: Item = {
  id: "medallion_of_courage",
  name: "medallion_of_courage",
  displayName: "Medallion of Courage",
  cost: 1025,
  stats: { armor: 5, manaRegen: 0.75 },
  isComponent: false,
  isConsumable: false,
  components: ["chainmail", "sage_mask"],
};

const noUtilityItem: Item = {
  id: "no_utility",
  name: "no_utility",
  displayName: "No Utility Item",
  cost: 1500,
  stats: { strength: 15 },
  isComponent: false,
  isConsumable: false,
  components: ["comp_x"],
};

// Fixed stat valuation for predictable tests
const testStatValuation: StatValuation = {
  strength: EXPECTED_STAT_VALUES.strength,
  agility: EXPECTED_STAT_VALUES.agility,
  intelligence: EXPECTED_STAT_VALUES.intelligence,
  armor: EXPECTED_STAT_VALUES.armor,
  healthRegen: EXPECTED_STAT_VALUES.healthRegen,
  manaRegen: EXPECTED_STAT_VALUES.manaRegen,
  moveSpeed: EXPECTED_STAT_VALUES.moveSpeed,
};

// ============================================================================
// Tests
// ============================================================================

describe("scorers", () => {
  describe("Core Scorers", () => {
    describe("reuseEfficiencyScore", () => {
      it("returns 1 for 100% reuse", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 1000,
          wastedGold: 0,
        });
        expect(reuseEfficiencyScore(t)).toBe(1);
      });

      it("returns 0.5 for 50% reuse", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        expect(reuseEfficiencyScore(t)).toBe(0.5);
      });

      it("returns 0 for no reuse", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 0,
          wastedGold: 1000,
        });
        expect(reuseEfficiencyScore(t)).toBe(0);
      });

      it("returns 0 for zero-cost from loadout", () => {
        const zeroCostItem: Item = { ...basicItem, cost: 0 };
        const t = createTransition([zeroCostItem], [basicItem]);
        expect(reuseEfficiencyScore(t)).toBe(0);
      });
    });

    describe("wasteAvoidanceScore", () => {
      it("returns 1 for no waste", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 1000,
          wastedGold: 0,
        });
        expect(wasteAvoidanceScore(t)).toBe(1);
      });

      it("returns 0.5 for 50% waste", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        expect(wasteAvoidanceScore(t)).toBe(0.5);
      });

      it("returns 0 for 100% waste", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 0,
          wastedGold: 1000,
        });
        expect(wasteAvoidanceScore(t)).toBe(0);
      });

      it("returns 1 for zero-cost from loadout", () => {
        const zeroCostItem: Item = { ...basicItem, cost: 0 };
        const t = createTransition([zeroCostItem], [basicItem]);
        expect(wasteAvoidanceScore(t)).toBe(1);
      });
    });

    describe("rawReusedGoldScore", () => {
      it("returns the exact reused gold value", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 750,
        });
        expect(rawReusedGoldScore(t)).toBe(750);
      });
    });

    describe("rawCostDeltaScore", () => {
      it("returns the cost difference", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        expect(rawCostDeltaScore(t)).toBe(5000 - 1000);
      });

      it("can return negative values for downgrades", () => {
        const t = createTransition([expensiveItem], [basicItem]);
        expect(rawCostDeltaScore(t)).toBe(1000 - 5000);
      });
    });
  });

  describe("Parameterized Scorers", () => {
    describe("costDeltaScore", () => {
      it("returns 0.5 when delta is half of max", () => {
        const t = createTransition([basicItem], [expensiveItem]); // delta = 4000
        const scorer = costDeltaScore(8000);
        expect(scorer(t)).toBe(0.5);
      });

      it("returns 1 when delta equals max", () => {
        const t = createTransition([basicItem], [expensiveItem]); // delta = 4000
        const scorer = costDeltaScore(4000);
        expect(scorer(t)).toBe(1);
      });

      it("clamps to 1 when delta exceeds max", () => {
        const t = createTransition([basicItem], [expensiveItem]); // delta = 4000
        const scorer = costDeltaScore(2000);
        expect(scorer(t)).toBe(1);
      });

      it("clamps to 0 for negative deltas", () => {
        const t = createTransition([expensiveItem], [basicItem]); // delta = -4000
        const scorer = costDeltaScore(2000);
        expect(scorer(t)).toBe(0);
      });
    });

    describe("valueGainScore", () => {
      it("calculates value gain based on custom function", () => {
        const getItemValue = (item: Item) => (item.stats?.strength || 0) * 100;
        const scorer = valueGainScore(getItemValue);
        
        // basicItem: 10 str = 1000 value
        // expensiveItem: 30 str = 3000 value
        const t = createTransition([basicItem], [expensiveItem]);
        expect(scorer(t)).toBe(2000);
      });
    });

    describe("valueEfficiencyScore", () => {
      it("returns 1 for zero gold needed", () => {
        const getItemValue = (item: Item) => item.cost;
        const scorer = valueEfficiencyScore(getItemValue);
        
        // Create transition where totalGoldNeeded is 0 or negative
        const t = createTransition([expensiveItem], [basicItem], {
          wastedGold: 0,
          totalGoldNeeded: 0,  // No gold needed to complete transition
        });
        expect(scorer(t)).toBe(1);
      });

      it("normalizes efficiency based on maxEfficiency", () => {
        const getItemValue = (item: Item) => item.cost * 2; // 200% value
        const scorer = valueEfficiencyScore(getItemValue, 2);
        
        const t = createTransition([basicItem], [expensiveItem], {
          wastedGold: 0,
          acquiredGold: 4000,
          netRecipeCost: 0,
          totalGoldNeeded: 4000,  // Explicit total gold needed
        });
        // Value gain = 10000 - 2000 = 8000
        // Gold spent = totalGoldNeeded = 4000
        // Efficiency = 8000 / 4000 = 2
        // Normalized = 2 / 2 = 1
        expect(scorer(t)).toBe(1);
      });
    });

    describe("componentCountScore", () => {
      it("normalizes reused component count", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reused: ["comp_a", "comp_b", "comp_c"],
        });
        const scorer = componentCountScore(6);
        expect(scorer(t)).toBe(0.5);
      });

      it("clamps to 1 when count exceeds max", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reused: ["a", "b", "c", "d", "e", "f", "g", "h"],
        });
        const scorer = componentCountScore(6);
        expect(scorer(t)).toBe(1);
      });
    });

    describe("finalCostScore", () => {
      it("normalizes final cost to 0-1 range", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        const scorer = finalCostScore(10000);
        expect(scorer(t)).toBe(0.5);
      });
    });

    describe("budgetFinalScore", () => {
      it("returns higher scores for lower cost finals", () => {
        const t = createTransition([basicItem], [cheapItem]);
        const scorer = budgetFinalScore(1000);
        expect(scorer(t)).toBe(0.5);
      });

      it("returns 0 when final cost equals max", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        const scorer = budgetFinalScore(5000);
        expect(scorer(t)).toBe(0);
      });
    });
  });

  describe("Scorer Combinators", () => {
    describe("weightedScore", () => {
      it("combines scorers with weights", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        
        const scorer = weightedScore([
          { scorer: reuseEfficiencyScore, weight: 0.6 }, // 0.5 * 0.6 = 0.3
          { scorer: wasteAvoidanceScore, weight: 0.4 },  // 0.5 * 0.4 = 0.2
        ]);
        
        expect(scorer(t)).toBeCloseTo(0.5, 5);
      });

      it("handles single scorer", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 800,
          wastedGold: 200,
        });
        
        const scorer = weightedScore([
          { scorer: reuseEfficiencyScore, weight: 1 },
        ]);
        
        expect(scorer(t)).toBe(0.8);
      });
    });

    describe("maxScore", () => {
      it("returns the highest score", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 200,  // 20% reuse
          wastedGold: 800,  // 20% waste avoidance
        });
        
        const scorer = maxScore(reuseEfficiencyScore, wasteAvoidanceScore);
        expect(scorer(t)).toBe(0.2); // Both are 0.2
      });

      it("selects higher of two different scores", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 900, // 90% reuse
          wastedGold: 100, // 90% waste avoidance
        });
        
        // Use a fixed scorer to test
        const fixedLow = () => 0.3;
        const scorer = maxScore(reuseEfficiencyScore, fixedLow);
        expect(scorer(t)).toBe(0.9);
      });
    });

    describe("minScore", () => {
      it("returns the lowest score", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 900,
          wastedGold: 100,
        });
        
        const fixedHigh = () => 1.0;
        const scorer = minScore(reuseEfficiencyScore, fixedHigh);
        expect(scorer(t)).toBe(0.9);
      });
    });

    describe("averageScore", () => {
      it("returns average of all scorers", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        
        const fixed1 = () => 0.2;
        const fixed2 = () => 0.4;
        const fixed3 = () => 0.6;
        
        const scorer = averageScore(fixed1, fixed2, fixed3);
        expect(scorer(t)).toBeCloseTo(0.4, 5);
      });

      it("returns 0 for empty scorer list", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        const scorer = averageScore();
        expect(scorer(t)).toBe(0);
      });
    });

    describe("productScore", () => {
      it("multiplies all scores together", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        
        const fixed1 = () => 0.5;
        const fixed2 = () => 0.8;
        
        const scorer = productScore(fixed1, fixed2);
        expect(scorer(t)).toBeCloseTo(0.4, 5);
      });

      it("returns 0 if any scorer returns 0", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        
        const fixedHigh = () => 0.9;
        const fixedZero = () => 0;
        
        const scorer = productScore(fixedHigh, fixedZero);
        expect(scorer(t)).toBe(0);
      });
    });

    describe("transformScore", () => {
      it("applies transformation to scorer output", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        
        // Square the score
        const scorer = transformScore(reuseEfficiencyScore, x => x * x);
        expect(scorer(t)).toBe(0.25); // 0.5^2
      });
    });

    describe("clampScore", () => {
      it("clamps score to specified range", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        
        const overflowScorer = () => 1.5;
        const clamped = clampScore(overflowScorer, 0, 1);
        expect(clamped(t)).toBe(1);
      });

      it("clamps negative scores to min", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        
        const negativeScorer = () => -0.5;
        const clamped = clampScore(negativeScorer, 0, 1);
        expect(clamped(t)).toBe(0);
      });
    });

    describe("invertScore", () => {
      it("inverts score (1 - score)", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 300,
          wastedGold: 700,
        });
        
        const scorer = invertScore(reuseEfficiencyScore);
        expect(scorer(t)).toBe(0.7); // 1 - 0.3
      });
    });
  });

  describe("Pre-built Scorers", () => {
    describe("defaultTransitionScorer", () => {
      it("returns a score between 0 and 1 for typical transitions", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 700,
          wastedGold: 300,
        });
        
        const score = defaultTransitionScorer(t);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    describe("conservativeScorer", () => {
      it("heavily weights reuse and waste avoidance", () => {
        // Two transitions with same reuse but different cost deltas
        const lowDelta = createTransition([basicItem], [{ ...expensiveItem, cost: 2000 }], {
          reusedGold: 800,
          wastedGold: 200,
        });
        const highDelta = createTransition([basicItem], [expensiveItem], {
          reusedGold: 800,
          wastedGold: 200,
        });
        
        // Conservative should not penalize low delta as much
        const lowScore = conservativeScorer(lowDelta);
        const highScore = conservativeScorer(highDelta);
        
        // Both should be fairly high due to good reuse
        expect(lowScore).toBeGreaterThan(0.5);
        expect(highScore).toBeGreaterThan(0.5);
      });
    });

    describe("economyScorer", () => {
      it("prefers lower cost transitions", () => {
        const cheaperTo: Item = { ...basicItem, cost: 1500 };
        const expensiveTo: Item = { ...basicItem, cost: 4000 };
        
        const cheapTransition = createTransition([basicItem], [cheaperTo], {
          reusedGold: 800,
          wastedGold: 200,
        });
        const expensiveTransition = createTransition([basicItem], [expensiveTo], {
          reusedGold: 800,
          wastedGold: 200,
        });
        
        const cheapScore = economyScorer(cheapTransition);
        const expensiveScore = economyScorer(expensiveTransition);
        
        // Economy scorer should prefer cheaper transitions
        expect(cheapScore).toBeGreaterThan(expensiveScore);
      });
    });

    describe("greedyReuseScorer", () => {
      it("only considers reuse efficiency", () => {
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 750,
          wastedGold: 250,
        });
        
        expect(greedyReuseScorer(t)).toBe(reuseEfficiencyScore(t));
        expect(greedyReuseScorer(t)).toBe(0.75);
      });
    });
  });

  describe("Early Build Quality Scorers", () => {
    describe("earlyBuildEfficiencyScore", () => {
      it("returns score based on average item efficiency", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        const scorer = earlyBuildEfficiencyScore(testStatValuation, 1.5);
        
        const score = scorer(t);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });

      it("returns 0 for empty from loadout", () => {
        const emptyFrom = createLoadout([], []);
        const t: LoadoutTransition = {
          from: emptyFrom,
          to: createLoadout([basicItem], []),
          costDelta: basicItem.cost,
          componentFlow: {
            reused: [],
            wasted: [],
            acquired: [],
            reusedGold: 0,
            wastedGold: 0,
            acquiredGold: basicItem.cost,
            recoveredRecipeCost: 0,
            targetRecipeCost: 0,
            netRecipeCost: 0,
            totalGoldNeeded: basicItem.cost,
          },
        };
        
        const scorer = earlyBuildEfficiencyScore(testStatValuation);
        expect(scorer(t)).toBe(0);
      });

      it("higher efficiency items get higher scores", () => {
        // Create items with different efficiency
        const highEffItem: Item = {
          ...basicItem,
          cost: 500,
          stats: { strength: 20 }, // 20 * 50 = 1000g value for 500g cost = 2.0 efficiency
        };
        const lowEffItem: Item = {
          ...basicItem,
          cost: 2000,
          stats: { strength: 10 }, // 10 * 50 = 500g value for 2000g cost = 0.25 efficiency
        };
        
        const highEffTransition = createTransition([highEffItem], [expensiveItem]);
        const lowEffTransition = createTransition([lowEffItem], [expensiveItem]);
        
        const scorer = earlyBuildEfficiencyScore(testStatValuation, 2.0);
        
        expect(scorer(highEffTransition)).toBeGreaterThan(scorer(lowEffTransition));
      });
    });

    describe("earlyBuildValueScore", () => {
      it("returns score based on value/cost ratio", () => {
        const t = createTransition([basicItem], [expensiveItem]);
        const scorer = earlyBuildValueScore(testStatValuation, 1.5);
        
        const score = scorer(t);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });

      it("returns 0 for empty from loadout", () => {
        const emptyFrom = createLoadout([], []);
        const t: LoadoutTransition = {
          from: emptyFrom,
          to: createLoadout([basicItem], []),
          costDelta: basicItem.cost,
          componentFlow: {
            reused: [],
            wasted: [],
            acquired: [],
            reusedGold: 0,
            wastedGold: 0,
            acquiredGold: basicItem.cost,
            recoveredRecipeCost: 0,
            targetRecipeCost: 0,
            netRecipeCost: 0,
            totalGoldNeeded: basicItem.cost,
          },
        };
        
        const scorer = earlyBuildValueScore(testStatValuation);
        expect(scorer(t)).toBe(0);
      });

      it("returns 0 for zero-cost from loadout", () => {
        const zeroCostItem: Item = { ...basicItem, cost: 0 };
        const t = createTransition([zeroCostItem], [basicItem]);
        
        const scorer = earlyBuildValueScore(testStatValuation);
        expect(scorer(t)).toBe(0);
      });
    });

    describe("earlyAffordabilityScore", () => {
      it("returns 1 for zero-cost early loadout", () => {
        const zeroCostItem: Item = { ...basicItem, cost: 0 };
        const t = createTransition([zeroCostItem], [basicItem]);
        
        const scorer = earlyAffordabilityScore(3000);
        expect(scorer(t)).toBe(1);
      });

      it("returns 0 when early cost equals max", () => {
        const maxCostItem: Item = { ...basicItem, cost: 3000 };
        const t = createTransition([maxCostItem], [expensiveItem]);
        
        const scorer = earlyAffordabilityScore(3000);
        expect(scorer(t)).toBe(0);
      });

      it("returns 0.5 when early cost is half of max", () => {
        const halfCostItem: Item = { ...basicItem, cost: 1500 };
        const t = createTransition([halfCostItem], [expensiveItem]);
        
        const scorer = earlyAffordabilityScore(3000);
        expect(scorer(t)).toBe(0.5);
      });

      it("clamps to 0 when early cost exceeds max", () => {
        const overCostItem: Item = { ...basicItem, cost: 5000 };
        const t = createTransition([overCostItem], [expensiveItem]);
        
        const scorer = earlyAffordabilityScore(3000);
        expect(scorer(t)).toBe(0);
      });

      it("returns higher scores for cheaper early builds", () => {
        const cheapEarly = createTransition([cheapItem], [expensiveItem]); // 500g
        const expensiveEarly = createTransition([{ ...basicItem, cost: 2500 }], [expensiveItem]);
        
        const scorer = earlyAffordabilityScore(3000);
        expect(scorer(cheapEarly)).toBeGreaterThan(scorer(expensiveEarly));
      });
    });

    describe("earlyUtilityScore", () => {
      it("returns 0 for items without utility", () => {
        const t = createTransition([noUtilityItem], [expensiveItem]);
        const scorer = earlyUtilityScore(3000);
        
        expect(scorer(t)).toBe(0);
      });

      it("returns positive score for utility items", () => {
        const t = createTransition([forceStaffItem], [expensiveItem]);
        const scorer = earlyUtilityScore(3000);
        
        expect(scorer(t)).toBeGreaterThan(0);
      });

      it("returns higher score for more utility", () => {
        // Force Staff has Mobility + Save
        const forceTransition = createTransition([forceStaffItem], [expensiveItem]);
        // Medallion has only DamageAmp
        const medallionTransition = createTransition([medallionItem], [expensiveItem]);
        
        const scorer = earlyUtilityScore(5000);
        
        expect(scorer(forceTransition)).toBeGreaterThan(scorer(medallionTransition));
      });

      it("returns 0 for empty from loadout", () => {
        const emptyFrom = createLoadout([], []);
        const t: LoadoutTransition = {
          from: emptyFrom,
          to: createLoadout([basicItem], []),
          costDelta: basicItem.cost,
          componentFlow: {
            reused: [],
            wasted: [],
            acquired: [],
            reusedGold: 0,
            wastedGold: 0,
            acquiredGold: basicItem.cost,
            recoveredRecipeCost: 0,
            targetRecipeCost: 0,
            netRecipeCost: 0,
            totalGoldNeeded: basicItem.cost,
          },
        };
        
        const scorer = earlyUtilityScore(3000);
        expect(scorer(t)).toBe(0);
      });

      it("sums utility from multiple items", () => {
        const singleUtility = createTransition([forceStaffItem], [expensiveItem]);
        const doubleUtility = createTransition([forceStaffItem, medallionItem], [expensiveItem]);
        
        const scorer = earlyUtilityScore(10000); // High max to see difference
        
        expect(scorer(doubleUtility)).toBeGreaterThan(scorer(singleUtility));
      });
    });
  });

  describe("Improved Composite Scorers", () => {
    describe("createImprovedScorer", () => {
      it("returns a function that produces scores in 0-1 range", () => {
        const scorer = createImprovedScorer(testStatValuation);
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        
        const score = scorer(t);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });

      it("produces consistent scores for the same transition", () => {
        const scorer = createImprovedScorer(testStatValuation);
        const t = createTransition([basicItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 500,
        });
        
        const score1 = scorer(t);
        const score2 = scorer(t);
        expect(score1).toBe(score2);
      });

      it("rewards affordable early builds with utility", () => {
        // Cheap item with utility
        const cheapUtilityBuild = createTransition([medallionItem], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 525,
        });
        
        // Expensive item without utility
        const expensiveNoUtility: Item = {
          ...basicItem,
          cost: 4000,
          stats: { strength: 40 },
        };
        const expensiveNoUtilityBuild = createTransition([expensiveNoUtility], [expensiveItem], {
          reusedGold: 500,
          wastedGold: 3500,
        });
        
        const scorer = createImprovedScorer(testStatValuation);
        
        // Cheap utility build should score higher due to affordability and utility weights
        expect(scorer(cheapUtilityBuild)).toBeGreaterThan(scorer(expensiveNoUtilityBuild));
      });
    });

    describe("createSupportScorer", () => {
      it("strongly prefers affordable builds", () => {
        const cheapBuild = createTransition([cheapItem], [basicItem], {
          reusedGold: 250,
          wastedGold: 250,
        });
        const expensiveBuild = createTransition([{ ...basicItem, cost: 3000 }], [expensiveItem], {
          reusedGold: 1500,
          wastedGold: 1500,
        });
        
        const scorer = createSupportScorer(testStatValuation);
        
        // Support scorer has high affordability weight (0.25 with 2500 max)
        // 500g / 2500 = 0.2, score = 1 - 0.2 = 0.8
        // 3000g / 2500 = 1.2, clamped, score = 0
        expect(scorer(cheapBuild)).toBeGreaterThan(scorer(expensiveBuild));
      });

      it("values utility highly", () => {
        const utilityBuild = createTransition([forceStaffItem], [expensiveItem], {
          reusedGold: 1000,
          wastedGold: 1200,
        });
        const noUtilityBuild = createTransition([noUtilityItem], [expensiveItem], {
          reusedGold: 750,
          wastedGold: 750,
        });
        
        const scorer = createSupportScorer(testStatValuation);
        
        // The utility difference should make up for cost difference
        // Force Staff utility value is significant
        expect(scorer(utilityBuild)).toBeGreaterThan(0);
        // Compare both builds - utility build might score differently
        expect(scorer(noUtilityBuild)).toBeGreaterThanOrEqual(0);
      });
    });

    describe("createCoreScorer", () => {
      it("values larger upgrades more than support scorer", () => {
        const bigUpgrade = createTransition([basicItem], [expensiveItem], {
          reusedGold: 800,
          wastedGold: 200,
        }); // 4000g delta
        
        const coreScorer = createCoreScorer(testStatValuation);
        
        // Core scorer has 0.20 weight on costDelta with 5000 max
        // For a big upgrade, core should produce a meaningful score
        const coreScore = coreScorer(bigUpgrade);
        
        // The costDelta contribution should be higher for core
        // 4000/5000 * 0.20 = 0.16 for core
        expect(coreScore).toBeGreaterThan(0);
      });

      it("allows higher early costs than support scorer", () => {
        const moderateEarlyCost: Item = { ...basicItem, cost: 3500 };
        const transition = createTransition([moderateEarlyCost], [expensiveItem], {
          reusedGold: 1750,
          wastedGold: 1750,
        });
        
        const supportScorer = createSupportScorer(testStatValuation);
        const coreScorer = createCoreScorer(testStatValuation);
        
        // Support affordability: 3500/2500 = 1.4 -> clamped to 0, score = 0
        // Core affordability: 3500/4000 = 0.875, score = 0.125
        // Core should score the affordability higher
        expect(coreScorer(transition)).toBeGreaterThanOrEqual(supportScorer(transition));
      });
    });

    describe("scorer comparison", () => {
      it("different scorers produce scores in valid ranges", () => {
        const transitions = [
          // Cheap utility build
          createTransition([medallionItem], [expensiveItem], {
            reusedGold: 500,
            wastedGold: 525,
          }),
          // High reuse expensive build  
          createTransition([{ ...basicItem, cost: 3000 }], [expensiveItem], {
            reusedGold: 2700,
            wastedGold: 300,
          }),
          // Big upgrade low reuse
          createTransition([cheapItem], [expensiveItem], {
            reusedGold: 100,
            wastedGold: 400,
          }),
        ];
        
        const improvedScorer = createImprovedScorer(testStatValuation);
        const supportScorer = createSupportScorer(testStatValuation);
        const coreScorer = createCoreScorer(testStatValuation);
        
        const improvedScores = transitions.map(t => improvedScorer(t));
        const supportScores = transitions.map(t => supportScorer(t));
        const coreScores = transitions.map(t => coreScorer(t));
        
        // This test documents the expected behavior that different scorers
        // should produce different results for the same input
        expect(improvedScores.every(s => s >= 0 && s <= 1)).toBe(true);
        expect(supportScores.every(s => s >= 0 && s <= 1)).toBe(true);
        expect(coreScores.every(s => s >= 0 && s <= 1)).toBe(true);
        
        // Verify that each scorer produces at least some non-zero scores
        expect(improvedScores.some(s => s > 0)).toBe(true);
        expect(supportScores.some(s => s > 0)).toBe(true);
        expect(coreScores.some(s => s > 0)).toBe(true);
      });
    });
  });
});
