/**
 * Efficiency Display Module
 * 
 * Formatting functions for item efficiency analysis,
 * stat valuations, and value rankings.
 */

import { EfficiencyResult, StatValuation } from "../models/types";
import { ValueRankingResult } from "../calculators/efficiency";

// ─────────────────────────────────────────────────────────────
// Efficiency Tables
// ─────────────────────────────────────────────────────────────

/**
 * Format efficiency results as a table for CLI output
 */
export function formatEfficiencyTable(results: EfficiencyResult[]): string {
  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(30) + "┬" + "─".repeat(10) + "┬" + "─".repeat(14) + "┬" + "─".repeat(12) + "┐");
  lines.push(
    "│ " +
      "Item".padEnd(28) +
      " │ " +
      "Cost".padStart(8) +
      " │ " +
      "Stat Value".padStart(12) +
      " │ " +
      "Efficiency".padStart(10) +
      " │"
  );
  lines.push("├" + "─".repeat(30) + "┼" + "─".repeat(10) + "┼" + "─".repeat(14) + "┼" + "─".repeat(12) + "┤");

  // Data rows
  for (const result of results) {
    const name = result.item.displayName.substring(0, 28).padEnd(28);
    const cost = result.item.cost.toString().padStart(8);
    const statValue = result.totalStatValue.toFixed(0).padStart(12);
    const efficiency = result.efficiency.toFixed(2).padStart(10);

    lines.push(`│ ${name} │ ${cost} │ ${statValue} │ ${efficiency} │`);
  }

  // Footer
  lines.push("└" + "─".repeat(30) + "┴" + "─".repeat(10) + "┴" + "─".repeat(14) + "┴" + "─".repeat(12) + "┘");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Stat Valuations
// ─────────────────────────────────────────────────────────────

/**
 * Format stat valuations for display
 */
export function formatStatValuations(valuation: StatValuation): string {
  const lines: string[] = [];

  lines.push("┌" + "─".repeat(24) + "┬" + "─".repeat(16) + "┐");
  lines.push("│ " + "Stat".padEnd(22) + " │ " + "Gold per Point".padStart(14) + " │");
  lines.push("├" + "─".repeat(24) + "┼" + "─".repeat(16) + "┤");

  const sortedStats = Object.entries(valuation)
    .filter(([, value]) => value !== undefined && value > 0)
    .sort(([, a], [, b]) => b - a);

  for (const [stat, goldPerPoint] of sortedStats) {
    lines.push(
      "│ " + stat.padEnd(22) + " │ " + goldPerPoint.toFixed(2).padStart(14) + " │"
    );
  }

  lines.push("└" + "─".repeat(24) + "┴" + "─".repeat(16) + "┘");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Value Rankings
// ─────────────────────────────────────────────────────────────

/**
 * Format value ranking results as a table for CLI output
 * Shows utility value and total efficiency
 */
export function formatValueRankingTable(results: ValueRankingResult[]): string {
  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(26) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┐");
  lines.push(
    "│ " +
      "Item".padEnd(24) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Utility".padStart(8) +
      " │ " +
      "Eff+Util".padStart(8) +
      " │ " +
      "Value".padStart(8) +
      " │"
  );
  lines.push("├" + "─".repeat(26) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┤");

  // Data rows
  for (const result of results) {
    const name = result.item.displayName.substring(0, 24).padEnd(24);
    const cost = result.item.cost.toString().padStart(6);
    const utility = result.utilityValue > 0 ? result.utilityValue.toString().padStart(8) : "-".padStart(8);
    const effWithUtil = result.efficiencyWithUtility.toFixed(2).padStart(8);
    const valueScore = result.valueScore.toFixed(3).padStart(8);

    lines.push(`│ ${name} │ ${cost} │ ${utility} │ ${effWithUtil} │ ${valueScore} │`);
  }

  // Footer
  lines.push("└" + "─".repeat(26) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┘");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Disassemble Analysis
// ─────────────────────────────────────────────────────────────

import { DisassembleAnalysis } from "../calculators/upgradePaths";

/**
 * Format disassemble analysis table for Gyrocopter
 */
export function formatDisassembleTable(analyses: DisassembleAnalysis[], limit: number = 30): string {
  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(24) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┐");
  lines.push(
    "│ " +
      "Item".padEnd(22) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Recovery".padStart(8) +
      " │ " +
      "Wasted".padStart(8) +
      " │ " +
      "Eff".padStart(8) +
      " │ " +
      "Value".padStart(8) +
      " │"
  );
  lines.push("├" + "─".repeat(24) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┤");

  // Data rows
  const displayItems = analyses.slice(0, limit);
  for (const analysis of displayItems) {
    const name = analysis.item.displayName.substring(0, 22).padEnd(22);
    const cost = analysis.item.cost.toString().padStart(6);
    const recovery = (analysis.goldEfficiency * 100).toFixed(0).padStart(7) + "%";
    const wasted = analysis.wastedGold === 0 ? "-".padStart(8) : analysis.wastedGold.toString().padStart(8);
    const eff = analysis.efficiency.toFixed(2).padStart(8);
    const value = analysis.totalValue.toFixed(0).padStart(8);

    lines.push(`│ ${name} │ ${cost} │ ${recovery} │ ${wasted} │ ${eff} │ ${value} │`);
  }

  // Footer
  lines.push("└" + "─".repeat(24) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┘");

  return lines.join("\n");
}

/**
 * Format detailed disassemble analysis for an item
 */
export function formatDisassembleDetails(analyses: DisassembleAnalysis[], limit: number = 10): string {
  const lines: string[] = [];

  const displayItems = analyses.slice(0, limit);
  for (let i = 0; i < displayItems.length; i++) {
    const analysis = displayItems[i];
    
    const utilStr = analysis.utilityValue > 0 ? ` | Utility: ${analysis.utilityValue}g` : "";
    const recoveryPct = (analysis.goldEfficiency * 100).toFixed(0);
    
    lines.push(`${i + 1}. ${analysis.item.displayName} (${analysis.item.cost}g)`);
    lines.push(`   Stats: ${analysis.statValue.toFixed(0)}g${utilStr} | Efficiency: ${analysis.efficiency.toFixed(2)}`);
    lines.push(`   Gold Recovery: ${recoveryPct}% (${analysis.totalRecoveredGold}g / ${analysis.item.cost}g)`);
    
    if (analysis.recipeCost > 0) {
      lines.push(`   Recipe: ${analysis.recipeCost}g (sells at 100%)`);
    }
    
    lines.push(`   Components:`);
    for (const comp of analysis.components) {
      const status = comp.isUsable ? "OK" : "WASTED";
      const upgradesStr = comp.isUsable 
        ? ` -> ${comp.canUpgradeInto.slice(0, 3).join(", ")}${comp.canUpgradeInto.length > 3 ? "..." : ""}`
        : "";
      lines.push(`     - ${comp.componentName} (${comp.componentCost}g) [${status}]${upgradesStr}`);
    }
    
    if (analysis.wastedGold > 0) {
      lines.push(`   WARNING: ${analysis.wastedGold}g cannot be recovered!`);
    }
    
    lines.push("");
  }

  return lines.join("\n");
}
