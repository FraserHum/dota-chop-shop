import { Item, ItemStats } from "../models/types";
import https from "https";

const OPENDOTA_ITEMS_URL = "https://api.opendota.com/api/constants/items";

/**
 * Maps OpenDota API stat keys to our ItemStats keys
 */
const STAT_MAPPING: Record<string, keyof ItemStats> = {
  // Primary attributes
  bonus_strength: "strength",
  bonus_str: "strength",
  strength: "strength",
  bonus_agility: "agility",
  bonus_agi: "agility",
  bonus_intellect: "intelligence",
  bonus_intelligence: "intelligence",
  bonus_int: "intelligence",

  // Offensive stats
  bonus_damage: "damage",
  attack_damage: "damage",
  bonus_attack_speed: "attackSpeed",
  attack_speed: "attackSpeed",
  attack_speed_bonus: "attackSpeed",
  bonus_spell_amp: "spellAmplification",
  spell_amp: "spellAmplification",

  // Defensive stats
  armor: "armor",
  bonus_armor: "armor",
  bonus_magic_resistance: "magicResistance",
  bonus_magical_armor: "magicResistance",
  magic_resistance: "magicResistance",
  bonus_evasion: "evasion",
  evasion: "evasion",
  bonus_health: "health",
  bonus_hp: "health",
  health: "health",
  health_bonus: "health",
  bonus_mana: "mana",
  mana: "mana",
  status_resistance: "statusResistance",

  // Regeneration
  bonus_health_regen: "healthRegen",
  bonus_hp_regen: "healthRegen",
  hp_regen: "healthRegen",
  health_regen: "healthRegen",
  bonus_mana_regen: "manaRegen",
  bonus_mp_regen: "manaRegen",
  mana_regen: "manaRegen",
  mp_regen: "manaRegen",
  bonus_lifesteal: "lifesteal",
  lifesteal: "lifesteal",
  lifesteal_percent: "lifesteal",
  bonus_spell_lifesteal: "spellLifesteal",
  spell_lifesteal: "spellLifesteal",

  // Mobility
  movement_speed: "moveSpeed",
  bonus_movement_speed: "moveSpeed",
  bonus_move_speed: "moveSpeed",
  bonus_movement_speed_pct: "moveSpeedPercent",
  movement_speed_percent_bonus: "moveSpeedPercent",

  // Other
  bonus_attack_range: "attackRange",
  attack_range: "attackRange",
  attack_range_bonus: "attackRange",
  bonus_cast_range: "castRange",
  cast_range: "castRange",
  cast_range_bonus: "castRange",
  bonus_cooldown: "cooldownReduction",
  cooldown_reduction: "cooldownReduction",

  // Aura stats (positive auras that benefit the holder)
  aura_armor: "armor",
  armor_aura: "armor",
  aura_positive_armor: "armor",
  bonus_aoe_armor: "armor",
  aura_attack_speed: "attackSpeed",
  aura_health_regen: "healthRegen",
  aura_mana_regen: "manaRegen",
  mana_regen_aura: "manaRegen",
  lifesteal_aura: "lifesteal",
  aura_movement_speed: "moveSpeed",
  magic_resistance_aura: "magicResistance",
};

/**
 * Known consumable item IDs
 */
const CONSUMABLE_ITEMS = new Set([
  "tango",
  "tango_single",
  "clarity",
  "flask",
  "faerie_fire",
  "enchanted_mango",
  "ward_observer",
  "ward_sentry",
  "ward_dispenser",
  "smoke_of_deceit",
  "tome_of_knowledge",
  "dust",
  "bottle",
  "cheese",
  "refresher_shard",
  "aghanims_shard",
  "ultimate_scepter_roshan",
  "blood_grenade",
  "infused_raindrop",
]);

/**
 * Items that have been removed from the game but may still appear in API
 */
const REMOVED_ITEMS = new Set([
  "wraith_pact",
  "necronomicon",
  "necronomicon_2", 
  "necronomicon_3",
]);

interface OpenDotaItem {
  id: number;
  dname?: string;
  cost?: number;
  attrib?: Array<{ key: string; value: string }>;
  components?: string[] | null;
  tier?: number;
  charges?: boolean | number;
}

/**
 * Keys that represent negative auras (affect enemies, not the holder)
 */
const NEGATIVE_AURA_KEYS = new Set([
  "aura_negative_armor",
  "aura_negative_armor_radius",
]);

/**
 * Keys that represent positive aura stats (benefit the whole team)
 * These get a multiplier since they affect ~2.5 heroes on average
 */
