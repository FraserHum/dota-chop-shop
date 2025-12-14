/**
 * Transitions Display Module
 * 
 * Formatting functions for build transition analysis,
 * early item combos, and boot trio analysis.
 */

import { BuildAnalysisResult } from "../models/buildTypes";
import { EarlyItemCombo, BootTrioCombo } from "../calculators/upgradePaths";

// ─────────────────────────────────────────────────────────────
// Build Transitions
// ─────────────────────────────────────────────────────────────

/**
 * Format build transitions table showing early -> final loadout transitions.
 * This shows the ACTUAL final builds, not just upgrade targets.
 */
export function formatTransitionsTable(result: BuildAnalysisResult, limit: number = 20): string {
  const lines: string[] = [];

  // Check if we have stat values available
  const hasStatValues = result.transitions.length > 0 && 
    (result.transitions[0].from.totalStatValue > 0 || result.transitions[0].to.totalStatValue > 0);

  if (hasStatValues) {
    // Extended header with efficiency columns
    lines.push("┌" + "─".repeat(32) + "┬" + "─".repeat(32) + "┬" + "─".repeat(8) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(8) + "┐");
    lines.push(
      "│ " +
        "Early Build".padEnd(30) +
        " │ " +
        "Final Build".padEnd(30) +
        " │ " +
        "Reuse".padStart(6) +
        " │ " +
        "Delta".padStart(6) +
        " │ " +
        "Eff".padStart(8) +
        " │ " +
        "Score".padStart(6) +
        " │"
    );
    lines.push("├" + "─".repeat(32) + "┼" + "─".repeat(32) + "┼" + "─".repeat(8) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(8) + "┤");
  } else {
    // Original header without efficiency
    lines.push("┌" + "─".repeat(32) + "┬" + "─".repeat(32) + "┬" + "─".repeat(8) + "┬" + "─".repeat(8) + "┬" + "─".repeat(8) + "┐");
    lines.push(
      "│ " +
        "Early Build".padEnd(30) +
        " │ " +
        "Final Build".padEnd(30) +
        " │ " +
        "Reuse".padStart(6) +
        " │ " +
        "Delta".padStart(6) +
        " │ " +
        "Score".padStart(6) +
        " │"
    );
    lines.push("├" + "─".repeat(32) + "┼" + "─".repeat(32) + "┼" + "─".repeat(8) + "┼" + "─".repeat(8) + "┼" + "─".repeat(8) + "┤");
  }

  // Data rows
  const displayTransitions = result.transitions.slice(0, limit);
  for (const t of displayTransitions) {
    const earlyNames = t.from.items.map(i => i.displayName.substring(0, 14)).join(" + ");
    const finalNames = t.to.items.map(i => i.displayName.substring(0, 14)).join(" + ");
    const early = earlyNames.substring(0, 30).padEnd(30);
    const final = finalNames.substring(0, 30).padEnd(30);
    const reusePct = t.from.totalCost > 0 
      ? ((t.componentFlow.reusedGold / t.from.totalCost) * 100).toFixed(0).padStart(5) + "%"
      : "-".padStart(6);
    const delta = ("+" + t.costDelta).padStart(6);
    const score = t.score.toFixed(2).padStart(6);

    if (hasStatValues) {
      // Show efficiency change (from → to)
      const effStr = `${t.from.efficiency.toFixed(1)}→${t.to.efficiency.toFixed(1)}`.padStart(8);
      lines.push(`│ ${early} │ ${final} │ ${reusePct} │ ${delta} │ ${effStr} │ ${score} │`);
    } else {
      lines.push(`│ ${early} │ ${final} │ ${reusePct} │ ${delta} │ ${score} │`);
    }
  }

  // Footer
  if (hasStatValues) {
    lines.push("└" + "─".repeat(32) + "┴" + "─".repeat(32) + "┴" + "─".repeat(8) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(8) + "┘");
  } else {
    lines.push("└" + "─".repeat(32) + "┴" + "─".repeat(32) + "┴" + "─".repeat(8) + "┴" + "─".repeat(8) + "┴" + "─".repeat(8) + "┘");
  }

  // Stats
  lines.push("");
  lines.push(`Stats: ${result.stats.totalEvaluated} evaluated | ${result.stats.validCount} valid | Best: ${result.stats.bestScore.toFixed(2)} | Avg: ${result.stats.averageScore.toFixed(2)}`);

  return lines.join("\n");
}

