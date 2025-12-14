import { fetchItemsFromAPI } from "./data/fetchItems";
import { ItemRepository } from "./data/ItemRepository";
import { calculateStatValuation } from "./calculators/statValuation";
import { getItemsByEfficiency, getItemsByValueSplit } from "./calculators/efficiency";
import { analyzeDisassemble, analyzeReachability, analyzeKeyUtilityItems } from "./calculators/upgradePaths";
import { analyzePairTransitions, analyzeTrioTransitions } from "./calculators/buildAnalysis";
import { formatEfficiencyTable, formatStatValuations, formatValueRankingTable, formatDisassembleTable, formatDisassembleDetails, formatReachabilitySummary, formatOrphanComponents, formatReachabilityTable, formatReachabilityDetails, formatKeyUtilityTable, formatKeyUtilityItems, formatTransitionsTable, formatTransitionsDetails, formatTransitionsSummary } from "./output/display";
import { DEFAULT_CONFIG } from "./config/analysisConfig";

async function main() {
  console.log("Dota 2 Item Cost Efficiency Calculator");
  console.log("======================================\n");

  console.log("Fetching item data from OpenDota API...");
  
  try {
    const allItems = await fetchItemsFromAPI();
    
    // Filter out consumables
    const items = allItems.filter((item) => !item.isConsumable);
    console.log(`Loaded ${items.length} items.\n`);

    // Create shared ItemRepository for all analyses (memoizes expensive computations)
    const itemRepo = new ItemRepository(items);
    const config = DEFAULT_CONFIG;

    // Calculate and display stat valuations
    const statValuation = calculateStatValuation(items);
    console.log("Stat Valuations (Gold per Point):\n");
    console.log(formatStatValuations(statValuation));
    console.log("\n");

    // Calculate and display item efficiency rankings
    const results = getItemsByEfficiency(items);
    console.log("Item Efficiency Rankings:\n");
    console.log(formatEfficiencyTable(results));
    console.log("\n");

    // Calculate and display value rankings (efficiency + cost) split by item type
    const { simpleItems, upgradedItems } = getItemsByValueSplit(items);
    
    console.log("Simple Items - Value Rankings (Efficiency + Low Cost):\n");
    console.log(formatValueRankingTable(simpleItems));
    console.log("\n");
    
    console.log("Upgraded Items - Value Rankings (Efficiency + Low Cost):\n");
    console.log(formatValueRankingTable(upgradedItems));
    console.log("\n");

    // Analyze Gyrocopter disassemble options (pass shared itemRepo)
    const disassembleAnalysis = analyzeDisassemble(items, config, itemRepo);
    console.log("Gyrocopter Disassemble Analysis (Early Items by Gold Recovery %):\n");
    console.log(formatDisassembleTable(disassembleAnalysis));
    console.log("\n");
    console.log("Top Disassemble Item Details:\n");
    console.log(formatDisassembleDetails(disassembleAnalysis, 5));

    // ============================================================================
    // BUILD TRANSITION ANALYSIS (New Functional Pipeline)
    // Shows COMPLETE final builds, not just upgrade targets
    // ============================================================================
    
    console.log("=".repeat(60));
    console.log("BUILD TRANSITIONS - PAIR ANALYSIS (2 Early → 2 Final)");
    console.log("=".repeat(60));
    console.log("\n");
    
    // Analyze 2-item to 2-item transitions (pass statValuation for improved scoring)
    const pairTransitions = analyzePairTransitions(items, config, itemRepo, statValuation);
    console.log(formatTransitionsSummary(pairTransitions));
    console.log("\n");
    console.log("Top Pair Transitions:\n");
    console.log(formatTransitionsTable(pairTransitions, 15));
    console.log("\n");
    console.log("Detailed Pair Transitions:\n");
    console.log(formatTransitionsDetails(pairTransitions, 5));
    
    console.log("=".repeat(60));
    console.log("BUILD TRANSITIONS - TRIO ANALYSIS (3 Early → 3 Final)");
    console.log("=".repeat(60));
    console.log("\n");
    
    // Analyze 3-item to 3-item transitions (pass statValuation for improved scoring)
    const trioTransitions = analyzeTrioTransitions(items, config, itemRepo, statValuation);
    console.log(formatTransitionsSummary(trioTransitions));
    console.log("\n");
    console.log("Top Trio Transitions:\n");
    console.log(formatTransitionsTable(trioTransitions, 15));
    console.log("\n");
    console.log("Detailed Trio Transitions:\n");
    console.log(formatTransitionsDetails(trioTransitions, 5));

    // Analyze late-game item reachability (pass shared itemRepo)
    const reachability = analyzeReachability(items, config, itemRepo);
    console.log("\n");
    console.log("=".repeat(60));
    console.log("LATE-GAME REACHABILITY ANALYSIS");
    console.log("=".repeat(60));
    console.log("\n");
    console.log(formatReachabilitySummary(reachability));
    console.log("\n");
    
    // Key utility items analysis - most important section! (pass shared itemRepo)
    const keyUtilityItems = analyzeKeyUtilityItems(items, config, itemRepo);
    console.log("=".repeat(60));
    console.log("KEY UTILITY ITEMS - DISASSEMBLE STRATEGY GUIDE");
    console.log("=".repeat(60));
    console.log("\n");
    console.log(formatKeyUtilityTable(keyUtilityItems));
    console.log("\n");
    console.log("Detailed Key Item Build Paths:\n");
    console.log(formatKeyUtilityItems(keyUtilityItems));
    
    console.log("Orphan Components (not in any disassemblable early item):\n");
    console.log(formatOrphanComponents(reachability.orphanComponents));
    console.log("\n");
    
    console.log("Late-Game Items by Reachability (via early item disassemble):\n");
    console.log(formatReachabilityTable(reachability.lateItemReachability));
    console.log("\n");
    
    // Show details for items that are partially reachable (interesting hybrid cases)
    const partiallyReachable = reachability.lateItemReachability.filter(
      r => r.reachabilityPercent > 0 && r.reachabilityPercent < 0.99
    );
    console.log("Partially Reachable Items (Hybrid Strategy Candidates):\n");
    console.log(formatReachabilityDetails(partiallyReachable.slice(0, 10)));
    
    // Show unreachable items (must buy components directly)
    const unreachable = reachability.lateItemReachability.filter(r => r.reachabilityPercent === 0);
    if (unreachable.length > 0) {
      console.log("Unreachable Late-Game Items (no components from early items):\n");
      for (const item of unreachable.slice(0, 10)) {
        console.log(`  - ${item.item.displayName} (${item.item.cost}g): needs ${item.orphanComponents.join(", ")}`);
      }
      console.log("\n");
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
