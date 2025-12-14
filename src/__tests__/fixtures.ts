import { Item } from "../models/types";

/**
 * Simplified test fixtures with predictable values for precise test assertions.
 * 
 * Design principles:
 * - Simple costs (round numbers) for easy math
 * - Clear stat values that make efficiency calculations predictable
 * - Controlled component relationships for upgrade path testing
 * 
 * Key concept for gold recovery:
 * - Recipe cost is ALWAYS recovered (Gyro innate)
 * - Component gold is only recovered if that component can build into a late game item (>= 2500g)
 * - Gold recovery = (usableComponentsGold + recipeCost) / itemCost
 */

// ============================================================================
// Base Components (single-stat items for stat valuation baseline)
// ============================================================================

/** 100g for 2 str = 50g per strength point */
export const strengthComponent: Item = {
  id: "strength_component",
  name: "strength_component",
  displayName: "Strength Component",
  cost: 100,
  stats: { strength: 2 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 100g for 2 agi = 50g per agility point */
export const agilityComponent: Item = {
  id: "agility_component",
  name: "agility_component",
  displayName: "Agility Component",
  cost: 100,
  stats: { agility: 2 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 100g for 2 int = 50g per intelligence point */
export const intelligenceComponent: Item = {
  id: "intelligence_component",
  name: "intelligence_component",
  displayName: "Intelligence Component",
  cost: 100,
  stats: { intelligence: 2 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 100g for 1 armor = 100g per armor point */
export const armorComponent: Item = {
  id: "armor_component",
  name: "armor_component",
  displayName: "Armor Component",
  cost: 100,
  stats: { armor: 1 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 100g for 1 hp regen = 100g per hp regen point */
export const regenComponent: Item = {
  id: "regen_component",
  name: "regen_component",
  displayName: "Regen Component",
  cost: 100,
  stats: { healthRegen: 1 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 100g for 0.5 mana regen = 200g per mana regen point */
export const manaRegenComponent: Item = {
  id: "mana_regen_component",
  name: "mana_regen_component",
  displayName: "Mana Regen Component",
  cost: 100,
  stats: { manaRegen: 0.5 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 200g for 20 move speed = 10g per move speed point */
export const moveSpeedComponent: Item = {
  id: "move_speed_component",
  name: "move_speed_component",
  displayName: "Move Speed Component",
  cost: 200,
  stats: { moveSpeed: 20 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 
 * Damage component - a basic component that builds into mixedRecoveryItem.
 * Used to test mixed recovery scenarios where some components are more
 * broadly useful than others.
 */
export const damageComponent: Item = {
  id: "damage_component",
  name: "damage_component",
  displayName: "Damage Component",
  cost: 100,
  stats: { damage: 5 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/**
 * Dead-end component - used ONLY in poorRecoveryItem.
 * When analyzing poorRecoveryItem's disassemble potential, this component
 * has no other upgrade targets (since we exclude the source item), making
 * it a "dead end" in the upgrade tree.
 */
export const deadEndComponent: Item = {
  id: "dead_end_component",
  name: "dead_end_component",
  displayName: "Dead End Component",
  cost: 100,
  stats: { damage: 3 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

// ============================================================================
// Boot Components and Boots
// ============================================================================

/** Basic boots component: 300g for 30 move speed */
export const basicBoots: Item = {
  id: "boots",
  name: "boots",
  displayName: "Basic Boots",
  cost: 300,
  stats: { moveSpeed: 30 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/** 
 * Upgraded boots: 500g (boots 300 + strength 100 + 100 recipe)
 * Components: boots + strength_component
 * 
 * If strength_component is usable (appears in late items): 
 *   recovery = (300 + 100 + 100) / 500 = 100%
 * If boots is not usable but strength is:
 *   recovery = (100 + 100) / 500 = 40%
 */
export const upgradedBoots: Item = {
  id: "tranquil_boots",
  name: "tranquil_boots",
  displayName: "Upgraded Boots",
  cost: 500,
  stats: { moveSpeed: 30, strength: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["boots", "strength_component"],
};

/** 
 * Fancy boots: 600g (boots 300 + move_speed 200 + 100 recipe)
 */
export const fancyBoots: Item = {
  id: "arcane_boots",
  name: "arcane_boots",
  displayName: "Fancy Boots",
  cost: 600,
  stats: { moveSpeed: 50, mana: 100 },
  isComponent: false,
  isConsumable: false,
  components: ["boots", "move_speed_component"],
};

// ============================================================================
// Early Game Items (< 1700g)
// ============================================================================

/**
 * Perfect recovery item: 200g (100 str + 100 agi), no recipe
 * Both components appear in late game items
 * Recovery = (100 + 100 + 0) / 200 = 100%
 */
export const perfectRecoveryItem: Item = {
  id: "perfect_recovery",
  name: "perfect_recovery",
  displayName: "Perfect Recovery Item",
  cost: 200,
  stats: { strength: 2, agility: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "agility_component"],
};

/**
 * Good recovery item: 400g (100 str + 100 int + 200 recipe)
 * Both components usable, recipe recovered
 * Recovery = (100 + 100 + 200) / 400 = 100%
 */
export const goodRecoveryItem: Item = {
  id: "good_recovery",
  name: "good_recovery",
  displayName: "Good Recovery Item",
  cost: 400,
  stats: { strength: 2, intelligence: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "intelligence_component"],
};

/**
 * Mixed recovery item: 300g (100 str + 100 damage + 100 recipe)
 * Both components are usable (build into other items)
 * Recovery = (100 + 100 + 100) / 300 = 100%
 */
export const mixedRecoveryItem: Item = {
  id: "mixed_recovery",
  name: "mixed_recovery",
  displayName: "Mixed Recovery Item",
  cost: 300,
  stats: { strength: 2, damage: 5 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "damage_component"],
};

/**
 * Poor recovery item: 400g (100 dead_end + 100 dead_end + 200 recipe)
 * Uses dead_end_component which only builds into this item.
 * When analyzing this item's disassemble potential, dead_end_component
 * has no other targets (excluding this item itself), so recovery = 50%
 */
export const poorRecoveryItem: Item = {
  id: "poor_recovery",
  name: "poor_recovery",
  displayName: "Poor Recovery Item",
  cost: 400,
  stats: { damage: 6 },
  isComponent: false,
  isConsumable: false,
  components: ["dead_end_component", "dead_end_component"],
};

/**
 * Multi-component item: 400g (100 str + 100 agi + 100 int + 100 recipe)
 * All components usable
 * Recovery = (300 + 100) / 400 = 100%
 */
export const multiComponentItem: Item = {
  id: "multi_component",
  name: "multi_component",
  displayName: "Multi Component Item",
  cost: 400,
  stats: { strength: 2, agility: 2, intelligence: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "agility_component", "intelligence_component"],
};

/**
 * Regen item: 300g (100 regen + 100 int + 100 recipe)
 * Both components usable (int in fullyReachable, regen in keyUtilityItem)
 * Recovery = (200 + 100) / 300 = 100%
 */
export const regenItem: Item = {
  id: "regen_item",
  name: "regen_item",
  displayName: "Regen Item",
  cost: 300,
  stats: { healthRegen: 1, intelligence: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["regen_component", "intelligence_component"],
};

// ============================================================================
// Late Game Items (>= 2500g) - These determine which components are "usable"
// ============================================================================

/**
 * Fully reachable late item: 3000g
 * Uses: strength + agility + intelligence (all from early items)
 * This makes all three stat components "usable"
 */
export const fullyReachableLateItem: Item = {
  id: "fully_reachable",
  name: "fully_reachable",
  displayName: "Fully Reachable Late Item",
  cost: 3000,
  stats: { strength: 10, agility: 10, intelligence: 10 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "agility_component", "intelligence_component"],
};

/**
 * Boots late item: 2500g
 * Uses: boots + move_speed_component
 * This makes boots and move_speed "usable"
 */
export const bootsLateItem: Item = {
  id: "boots_late",
  name: "boots_late",
  displayName: "Boots Late Item",
  cost: 2500,
  stats: { moveSpeed: 100 },
  isComponent: false,
  isConsumable: false,
  components: ["boots", "move_speed_component"],
};

/**
 * Partially reachable late item: 3000g
 * Uses: strength (usable) + orphan (not usable - creates the orphan)
 * Wait - orphan IS used here, so it's not orphan anymore...
 * 
 * Let's use a NEW orphan that truly doesn't appear in any late game item
 */
export const partiallyReachableLateItem: Item = {
  id: "partially_reachable",
  name: "partially_reachable",
  displayName: "Partially Reachable Late Item",
  cost: 3000,
  stats: { strength: 10, damage: 20 },
  isComponent: false,
  isConsumable: false,
  components: ["strength_component", "truly_orphan_component"],
};

/** Truly orphan component - used ONLY in partially reachable late item, but
 *  since that's the only late item using it, it doesn't appear in disassemblable
 *  early items, making it an orphan from the early-item perspective */
export const trulyOrphanComponent: Item = {
  id: "truly_orphan_component",
  name: "truly_orphan_component",
  displayName: "Truly Orphan Component",
  cost: 500,
  stats: { damage: 10 },
  isComponent: true,
  isConsumable: false,
  components: [],
};

/**
 * Unreachable late item: 2500g
 * Uses: only truly_orphan_component (not available from any early item)
 */
export const unreachableLateItem: Item = {
  id: "unreachable",
  name: "unreachable",
  displayName: "Unreachable Late Item",
  cost: 2500,
  stats: { damage: 30 },
  isComponent: false,
  isConsumable: false,
  components: ["truly_orphan_component"],
};

/**
 * Key utility item (force_staff): 2500g
 * Uses: intelligence + regen (both from early items)
 * This makes both components "usable"
 */
export const keyUtilityItem: Item = {
  id: "force_staff",
  name: "force_staff",
  displayName: "Force Staff",
  cost: 2500,
  stats: { intelligence: 10, healthRegen: 2 },
  isComponent: false,
  isConsumable: false,
  components: ["intelligence_component", "regen_component"],
};

/**
 * Armor late item: 2500g
 * Uses: armor + mana_regen
 * This makes both components "usable"
 */
export const armorLateItem: Item = {
  id: "armor_late",
  name: "armor_late",
  displayName: "Armor Late Item",
  cost: 2500,
  stats: { armor: 10, manaRegen: 5 },
  isComponent: false,
  isConsumable: false,
  components: ["armor_component", "mana_regen_component"],
};

/**
 * Damage late item: 2500g
 * Uses: damage_component + strength_component
 * This makes damage_component "usable" (so mixedRecoveryItem has 100% recovery)
 */
export const damageLateItem: Item = {
  id: "damage_late",
  name: "damage_late",
  displayName: "Damage Late Item",
  cost: 2500,
  stats: { damage: 50, strength: 10 },
  isComponent: false,
  isConsumable: false,
  components: ["damage_component", "strength_component"],
};

// ============================================================================
// Collection Helpers
// ============================================================================

/** All base components for stat valuation */
export function getBaseComponents(): Item[] {
  return [
    strengthComponent,
    agilityComponent,
    intelligenceComponent,
    armorComponent,
    regenComponent,
    manaRegenComponent,
    moveSpeedComponent,
    basicBoots,
    damageComponent,
    deadEndComponent,
    trulyOrphanComponent,
  ];
}

/** All early game items (for disassemble analysis) */
export function getEarlyItems(): Item[] {
  return [
    perfectRecoveryItem,
    goodRecoveryItem,
    mixedRecoveryItem,
    poorRecoveryItem,
    multiComponentItem,
    regenItem,
    upgradedBoots,
    fancyBoots,
  ];
}

/** All late game items */
export function getLateItems(): Item[] {
  return [
    fullyReachableLateItem,
    bootsLateItem,
    partiallyReachableLateItem,
    unreachableLateItem,
    keyUtilityItem,
    armorLateItem,
    damageLateItem,
  ];
}

/** Complete test item set */
export function getAllTestItems(): Item[] {
  return [...getBaseComponents(), ...getEarlyItems(), ...getLateItems()];
}

/** Minimal set for simple tests */
export function getMinimalTestItems(): Item[] {
  return [
    strengthComponent,
    agilityComponent,
    intelligenceComponent,
    perfectRecoveryItem,
  ];
}

// ============================================================================
// Test Constants (for assertions)
// ============================================================================

/** Expected gold per stat point based on our components */
export const EXPECTED_STAT_VALUES = {
  strength: 50,      // 100g / 2 points
  agility: 50,       // 100g / 2 points
  intelligence: 50,  // 100g / 2 points
  armor: 100,        // 100g / 1 point
  healthRegen: 100,  // 100g / 1 point
  manaRegen: 200,    // 100g / 0.5 points
  moveSpeed: 10,     // 200g / 20 points
};

/**
 * Expected recovery rates for early items
 * 
 * Recovery = (usableComponentsGold + recipeCost) / itemCost
 * 
 * Components are "usable" if they build into ANY upgraded item OTHER than the
 * item being disassembled. This prevents circular logic where an item's component
 * is considered usable just because it builds into that same item.
 * 
 * Usable components in our fixtures:
 * - strength_component (builds into many items)
 * - agility_component (builds into many items)
 * - intelligence_component (builds into many items)
 * - armor_component (builds into armorLateItem)
 * - regen_component (builds into keyUtilityItem, regenItem)
 * - mana_regen_component (builds into armorLateItem)
 * - move_speed_component (builds into bootsLateItem, fancyBoots)
 * - boots (builds into bootsLateItem, upgradedBoots, fancyBoots)
 * - damage_component (builds into mixedRecoveryItem)
 * 
 * Dead-end components (not usable when analyzing their only item):
 * - dead_end_component (only builds into poorRecoveryItem, excluded when analyzing it)
 * - truly_orphan_component (only appears in late items, not early items)
 */
export const EXPECTED_RECOVERY_RATES = {
  // 200g (100 str + 100 agi), both usable, no recipe
  // Recovery = (100 + 100 + 0) / 200 = 100%
  perfectRecoveryItem: 1.0,
  
  // 400g (100 str + 100 int + 200 recipe), both usable
  // Recovery = (100 + 100 + 200) / 400 = 100%
  goodRecoveryItem: 1.0,
  
  // 300g (100 str + 100 damage + 100 recipe), both usable
  // Recovery = (100 + 100 + 100) / 300 = 100%
  mixedRecoveryItem: 1.0,
  
  // 400g (100 dead_end + 100 dead_end + 200 recipe)
  // dead_end_component only builds into poorRecoveryItem (excluded), so not usable
  // Recovery = (0 + 200) / 400 = 50%
  poorRecoveryItem: 0.5,
  
  // 400g (100 str + 100 agi + 100 int + 100 recipe), all usable
  // Recovery = (300 + 100) / 400 = 100%
  multiComponentItem: 1.0,
  
  // 500g (300 boots usable + 100 str usable + 100 recipe)
  // Recovery = (300 + 100 + 100) / 500 = 100%
  upgradedBoots: 1.0,
  
  // 600g (300 boots usable + 200 move_speed usable + 100 recipe)
  // Recovery = (300 + 200 + 100) / 600 = 100%
  fancyBoots: 1.0,
};

/** Minimum gold recovery threshold used in upgradePaths.ts */
export const MIN_GOLD_RECOVERY_THRESHOLD = 0.65;

/** Maximum cost for early game items in transition analysis */
export const EARLY_GAME_MAX_COST = 2000;
