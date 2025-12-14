/**
 * Efficiency Analysis Command
 * 
 * Analyzes item efficiency rankings and stat valuations.
 */

import { CliContext } from "../context";
import { getItemsByEfficiency, getItemsByValueSplit } from "../../calculators/efficiency";
import { analyzeDisassemble } from "../../calculators/upgradePaths";
import {
  formatEfficiencyTable,
  formatStatValuations,
  formatValueRankingTable,
  formatDisassembleTable,
  formatDisassembleDetails,
} from "../../output/display";

/**
 * Options for efficiency analysis.
 */
export interface EfficiencyOptions {
  /** Show stat valuations */
  showStatValues?: boolean;
  /** Show simple items only */
  simpleOnly?: boolean;
  /** Show upgraded items only */
  upgradedOnly?: boolean;
  /** Show disassemble analysis (Gyrocopter) */
  showDisassemble?: boolean;
  /** Maximum items to display */
  limit?: number;
}

/**
 * Result of efficiency analysis.
 */
export interface EfficiencyResult {
  statValuations: string;
  efficiencyTable: string;
  simpleItems?: string;
  upgradedItems?: string;
  disassembleTable?: string;
  disassembleDetails?: string;
}

/**
 * Run efficiency analysis and return formatted output.
 */
export function runEfficiencyAnalysis(
  ctx: CliContext,
  options: EfficiencyOptions = {}
): EfficiencyResult {
  const { showStatValues = true, simpleOnly = false, upgradedOnly = false, showDisassemble = false, limit } = options;

  const result: EfficiencyResult = {
    statValuations: "",
    efficiencyTable: "",
  };

  // Stat valuations
  if (showStatValues) {
    result.statValuations = formatStatValuations(ctx.statValuation);
  }

  // Efficiency rankings
  const efficiencyResults = getItemsByEfficiency(ctx.items);
  const limitedResults = limit ? efficiencyResults.slice(0, limit) : efficiencyResults;
  result.efficiencyTable = formatEfficiencyTable(limitedResults);

  // Value rankings by item type
  if (!simpleOnly && !upgradedOnly) {
    const { simpleItems, upgradedItems } = getItemsByValueSplit(ctx.items);
    result.simpleItems = formatValueRankingTable(limit ? simpleItems.slice(0, limit) : simpleItems);
    result.upgradedItems = formatValueRankingTable(limit ? upgradedItems.slice(0, limit) : upgradedItems);
  } else if (simpleOnly) {
    const { simpleItems } = getItemsByValueSplit(ctx.items);
    result.simpleItems = formatValueRankingTable(limit ? simpleItems.slice(0, limit) : simpleItems);
  } else if (upgradedOnly) {
    const { upgradedItems } = getItemsByValueSplit(ctx.items);
    result.upgradedItems = formatValueRankingTable(limit ? upgradedItems.slice(0, limit) : upgradedItems);
  }

  // Disassemble analysis (Gyrocopter innate)
  if (showDisassemble) {
    const disassembleAnalysis = analyzeDisassemble(ctx.items, ctx.config, ctx.repo);
    result.disassembleTable = formatDisassembleTable(disassembleAnalysis, limit ?? 30);
    result.disassembleDetails = formatDisassembleDetails(disassembleAnalysis, 5);
  }

  return result;
}

/**
 * Print efficiency analysis to console.
 */
export function printEfficiencyAnalysis(
  ctx: CliContext,
  options: EfficiencyOptions = {}
): void {
  const result = runEfficiencyAnalysis(ctx, options);
  const auraMultiplier = ctx.config.thresholds.auraMultiplier;

  if (result.statValuations) {
    let header = "Stat Valuations (Gold per Point)";
    if (auraMultiplier !== 1.0) {
      header += ` [Aura: ${auraMultiplier}x]`;
    }
    console.log(header + ":\n");
    console.log(result.statValuations);
    console.log("\n");
  }

  console.log("Item Efficiency Rankings:\n");
  console.log(result.efficiencyTable);
  console.log("\n");

  if (result.simpleItems) {
    console.log("Simple Items - Value Rankings (Efficiency + Low Cost):\n");
    console.log(result.simpleItems);
    console.log("\n");
  }

  if (result.upgradedItems) {
    console.log("Upgraded Items - Value Rankings (Efficiency + Low Cost):\n");
    console.log(result.upgradedItems);
    console.log("\n");
  }

  if (result.disassembleTable) {
    console.log("Gyrocopter Disassemble Analysis (Early Items by Gold Recovery %):\n");
    console.log(result.disassembleTable);
    console.log("\n");
  }

  if (result.disassembleDetails) {
    console.log("Top Disassemble Item Details:\n");
    console.log(result.disassembleDetails);
  }
}
