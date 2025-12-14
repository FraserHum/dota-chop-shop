/**
 * Generic table formatting utilities for CLI output.
 * 
 * Provides reusable functions for creating ASCII tables
 * and formatting item names consistently.
 */

// ─────────────────────────────────────────────────────────────
// Table Drawing Characters
// ─────────────────────────────────────────────────────────────

export const BOX = {
  // Single line
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeDown: "┬",
  teeUp: "┴",
  teeRight: "├",
  teeLeft: "┤",
  cross: "┼",
  
  // Double line (for headers)
  doubleTopLeft: "╔",
  doubleTopRight: "╗",
  doubleBottomLeft: "╚",
  doubleBottomRight: "╝",
  doubleHorizontal: "═",
  doubleVertical: "║",
  
  // Heavy line (for emphasis)
  heavyHorizontal: "━",
} as const;

// ─────────────────────────────────────────────────────────────
// Item Name Abbreviations
// ─────────────────────────────────────────────────────────────

/**
 * Common abbreviations for long item names.
 * Used to make tables more readable.
 */
const ITEM_ABBREVIATIONS: [RegExp, string][] = [
  [/Boots of Bearing/i, "Boots Brng"],
  [/Guardian Greaves/i, "Guardian G"],
  [/Black King Bar/i, "BKB"],
  [/Drum of Endurance/i, "Drum"],
  [/Ring of Basilius/i, "Ring of Ba"],
  [/Medallion of Courage/i, "Medallion"],
  [/Solar Crest/i, "Solar Crst"],
  [/Tranquil Boots/i, "Tranquil B"],
  [/Power Treads/i, "Power Trea"],
  [/Phase Boots/i, "Phase Boot"],
  [/Arcane Boots/i, "Arcane Boo"],
  [/Falcon Blade/i, "Falcon Bld"],
  [/Oblivion Staff/i, "Oblivion S"],
  [/Force Staff/i, "Force Stff"],
  [/Witch Blade/i, "Witch Blad"],
  [/Orchid Malevolence/i, "Orchid"],
  [/Hurricane Pike/i, "Hurr Pike"],
  [/Sange and Yasha/i, "S&Y"],
  [/Kaya and Sange/i, "K&S"],
  [/Yasha and Kaya/i, "Y&K"],
  [/Mekansm/i, "Mekansm"],
  [/Vladmir's Offering/i, "Vlads"],
  [/Pipe of Insight/i, "Pipe"],
  [/Assault Cuirass/i, "AC"],
  [/Shiva's Guard/i, "Shiva's"],
  [/Scythe of Vyse/i, "Hex"],
  [/Monkey King Bar/i, "MKB"],
  [/Eye of Skadi/i, "Skadi"],
  [/Daedalus/i, "Daedalus"],
  [/Butterfly/i, "Butterfly"],
  [/Satanic/i, "Satanic"],
  [/Heart of Tarrasque/i, "Heart"],
  [/Linken's Sphere/i, "Linkens"],
  [/Lotus Orb/i, "Lotus"],
  [/Aeon Disk/i, "Aeon Disk"],
  [/Refresher Orb/i, "Refresher"],
  [/Octarine Core/i, "Octarine"],
  [/Gleipnir/i, "Gleipnir"],
  [/Bloodthorn/i, "Bloodthorn"],
  [/Nullifier/i, "Nullifier"],
  [/Abyssal Blade/i, "Abyssal"],
  [/Overwhelming Blink/i, "O. Blink"],
  [/Swift Blink/i, "S. Blink"],
  [/Arcane Blink/i, "A. Blink"],
  [/Eul's Scepter/i, "Euls"],
  [/Glimmer Cape/i, "Glimmer"],
  [/Holy Locket/i, "H. Locket"],
  [/Spirit Vessel/i, "Vessel"],
  [/Urn of Shadows/i, "Urn"],
  [/Veil of Discord/i, "Veil"],
  [/Rod of Atos/i, "Atos"],
  [/Ethereal Blade/i, "E-Blade"],
  [/Aghanim's Scepter/i, "Aghs"],
  [/Aghanim's Shard/i, "Shard"],
];

// ─────────────────────────────────────────────────────────────
// Text Formatting Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Truncate item display name to fit, preferring known abbreviations.
 */
export function truncateItemName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  
  // Try known abbreviations first
  for (const [pattern, abbrev] of ITEM_ABBREVIATIONS) {
    if (pattern.test(name) && abbrev.length <= maxLen) {
      return abbrev;
    }
  }
  
  // Fall back to simple truncation with ellipsis
  return name.substring(0, maxLen - 1) + "…";
}

/**
 * Pad a string to a fixed width, truncating if necessary.
 */
export function padTruncate(str: string, width: number, align: "left" | "right" = "left"): string {
  if (str.length > width) {
    return str.substring(0, width - 1) + "…";
  }
  return align === "left" ? str.padEnd(width) : str.padStart(width);
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return (value * 100).toFixed(decimals) + "%";
}

/**
 * Format a gold value.
 */
export function formatGold(value: number): string {
  return value.toString() + "g";
}

// ─────────────────────────────────────────────────────────────
// Table Building Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Create a horizontal line for a table.
 */
export function horizontalLine(
  widths: number[],
  left: string,
  middle: string,
  right: string,
  fill: string = BOX.horizontal
): string {
  return left + widths.map(w => fill.repeat(w)).join(middle) + right;
}

/**
 * Create a table row.
 */
export function tableRow(cells: string[], widths: number[]): string {
  const paddedCells = cells.map((cell, i) => {
    const width = widths[i] - 2; // Account for padding
    return " " + padTruncate(cell, width) + " ";
  });
  return BOX.vertical + paddedCells.join(BOX.vertical) + BOX.vertical;
}

/**
 * Options for building a simple table.
 */
export interface SimpleTableOptions {
  /** Column headers */
  headers: string[];
  /** Column widths (including borders) */
  widths: number[];
  /** Data rows */
  rows: string[][];
}

/**
 * Build a simple ASCII table.
 */
export function buildTable(options: SimpleTableOptions): string {
  const { headers, widths, rows } = options;
  const lines: string[] = [];
  
  // Top border
  lines.push(horizontalLine(widths, BOX.topLeft, BOX.teeDown, BOX.topRight));
  
  // Header row
  lines.push(tableRow(headers, widths));
  
  // Header separator
  lines.push(horizontalLine(widths, BOX.teeRight, BOX.cross, BOX.teeLeft));
  
  // Data rows
  for (const row of rows) {
    lines.push(tableRow(row, widths));
  }
  
  // Bottom border
  lines.push(horizontalLine(widths, BOX.bottomLeft, BOX.teeUp, BOX.bottomRight));
  
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Decorative Headers
// ─────────────────────────────────────────────────────────────

/**
 * Create a double-line bordered header box.
 */
export function headerBox(title: string, width: number = 68): string {
  const lines: string[] = [];
  const paddedTitle = "  " + title.padEnd(width - 4) + "  ";
  
  lines.push(BOX.doubleTopLeft + BOX.doubleHorizontal.repeat(width) + BOX.doubleTopRight);
  lines.push(BOX.doubleVertical + paddedTitle.substring(0, width) + BOX.doubleVertical);
  lines.push(BOX.doubleBottomLeft + BOX.doubleHorizontal.repeat(width) + BOX.doubleBottomRight);
  
  return lines.join("\n");
}

/**
 * Create a section header with heavy line.
 */
export function sectionHeader(title: string, width: number = 68): string {
  return BOX.heavyHorizontal.repeat(width) + "\n" + title + "\n" + BOX.heavyHorizontal.repeat(width);
}

/**
 * Create a simple underlined header.
 */
export function underlinedHeader(title: string): string {
  return title + "\n" + BOX.horizontal.repeat(title.length);
}
