/**
 * Display Module - Central export hub
 * 
 * Re-exports all display/formatting functions from specialized modules.
 * Import from this file for backward compatibility or from specific
 * modules for tree-shaking benefits.
 * 
 * Module Structure:
 * - tables.ts: Generic table utilities, text formatting, box characters
 * - efficiency.ts: Item efficiency, stat valuations, disassemble analysis
 * - transitions.ts: Build transitions, early combos, boot trios
 * - reachability.ts: Late-game reachability, orphan components, key items
 */

// ─────────────────────────────────────────────────────────────
// Table Utilities
// ─────────────────────────────────────────────────────────────

export {
  BOX,
  truncateItemName,
  padTruncate,
  formatPercent,
  formatGold,
  horizontalLine,
  tableRow,
  buildTable,
  headerBox,
  sectionHeader,
  underlinedHeader,
} from "./tables";

export type { SimpleTableOptions } from "./tables";

// ─────────────────────────────────────────────────────────────
// Efficiency Display
// ─────────────────────────────────────────────────────────────

export {
  formatEfficiencyTable,
  formatStatValuations,
  formatValueRankingTable,
  formatDisassembleTable,
  formatDisassembleDetails,
} from "./efficiency";

// ─────────────────────────────────────────────────────────────
// Transitions Display
// ─────────────────────────────────────────────────────────────

export {
  formatTransitionsTable,
  formatTransitionsDetails,
  formatTransitionsSummary,
  formatEarlyItemCombos,
  formatComboTable,
  formatBootTrioTable,
  formatBootTrioDetails,
} from "./transitions";

// ─────────────────────────────────────────────────────────────
// Reachability Display
// ─────────────────────────────────────────────────────────────

export {
  formatOrphanComponents,
  formatReachabilityTable,
  formatReachabilityDetails,
  formatReachabilitySummary,
  formatKeyUtilityItems,
  formatKeyUtilityTable,
} from "./reachability";