/**
 * Format detailed transition analysis showing component flow.
 */
export function formatTransitionsDetails(result: BuildAnalysisResult, limit: number = 10): string {
  const lines: string[] = [];

  const displayTransitions = result.transitions.slice(0, limit);
  for (let i = 0; i < displayTransitions.length; i++) {
    const t = displayTransitions[i];
    
    const earlyNames = t.from.items.map(i => i.displayName).join(" + ");
    const finalNames = t.to.items.map(i => i.displayName).join(" + ");
    const reusePct = t.from.totalCost > 0 
      ? ((t.componentFlow.reusedGold / t.from.totalCost) * 100).toFixed(0)
      : "0";
    
    lines.push(`${i + 1}. ${earlyNames}`);
    lines.push(`   → ${finalNames}`);
    lines.push(`   Cost: ${t.from.totalCost}g → ${t.to.totalCost}g (+${t.costDelta}g)`);
    
    // Show stat value and efficiency for early and final builds
    if (t.from.totalStatValue > 0 || t.to.totalStatValue > 0) {
      const fromEff = t.from.efficiency.toFixed(2);
      const toEff = t.to.efficiency.toFixed(2);
      const effChange = t.to.efficiency - t.from.efficiency;
      const effChangeStr = effChange >= 0 ? `+${effChange.toFixed(2)}` : effChange.toFixed(2);
      lines.push(`   Stats: ${t.from.totalStatValue.toFixed(0)}g → ${t.to.totalStatValue.toFixed(0)}g | Efficiency: ${fromEff} → ${toEff} (${effChangeStr})`);
    }
    
    lines.push(`   Component Reuse: ${reusePct}% (${t.componentFlow.reusedGold}g of ${t.from.totalCost}g)`);
    
    if (t.componentFlow.reused.length > 0) {
      const reusedDisplay = t.componentFlow.reused.slice(0, 6).join(", ");
      const more = t.componentFlow.reused.length > 6 ? `... +${t.componentFlow.reused.length - 6} more` : "";
      lines.push(`   Reused: ${reusedDisplay}${more}`);
    }
    
    if (t.componentFlow.wastedGold > 0) {
      const wastedDisplay = t.componentFlow.wasted.slice(0, 4).join(", ");
      const more = t.componentFlow.wasted.length > 4 ? `... +${t.componentFlow.wasted.length - 4} more` : "";
      lines.push(`   Wasted: ${wastedDisplay}${more} (${t.componentFlow.wastedGold}g lost)`);
    }
    
    // Show new components needed
    if (t.componentFlow.acquired.length > 0) {
      const acquiredDisplay = t.componentFlow.acquired.slice(0, 4).join(", ");
      const more = t.componentFlow.acquired.length > 4 ? `... +${t.componentFlow.acquired.length - 4} more` : "";
      lines.push(`   New components: ${acquiredDisplay}${more} (${t.componentFlow.acquiredGold}g)`);
    }
    
    // Show recipe cost breakdown
    if (t.componentFlow.targetRecipeCost > 0 || t.componentFlow.recoveredRecipeCost > 0) {
      const recipeInfo: string[] = [];
      if (t.componentFlow.targetRecipeCost > 0) {
        recipeInfo.push(`target recipes: ${t.componentFlow.targetRecipeCost}g`);
      }
      if (t.componentFlow.recoveredRecipeCost > 0) {
        recipeInfo.push(`recovered: ${t.componentFlow.recoveredRecipeCost}g`);
      }
      lines.push(`   Recipes: ${recipeInfo.join(", ")} (net: ${t.componentFlow.netRecipeCost}g)`);
    }
    
    // Show total gold needed
    lines.push(`   Total to buy: ${t.componentFlow.totalGoldNeeded}g`);
    
    lines.push(`   Score: ${t.score.toFixed(3)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a compact summary of build transitions grouped by early build.
 */
export function formatTransitionsSummary(result: BuildAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push("Build Transition Analysis Summary:");
  lines.push("─".repeat(50));
  lines.push(`  Total transitions evaluated: ${result.stats.totalEvaluated}`);
  lines.push(`  Valid transitions (cost increase): ${result.stats.validCount}`);
  lines.push(`  Best transition score: ${result.stats.bestScore.toFixed(3)}`);
  lines.push(`  Average score: ${result.stats.averageScore.toFixed(3)}`);
  
  if (result.transitions.length > 0) {
    const best = result.transitions[0];
    const earlyNames = best.from.items.map(i => i.displayName).join(" + ");
    const finalNames = best.to.items.map(i => i.displayName).join(" + ");
    const reusePct = best.from.totalCost > 0 
      ? ((best.componentFlow.reusedGold / best.from.totalCost) * 100).toFixed(0)
      : "0";
    
    lines.push("");
    lines.push("  Best transition:");
    lines.push(`    ${earlyNames}`);
    lines.push(`    → ${finalNames}`);
    lines.push(`    ${reusePct}% reuse, +${best.costDelta}g cost increase`);
    
    // Show efficiency if available
    if (best.from.totalStatValue > 0 || best.to.totalStatValue > 0) {
      const effChange = best.to.efficiency - best.from.efficiency;
      const effChangeStr = effChange >= 0 ? `+${effChange.toFixed(2)}` : effChange.toFixed(2);
      lines.push(`    Efficiency: ${best.from.efficiency.toFixed(2)} → ${best.to.efficiency.toFixed(2)} (${effChangeStr})`);
    }
  }
  
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Early Item Combos
// ─────────────────────────────────────────────────────────────

/**
 * Format early item combo synergies
 */
export function formatEarlyItemCombos(combos: EarlyItemCombo[], limit: number = 15): string {
  const lines: string[] = [];

  const displayCombos = combos.slice(0, limit);
  for (let i = 0; i < displayCombos.length; i++) {
    const combo = displayCombos[i];
    const item1 = combo.earlyItems[0];
    const item2 = combo.earlyItems[1];
    
    lines.push(`${i + 1}. ${item1.item.displayName} + ${item2.item.displayName}`);
    lines.push(`   Combined: ${combo.combinedCost}g cost | ${combo.combinedValue.toFixed(0)}g value | Synergy: ${combo.synergyScore.toFixed(3)}`);
    
    // Show top shared targets (late items both contribute to)
    lines.push(`   Shared Upgrade Targets:`);
    const topTargets = combo.sharedTargets.slice(0, 3);
    for (const target of topTargets) {
      const goldPct = (target.goldContributionPercent * 100).toFixed(0);
      lines.push(`     -> ${target.lateItem.displayName} (${target.lateItem.cost}g)`);
      lines.push(`        Gold Contribution: ${goldPct}% (${target.goldContributed}g / ${target.lateItem.cost}g)`);
      lines.push(`        Provides: ${target.componentsProvided.join(", ")}`);
      lines.push(`        Remaining: ${target.remainingCost}g to complete`);
    }
    
    if (combo.sharedTargets.length > 3) {
      lines.push(`     ... and ${combo.sharedTargets.length - 3} more shared targets`);
    }
    
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a summary table of early item combos
 */
export function formatComboTable(combos: EarlyItemCombo[], limit: number = 20): string {
  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(20) + "┬" + "─".repeat(20) + "┬" + "─".repeat(10) + "┬" + "─".repeat(12) + "┬" + "─".repeat(24) + "┐");
  lines.push(
    "│ " +
      "Item 1".padEnd(18) +
      " │ " +
      "Item 2".padEnd(18) +
      " │ " +
      "Cost".padStart(8) +
      " │ " +
      "Gold Cont.".padStart(10) +
      " │ " +
      "Best Target".padEnd(22) +
      " │"
  );
  lines.push("├" + "─".repeat(20) + "┼" + "─".repeat(20) + "┼" + "─".repeat(10) + "┼" + "─".repeat(12) + "┼" + "─".repeat(24) + "┤");

  // Data rows
  const displayCombos = combos.slice(0, limit);
  for (const combo of displayCombos) {
    const item1 = combo.earlyItems[0].item.displayName.substring(0, 18).padEnd(18);
    const item2 = combo.earlyItems[1].item.displayName.substring(0, 18).padEnd(18);
    const cost = combo.combinedCost.toString().padStart(8);
    const goldContrib = (combo.bestGoldContributionPercent * 100).toFixed(0).padStart(9) + "%";
    const bestTarget = combo.sharedTargets[0]?.lateItem.displayName.substring(0, 22).padEnd(22) || "-".padEnd(22);

    lines.push(`│ ${item1} │ ${item2} │ ${cost} │ ${goldContrib} │ ${bestTarget} │`);
  }

  // Footer
  lines.push("└" + "─".repeat(20) + "┴" + "─".repeat(20) + "┴" + "─".repeat(10) + "┴" + "─".repeat(12) + "┴" + "─".repeat(24) + "┘");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Boot Trio Analysis
// ─────────────────────────────────────────────────────────────

/**
 * Format boot trio summary table
 */
export function formatBootTrioTable(trios: BootTrioCombo[], limit: number = 20): string {
  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(18) + "┬" + "─".repeat(18) + "┬" + "─".repeat(18) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(8) + "┬" + "─".repeat(18) + "┐");
  lines.push(
    "│ " +
      "Boot".padEnd(16) +
      " │ " +
      "Item 1".padEnd(16) +
      " │ " +
      "Item 2".padEnd(16) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Gold %".padStart(8) +
      " │ " +
      "Lost".padStart(6) +
      " │ " +
      "Best Target".padEnd(16) +
      " │"
  );
  lines.push("├" + "─".repeat(18) + "┼" + "─".repeat(18) + "┼" + "─".repeat(18) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(8) + "┼" + "─".repeat(18) + "┤");

  // Data rows
  const displayTrios = trios.slice(0, limit);
  for (const trio of displayTrios) {
    const boot = trio.bootItem.item.displayName.substring(0, 16).padEnd(16);
    const item1 = trio.nonBootItems[0].item.displayName.substring(0, 16).padEnd(16);
    const item2 = trio.nonBootItems[1].item.displayName.substring(0, 16).padEnd(16);
    const cost = trio.combinedCost.toString().padStart(6);
    const goldContrib = (trio.bestGoldContributionPercent * 100).toFixed(0).padStart(7) + "%";
    const lost = trio.totalWastedGold === 0 ? "-".padStart(6) : trio.totalWastedGold.toString().padStart(6);
    const bestTarget = trio.sharedTargets[0]?.lateItem.displayName.substring(0, 16).padEnd(16) || "-".padEnd(16);

    lines.push(`│ ${boot} │ ${item1} │ ${item2} │ ${cost} │ ${goldContrib} │ ${lost} │ ${bestTarget} │`);
  }

  // Footer
  lines.push("└" + "─".repeat(18) + "┴" + "─".repeat(18) + "┴" + "─".repeat(18) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(8) + "┴" + "─".repeat(18) + "┘");

  return lines.join("\n");
}

/**
 * Format detailed boot trio analysis
 */
export function formatBootTrioDetails(trios: BootTrioCombo[], limit: number = 10): string {
  const lines: string[] = [];

  const displayTrios = trios.slice(0, limit);
  for (let i = 0; i < displayTrios.length; i++) {
    const trio = displayTrios[i];
    const boot = trio.bootItem;
    const item1 = trio.nonBootItems[0];
    const item2 = trio.nonBootItems[1];
    
    const recoveryPct = (trio.averageRecovery * 100).toFixed(0);
    const lostStr = trio.totalWastedGold > 0 ? ` | Lost: ${trio.totalWastedGold}g` : "";
    
    lines.push(`${i + 1}. ${boot.item.displayName} + ${item1.item.displayName} + ${item2.item.displayName}`);
    lines.push(`   Cost: ${trio.combinedCost}g | Value: ${trio.combinedValue.toFixed(0)}g | Recovery: ${recoveryPct}%${lostStr}`);
    
    // Show top shared targets
    lines.push(`   Upgrade Targets (2+ items contribute):`);
    const topTargets = trio.sharedTargets.slice(0, 4);
    for (const target of topTargets) {
      const goldPct = (target.goldContributionPercent * 100).toFixed(0);
      const contributors = target.contributingEarlyItems.length;
      lines.push(`     -> ${target.lateItem.displayName} (${target.lateItem.cost}g) [${contributors} items contribute]`);
      lines.push(`        Gold Contribution: ${goldPct}% (${target.goldContributed}g / ${target.lateItem.cost}g)`);
      lines.push(`        Provides: ${target.componentsProvided.slice(0, 5).join(", ")}${target.componentsProvided.length > 5 ? "..." : ""}`);
      lines.push(`        Remaining: ${target.remainingCost}g to complete`);
    }
    
    if (trio.sharedTargets.length > 4) {
      lines.push(`     ... and ${trio.sharedTargets.length - 4} more targets`);
    }
    
    lines.push("");
  }

  return lines.join("\n");
}
