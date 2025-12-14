/**
 * Reachability Analysis Command
 * 
 * Analyzes which late-game items can be reached via early item disassembly.
 */

import { CliContext } from "../context";
import { analyzeReachability, analyzeKeyUtilityItems } from "../../calculators/upgradePaths";
import {
  formatReachabilitySummary,
  formatOrphanComponents,
  formatReachabilityTable,
  formatReachabilityDetails,
  formatKeyUtilityTable,
  formatKeyUtilityItems,
} from "../../output/display";
import { ReachabilityAnalysis, KeyItemAnalysis } from "../../calculators/upgradePaths";

/**
 * Options for reachability analysis.
 */
export interface ReachabilityOptions {
  /** Show key utility items analysis */
  showKeyUtility?: boolean;
  /** Show orphan components */
  showOrphans?: boolean;
  /** Show detailed reachability for hybrid items */
  showHybridDetails?: boolean;
  /** Maximum items to display */
  limit?: number;
}

/**
 * Result of reachability analysis.
 */
export interface ReachabilityResult {
  reachability: ReachabilityAnalysis;
  keyUtilityItems?: KeyItemAnalysis[];
}

/**
 * Run reachability analysis and return results.
 */
export function runReachabilityAnalysis(
  ctx: CliContext,
  options: ReachabilityOptions = {}
): ReachabilityResult {
  const { showKeyUtility = true } = options;

  const reachability = analyzeReachability(ctx.items, ctx.config, ctx.repo);
  
  const result: ReachabilityResult = { reachability };

  if (showKeyUtility) {
    result.keyUtilityItems = analyzeKeyUtilityItems(ctx.items, ctx.config, ctx.repo);
  }

  return result;
}

/**
 * Print reachability analysis to console.
 */
export function printReachabilityAnalysis(
  ctx: CliContext,
  options: ReachabilityOptions = {}
): void {
  const {
    showKeyUtility = true,
    showOrphans = true,
    showHybridDetails = true,
    limit = 25,
  } = options;

  const result = runReachabilityAnalysis(ctx, { showKeyUtility });

  console.log("=".repeat(60));
  console.log("LATE-GAME REACHABILITY ANALYSIS");
  console.log("=".repeat(60));
  console.log("\n");
  console.log(formatReachabilitySummary(result.reachability));
  console.log("\n");

  // Key utility items
  if (result.keyUtilityItems) {
    console.log("=".repeat(60));
    console.log("KEY UTILITY ITEMS - DISASSEMBLE STRATEGY GUIDE");
    console.log("=".repeat(60));
    console.log("\n");
    console.log(formatKeyUtilityTable(result.keyUtilityItems));
    console.log("\n");
    console.log("Detailed Key Item Build Paths:\n");
    console.log(formatKeyUtilityItems(result.keyUtilityItems));
  }

  // Orphan components
  if (showOrphans) {
    console.log("Orphan Components (not in any disassemblable early item):\n");
    console.log(formatOrphanComponents(result.reachability.orphanComponents, limit));
    console.log("\n");
  }

  // Reachability table
  console.log("Late-Game Items by Reachability (via early item disassemble):\n");
  console.log(formatReachabilityTable(result.reachability.lateItemReachability, limit));
  console.log("\n");

  // Hybrid strategy candidates
  if (showHybridDetails) {
    const partiallyReachable = result.reachability.lateItemReachability.filter(
      (r) => r.reachabilityPercent > 0 && r.reachabilityPercent < 0.99
    );
    if (partiallyReachable.length > 0) {
      console.log("Partially Reachable Items (Hybrid Strategy Candidates):\n");
      console.log(formatReachabilityDetails(partiallyReachable.slice(0, 10)));
    }

    // Unreachable items
    const unreachable = result.reachability.lateItemReachability.filter(
      (r) => r.reachabilityPercent === 0
    );
    if (unreachable.length > 0) {
      console.log("Unreachable Late-Game Items (no components from early items):\n");
      for (const item of unreachable.slice(0, 10)) {
        console.log(
          `  - ${item.item.displayName} (${item.item.cost}g): needs ${item.orphanComponents.join(", ")}`
        );
      }
      console.log("\n");
    }
  }
}
