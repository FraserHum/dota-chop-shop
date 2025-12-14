/**
 * Reachability Display Module
 * 
 * Formatting functions for late-game item reachability analysis,
 * orphan components, and key utility items.
 */

import { 
  OrphanComponent, 
  LateItemReachability, 
  ReachabilityAnalysis, 
  KeyItemAnalysis 
} from "../calculators/upgradePaths";

// ─────────────────────────────────────────────────────────────
// Orphan Components
// ─────────────────────────────────────────────────────────────

/**
 * Format orphan components table (components not in any early item)
 */
export function formatOrphanComponents(orphans: OrphanComponent[], limit: number = 15): string {
  const lines: string[] = [];

  lines.push("┌" + "─".repeat(22) + "┬" + "─".repeat(8) + "┬" + "─".repeat(8) + "┬" + "─".repeat(40) + "┐");
  lines.push(
    "│ " +
      "Component".padEnd(20) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Used In".padStart(6) +
      " │ " +
      "Late Game Items (examples)".padEnd(38) +
      " │"
  );
  lines.push("├" + "─".repeat(22) + "┼" + "─".repeat(8) + "┼" + "─".repeat(8) + "┼" + "─".repeat(40) + "┤");

  const displayOrphans = orphans.slice(0, limit);
  for (const orphan of displayOrphans) {
    const name = orphan.displayName.substring(0, 20).padEnd(20);
    const cost = orphan.cost.toString().padStart(6);
    const usedIn = orphan.usedInLateItems.length.toString().padStart(6);
    const examples = orphan.usedInLateItems.slice(0, 3).join(", ");
    const examplesStr = (examples.length > 38 ? examples.substring(0, 35) + "..." : examples).padEnd(38);

    lines.push(`│ ${name} │ ${cost} │ ${usedIn} │ ${examplesStr} │`);
  }

  lines.push("└" + "─".repeat(22) + "┴" + "─".repeat(8) + "┴" + "─".repeat(8) + "┴" + "─".repeat(40) + "┘");

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Late-Game Item Reachability
// ─────────────────────────────────────────────────────────────

/**
 * Format late-game item reachability table
 */
export function formatReachabilityTable(reachability: LateItemReachability[], limit: number = 25): string {
  const lines: string[] = [];

  lines.push("┌" + "─".repeat(24) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(12) + "┬" + "─".repeat(12) + "┬" + "─".repeat(6) + "┐");
  lines.push(
    "│ " +
      "Late Game Item".padEnd(22) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Reach %".padStart(8) +
      " │ " +
      "Via Early".padStart(10) +
      " │ " +
      "Buy Direct".padStart(10) +
      " │ " +
      "#Src".padStart(4) +
      " │"
  );
  lines.push("├" + "─".repeat(24) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(12) + "┼" + "─".repeat(12) + "┼" + "─".repeat(6) + "┤");

  const displayItems = reachability.slice(0, limit);
  for (const item of displayItems) {
    const name = item.item.displayName.substring(0, 22).padEnd(22);
    const cost = item.item.cost.toString().padStart(6);
    const reachPct = (item.reachabilityPercent * 100).toFixed(0).padStart(7) + "%";
    const viaEarly = item.goldFromEarlyItems > 0 ? (item.goldFromEarlyItems.toString() + "g").padStart(10) : "-".padStart(10);
    const buyDirect = item.goldFromOrphans > 0 ? (item.goldFromOrphans.toString() + "g").padStart(10) : "-".padStart(10);
    const sources = item.contributingEarlyItems.length.toString().padStart(4);

    lines.push(`│ ${name} │ ${cost} │ ${reachPct} │ ${viaEarly} │ ${buyDirect} │ ${sources} │`);
  }

  lines.push("└" + "─".repeat(24) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(12) + "┴" + "─".repeat(12) + "┴" + "─".repeat(6) + "┘");

  return lines.join("\n");
}

/**
 * Format detailed reachability info for specific late items
 */
export function formatReachabilityDetails(reachability: LateItemReachability[], limit: number = 10): string {
  const lines: string[] = [];

  const displayItems = reachability.slice(0, limit);
  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i];
    const reachPct = (item.reachabilityPercent * 100).toFixed(0);
    
    lines.push(`${i + 1}. ${item.item.displayName} (${item.item.cost}g)`);
    lines.push(`   Reachability: ${reachPct}% via early items`);
    
    if (item.componentsFromEarlyItems.length > 0) {
      lines.push(`   From Early Items (${item.goldFromEarlyItems}g): ${item.componentsFromEarlyItems.join(", ")}`);
    }
    
    if (item.orphanComponents.length > 0) {
      lines.push(`   Buy Directly (${item.goldFromOrphans}g): ${item.orphanComponents.join(", ")}`);
    }
    
    if (item.recipeCost > 0) {
      lines.push(`   Recipe: ${item.recipeCost}g`);
    }
    
    if (item.contributingEarlyItems.length > 0) {
      lines.push(`   Early Item Sources:`);
      for (const source of item.contributingEarlyItems.slice(0, 5)) {
        lines.push(`     - ${source.name}: ${source.components.join(", ")}`);
      }
      if (item.contributingEarlyItems.length > 5) {
        lines.push(`     ... and ${item.contributingEarlyItems.length - 5} more`);
      }
    }
    
    lines.push("");
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Reachability Summary
// ─────────────────────────────────────────────────────────────

/**
 * Format reachability summary statistics
 */
export function formatReachabilitySummary(analysis: ReachabilityAnalysis): string {
  const lines: string[] = [];
  
  const fullyPct = ((analysis.fullyReachableCount / analysis.totalLateItems) * 100).toFixed(0);
  const partialPct = ((analysis.partiallyReachableCount / analysis.totalLateItems) * 100).toFixed(0);
  const unreachPct = ((analysis.unreachableCount / analysis.totalLateItems) * 100).toFixed(0);
  
  lines.push("Disassemble Strategy Coverage Summary:");
  lines.push("─".repeat(45));
  lines.push(`  Total late-game items (>= 2500g): ${analysis.totalLateItems}`);
  lines.push(`  Components available via early items: ${analysis.availableComponents.size}`);
  lines.push(`  Orphan components (must buy directly): ${analysis.orphanComponents.length}`);
  lines.push("");
  lines.push("  Late-game item reachability:");
  lines.push(`    Fully reachable (100%):    ${analysis.fullyReachableCount.toString().padStart(3)} items (${fullyPct}%)`);
  lines.push(`    Partially reachable:       ${analysis.partiallyReachableCount.toString().padStart(3)} items (${partialPct}%)`);
  lines.push(`    Unreachable (0%):          ${analysis.unreachableCount.toString().padStart(3)} items (${unreachPct}%)`);
  
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Key Utility Items
// ─────────────────────────────────────────────────────────────

/**
 * Get reachability status label for an item.
 */
function getReachabilityStatus(reachabilityPercent: number): string {
  if (reachabilityPercent >= 0.99) return "FULLY REACHABLE";
  if (reachabilityPercent >= 0.70) return "MOSTLY REACHABLE";
  if (reachabilityPercent >= 0.40) return "HYBRID BUILD";
  if (reachabilityPercent > 0) return "LIMITED REACH";
  return "BUY DIRECTLY";
}

/**
 * Get reachability status with brackets for detailed display.
 */
function getReachabilityStatusBracketed(reachabilityPercent: number): string {
  return " [" + getReachabilityStatus(reachabilityPercent) + "]";
}

/**
 * Format key utility items analysis
 */
export function formatKeyUtilityItems(analyses: KeyItemAnalysis[]): string {
  const lines: string[] = [];
  
  for (let i = 0; i < analyses.length; i++) {
    const item = analyses[i];
    const reachPct = (item.reachabilityPercent * 100).toFixed(0);
    const status = getReachabilityStatusBracketed(item.reachabilityPercent);
    
    lines.push(`${i + 1}. ${item.item.displayName} (${item.item.cost}g) - ${reachPct}% reachable${status}`);
    
    if (item.componentsFromEarlyItems.length > 0) {
      const compList = item.componentsFromEarlyItems.map(c => c.name).join(", ");
      lines.push(`   Via Early Items (${item.goldFromEarlyItems}g): ${compList}`);
    }
    
    if (item.orphanComponents.length > 0) {
      const orphanList = item.orphanComponents.map(c => `${c.name} (${c.cost}g)`).join(", ");
      lines.push(`   Buy Directly (${item.goldFromOrphans}g): ${orphanList}`);
    }
    
    if (item.recipeCost > 0) {
      lines.push(`   Recipe: ${item.recipeCost}g`);
    }
    
    if (item.recommendedLoadout.length > 0) {
      lines.push(`   Recommended Early: ${item.recommendedLoadout.join(" + ")}`);
    }
    
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format a summary table of key utility items
 */
export function formatKeyUtilityTable(analyses: KeyItemAnalysis[]): string {
  const lines: string[] = [];

  lines.push("┌" + "─".repeat(22) + "┬" + "─".repeat(8) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┬" + "─".repeat(10) + "┬" + "─".repeat(26) + "┐");
  lines.push(
    "│ " +
      "Item".padEnd(20) +
      " │ " +
      "Cost".padStart(6) +
      " │ " +
      "Reach %".padStart(8) +
      " │ " +
      "Via Early".padStart(8) +
      " │ " +
      "Buy Dir.".padStart(8) +
      " │ " +
      "Status".padEnd(24) +
      " │"
  );
  lines.push("├" + "─".repeat(22) + "┼" + "─".repeat(8) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┼" + "─".repeat(10) + "┼" + "─".repeat(26) + "┤");

  for (const item of analyses) {
    const name = item.item.displayName.substring(0, 20).padEnd(20);
    const cost = item.item.cost.toString().padStart(6);
    const reachPct = (item.reachabilityPercent * 100).toFixed(0).padStart(7) + "%";
    const viaEarly = item.goldFromEarlyItems > 0 ? (item.goldFromEarlyItems.toString() + "g").padStart(8) : "-".padStart(8);
    const buyDirect = item.goldFromOrphans > 0 ? (item.goldFromOrphans.toString() + "g").padStart(8) : "-".padStart(8);
    const status = getReachabilityStatus(item.reachabilityPercent).padEnd(24);

    lines.push(`│ ${name} │ ${cost} │ ${reachPct} │ ${viaEarly} │ ${buyDirect} │ ${status} │`);
  }

  lines.push("└" + "─".repeat(22) + "┴" + "─".repeat(8) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┴" + "─".repeat(10) + "┴" + "─".repeat(26) + "┘");

  return lines.join("\n");
}
