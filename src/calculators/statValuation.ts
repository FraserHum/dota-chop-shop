import { Item, ItemStats, StatValuation } from "../models/types";
import { orderBy } from "es-toolkit";

/**
 * Check if an item provides only a single stat type
 */
function isSingleStatItem(item: Item): boolean {
  const statEntries = Object.entries(item.stats).filter(
    ([, value]) => value !== undefined && value > 0
  );
  return statEntries.length === 1;
}

/**
 * Get the single stat and its value from a single-stat item
 */
function getSingleStat(item: Item): { stat: keyof ItemStats; value: number } | null {
  const statEntries = Object.entries(item.stats).filter(
    ([, value]) => value !== undefined && value > 0
  ) as [keyof ItemStats, number][];
  
  if (statEntries.length !== 1) return null;
  
  return { stat: statEntries[0][0], value: statEntries[0][1] };
}

/**
 * Calculate the gold cost per point for each stat type
 * by finding single-stat items and using the most cost-efficient one as baseline.
 */
export function calculateStatValuation(items: Item[]): StatValuation {
  // Track the best (lowest) gold-per-point ratio for each stat
  const bestRatios: Record<string, { goldPerPoint: number; itemName: string }> = {};

  // Find all single-stat items and track the best ratio for each stat
  for (const item of items) {
    // Skip consumables
    if (item.isConsumable) continue;
    
    if (!isSingleStatItem(item)) continue;
    
    const singleStat = getSingleStat(item);
    if (!singleStat) continue;
    
    const { stat, value } = singleStat;
    const goldPerPoint = item.cost / value;

    if (!bestRatios[stat] || goldPerPoint < bestRatios[stat].goldPerPoint) {
      bestRatios[stat] = { goldPerPoint, itemName: item.name };
    }
  }

  // Use the best ratios for valuation
  const valuation: StatValuation = {};
  for (const [stat, data] of Object.entries(bestRatios)) {
    valuation[stat as keyof ItemStats] = data.goldPerPoint;
  }

  // Second pass: for stats without baseline items, derive from component items
  // that have that stat plus other known stats
  deriveRemainingStats(items, valuation);

  return valuation;
}

/**
 * For stats that don't have single-stat items, derive their value
 * from items that have multiple stats (subtracting known stat values).
 * Uses the best (lowest) gold-per-point estimate.
 */
function deriveRemainingStats(items: Item[], valuation: StatValuation): void {
  const allStatKeys: (keyof ItemStats)[] = [
    "strength", "agility", "intelligence",
    "damage", "attackSpeed", "spellAmplification",
    "armor", "magicResistance", "evasion", "health", "mana", "statusResistance",
    "healthRegen", "manaRegen", "lifesteal", "spellLifesteal",
    "moveSpeed", "moveSpeedPercent",
    "attackRange", "castRange", "cooldownReduction"
  ];

  // Find stats that still need values
  const missingStats = allStatKeys.filter(stat => valuation[stat] === undefined);

  for (const missingStat of missingStats) {
    // Find component items that have this stat
    const itemsWithStat = items.filter(item => 
      item.isComponent && 
      !item.isConsumable &&
      item.stats[missingStat] !== undefined && 
      item.stats[missingStat]! > 0
    );

    if (itemsWithStat.length === 0) continue;

    let bestEstimate: number | null = null;

    for (const item of itemsWithStat) {
      // Calculate the known stat value for this item
      let knownStatValue = 0;
      let hasUnknownStats = false;

      for (const [stat, amount] of Object.entries(item.stats) as [keyof ItemStats, number][]) {
        if (stat === missingStat) continue;
        if (amount === undefined || amount === 0) continue;

        if (valuation[stat] !== undefined) {
          knownStatValue += amount * valuation[stat]!;
        } else {
          hasUnknownStats = true;
        }
      }

      // Only use this item if all other stats are known
      if (!hasUnknownStats && item.stats[missingStat]) {
        const remainingValue = item.cost - knownStatValue;
        if (remainingValue > 0) {
          const goldPerPoint = remainingValue / item.stats[missingStat]!;
          // Use the best (lowest) estimate
          if (bestEstimate === null || goldPerPoint < bestEstimate) {
            bestEstimate = goldPerPoint;
          }
        }
      }
    }

    if (bestEstimate !== null) {
      valuation[missingStat] = bestEstimate;
    }
  }
}

/**
 * Get a formatted display of stat valuations
 */
export function formatStatValuation(valuation: StatValuation): string {
  const lines: string[] = ["=== Stat Valuations (Gold per 1 point) ===", ""];

  const sortedStats = orderBy(
    Object.entries(valuation).filter(([, value]) => value !== undefined),
    [([, value]) => value as number],
    ['desc']
  );

  for (const [stat, goldPerPoint] of sortedStats) {
    lines.push(`${stat.padEnd(20)} ${goldPerPoint.toFixed(2).padStart(8)} gold`);
  }

  return lines.join("\n");
}
