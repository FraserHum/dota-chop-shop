/**
 * Utility categories and their gold value equivalents
 */
export enum UtilityCategory {
  Mobility = "mobility",
  Save = "save",
  Dispel = "dispel",
  Disable = "disable",
  TeamUtility = "teamUtility",
  SpellImmunity = "spellImmunity",
  DamageAmp = "damageAmp",
}

/**
 * Gold value assigned to each utility category
 */
export const UTILITY_VALUES: Record<UtilityCategory, number> = {
  [UtilityCategory.Mobility]: 1500,
  [UtilityCategory.Save]: 1200,
  [UtilityCategory.Dispel]: 1000,
  [UtilityCategory.Disable]: 1200,
  [UtilityCategory.TeamUtility]: 1000,
  [UtilityCategory.SpellImmunity]: 1500,
  [UtilityCategory.DamageAmp]: 800,
};

/**
 * Map of item names to their utility categories
 * Items can have multiple categories
 */
export const ITEM_UTILITY: Record<string, UtilityCategory[]> = {
  // Mobility
  blink: [UtilityCategory.Mobility],
  force_staff: [UtilityCategory.Mobility, UtilityCategory.Save],
  hurricane_pike: [UtilityCategory.Mobility, UtilityCategory.Save],
  travel_boots: [UtilityCategory.Mobility],
  travel_boots_2: [UtilityCategory.Mobility],
  swift_blink: [UtilityCategory.Mobility],
  arcane_blink: [UtilityCategory.Mobility],
  overwhelming_blink: [UtilityCategory.Mobility],

  // Save/Defensive
  glimmer_cape: [UtilityCategory.Save],
  aeon_disk: [UtilityCategory.Save],
  pavise: [UtilityCategory.Save],
  solar_crest: [UtilityCategory.Save, UtilityCategory.DamageAmp],
  sphere: [UtilityCategory.Save], // Linken's Sphere

  // Dispel
  cyclone: [UtilityCategory.Dispel, UtilityCategory.Disable], // Eul's
  lotus_orb: [UtilityCategory.Dispel, UtilityCategory.Save],
  manta: [UtilityCategory.Dispel],
  guardian_greaves: [UtilityCategory.Dispel, UtilityCategory.TeamUtility],
  wind_waker: [UtilityCategory.Dispel, UtilityCategory.Mobility, UtilityCategory.Save],

  // Disable/Control
  sheepstick: [UtilityCategory.Disable], // Scythe of Vyse
  abyssal_blade: [UtilityCategory.Disable],
  rod_of_atos: [UtilityCategory.Disable],
  gungir: [UtilityCategory.Disable], // Gleipnir
  orchid: [UtilityCategory.Disable, UtilityCategory.DamageAmp],
  bloodthorn: [UtilityCategory.Disable, UtilityCategory.DamageAmp],
  nullifier: [UtilityCategory.Disable],
  basher: [UtilityCategory.Disable],
  harpoon: [UtilityCategory.Disable, UtilityCategory.Mobility],

  // Team Utility
  mekansm: [UtilityCategory.TeamUtility],
  pipe: [UtilityCategory.TeamUtility, UtilityCategory.Save],
  drum_of_endurance: [UtilityCategory.TeamUtility],
  vladmir: [UtilityCategory.TeamUtility],
  assault: [UtilityCategory.TeamUtility], // Assault Cuirass aura
  boots_of_bearing: [UtilityCategory.TeamUtility, UtilityCategory.Mobility],

  // Spell Immunity
  black_king_bar: [UtilityCategory.SpellImmunity],

  // Damage Amp
  medallion_of_courage: [UtilityCategory.DamageAmp],
  veil_of_discord: [UtilityCategory.DamageAmp],
  ethereal_blade: [UtilityCategory.DamageAmp, UtilityCategory.Save],
};

/**
 * Calculate the total utility value for an item
 */
export function calculateUtilityValue(itemName: string): number {
  const categories = ITEM_UTILITY[itemName];
  if (!categories || categories.length === 0) {
    return 0;
  }

  return categories.reduce((total, category) => total + UTILITY_VALUES[category], 0);
}

/**
 * Get the utility categories for an item
 */
export function getItemUtilityCategories(itemName: string): UtilityCategory[] {
  return ITEM_UTILITY[itemName] || [];
}

/**
 * Get a formatted string of utility categories for display
 */
export function formatUtilityCategories(itemName: string): string {
  const categories = ITEM_UTILITY[itemName];
  if (!categories || categories.length === 0) {
    return "-";
  }
  return categories.join(", ");
}