const POSITIVE_AURA_KEYS = new Set([
  "aura_armor",
  "armor_aura",
  "aura_positive_armor",
  "bonus_aoe_armor",
  "aura_attack_speed",
  "aura_health_regen",
  "aura_mana_regen",
  "mana_regen_aura",
  "lifesteal_aura",
  "aura_movement_speed",
  "magic_resistance_aura",
]);

/**
 * Default multiplier for aura stats (1.0 = single hero only)
 */
const DEFAULT_AURA_MULTIPLIER = 1.0;

/**
 * Keys that represent percentage-based bonuses (hero-dependent, not flat stats)
 */
const PERCENTAGE_AURA_KEYS = new Set([
  "damage_aura", // % bonus damage based on hero's base damage
]);

/**
 * Keys for conditional bonuses that only apply in special circumstances
 */
const CONDITIONAL_BONUS_KEYS = new Set([
  "aura_health_regen_bonus", // Guardian Greaves - only below 25% health
  "aura_armor_bonus", // Guardian Greaves - only below 25% health
]);

/**
 * Extract stats from an OpenDota item object
 */
function extractStats(itemData: OpenDotaItem, auraMultiplier: number = DEFAULT_AURA_MULTIPLIER): ItemStats {
  const stats: ItemStats = {};

  if (!itemData.attrib || !Array.isArray(itemData.attrib)) {
    return stats;
  }

  for (const attr of itemData.attrib) {
    const key = attr.key;
    const value = parseFloat(attr.value) || 0;

    if (value === 0) continue;

    // Skip negative auras (they affect enemies, not the holder)
    if (NEGATIVE_AURA_KEYS.has(key)) continue;

    // Skip percentage-based auras (hero-dependent values)
    if (PERCENTAGE_AURA_KEYS.has(key)) continue;

    // Skip conditional bonuses (only apply in special circumstances)
    if (CONDITIONAL_BONUS_KEYS.has(key)) continue;

    // Skip negative values for aura stats (e.g., enemy debuffs)
    if (key.includes("aura") && value < 0) continue;

    // Handle bonus_all_stats by distributing to individual attributes
    if (key === "bonus_all_stats" || key === "bonus_stats") {
      stats.strength = (stats.strength || 0) + value;
      stats.agility = (stats.agility || 0) + value;
      stats.intelligence = (stats.intelligence || 0) + value;
    } else if (STAT_MAPPING[key]) {
      const statKey = STAT_MAPPING[key];
      // Apply aura multiplier for team-wide benefits
      const effectiveValue = POSITIVE_AURA_KEYS.has(key) ? value * auraMultiplier : value;
      stats[statKey] = (stats[statKey] || 0) + effectiveValue;
    }
  }

  return stats;
}

/**
 * Options for fetching items
 */
export interface FetchItemsOptions {
  /** 
   * Multiplier for aura stats to account for team-wide benefit.
   * 1.0 = solo (only affects yourself)
   * 2.5 = average teamfight (yourself + ~1.5 teammates in range)
   * 5.0 = full team (yourself + 4 teammates)
   * Default: 1.0
   */
  auraMultiplier?: number;
}

/**
 * Fetch item data from OpenDota API
 */
export async function fetchItemsFromAPI(options: FetchItemsOptions = {}): Promise<Item[]> {
  const { auraMultiplier = DEFAULT_AURA_MULTIPLIER } = options;
  
  return new Promise((resolve, reject) => {
    https
      .get(OPENDOTA_ITEMS_URL, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const rawItems = JSON.parse(data) as Record<string, OpenDotaItem>;
            const items: Item[] = [];

            for (const [itemId, itemData] of Object.entries(rawItems)) {
              // Skip items without cost
              if (!itemData.cost || itemData.cost === 0) continue;

              // Skip neutral items (they have tier property)
              if (itemData.tier !== undefined && itemData.tier !== null) continue;

              // Skip recipe items
              if (itemId.startsWith("recipe_")) continue;

              // Skip removed items
              if (REMOVED_ITEMS.has(itemId)) continue;

              items.push({
                id: itemId,
                name: itemId,
                displayName: itemData.dname || itemId,
                cost: itemData.cost,
                stats: extractStats(itemData, auraMultiplier),
                isComponent: !itemData.components || itemData.components.length === 0,
                isConsumable: CONSUMABLE_ITEMS.has(itemId) || itemData.charges === true,
                components: itemData.components || [],
              });
            }

            resolve(items);
          } catch (err) {
            reject(new Error(`Failed to parse OpenDota API response: ${err}`));
          }
        });
      })
      .on("error", (err) => {
        reject(new Error(`Failed to fetch from OpenDota API: ${err.message}`));
      });
  });
}
