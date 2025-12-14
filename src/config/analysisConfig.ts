/**
 * Configuration for item analysis thresholds and parameters
 */
export interface AnalysisThresholds {
  /** Minimum gold recovery % to consider an item for disassemble (default: 0.65) */
  minGoldRecovery: number;
  /** 
   * Multiplier for aura stats to account for team-wide benefit.
   * 1.0 = solo (only affects yourself)
   * 2.5 = average teamfight (yourself + ~1.5 teammates in range)
   * 5.0 = full team (yourself + 4 teammates)
   * Default: 1.0 (show raw single-hero values)
   */
  auraMultiplier: number;
  /**
   * Maximum cost for items considered "early game" for transition analysis.
   * Items above this cost are unlikely to be disassembled in practice.
   * Default: 2000 (covers most early game items like Drums, Mek, etc.)
   */
  earlyGameMaxCost: number;
}

/**
 * Weights for synergy score calculation
 */
export interface SynergyWeights {
  /** Weight for best gold contribution percentage */
  goldContribution: number;
  /** Weight for value/cost efficiency */
  valueEfficiency: number;
  /** Weight for average recovery percentage */
  recovery: number;
  /** Weight for number of shared upgrade targets */
  sharedTargets: number;
  /** Weight for three-way contribution bonus (boot trios only) */
  threeWayBonus: number;
}

/**
 * Complete analysis configuration
 */
export interface AnalysisConfig {
  thresholds: AnalysisThresholds;
  /** Weights for pair synergy scoring */
  pairSynergyWeights: SynergyWeights;
  /** Weights for trio synergy scoring */
  trioSynergyWeights: SynergyWeights;
  /** Boot item internal names (movement speed doesn't stack) */
  bootItems: string[];
  /** Key utility items to analyze regardless of cost */
  keyUtilityItems: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AnalysisConfig = {
  thresholds: {
    minGoldRecovery: 0.65,
    auraMultiplier: 1.0,
    earlyGameMaxCost: 2000,
  },
  pairSynergyWeights: {
    goldContribution: 0.35,
    valueEfficiency: 0.25,
    recovery: 0.20,
    sharedTargets: 0.20,
    threeWayBonus: 0, // Not used for pairs
  },
  trioSynergyWeights: {
    goldContribution: 0.30,
    valueEfficiency: 0.20,
    recovery: 0.20,
    sharedTargets: 0.15,
    threeWayBonus: 0.15,
  },
  bootItems: [
    "boots",
    "tranquil_boots",
    "power_treads",
    "phase_boots",
    "arcane_boots",
    "guardian_greaves",
    "boots_of_bearing",
    "travel_boots",
    "travel_boots_2",
    "hermes_sandals",
  ],
  keyUtilityItems: [
    "force_staff",
    "euls_scepter",
    "drum_of_endurance",
    "glimmer_cape",
    "solar_crest",
    "lotus_orb",
    "pipe",
    "crimson_guard",
    "guardian_greaves",
    "mekansm",
    "rod_of_atos",
    "aeon_disk",
    "blink",
    "boots_of_bearing",
    "spirit_vessel",
    "holy_locket",
    "veil_of_discord",
  ],
};

/**
 * Merge partial config with defaults
 */
export function mergeConfig(partial: Partial<AnalysisConfig> = {}): AnalysisConfig {
  return {
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...partial.thresholds },
    pairSynergyWeights: { ...DEFAULT_CONFIG.pairSynergyWeights, ...partial.pairSynergyWeights },
    trioSynergyWeights: { ...DEFAULT_CONFIG.trioSynergyWeights, ...partial.trioSynergyWeights },
    bootItems: partial.bootItems ?? DEFAULT_CONFIG.bootItems,
    keyUtilityItems: partial.keyUtilityItems ?? DEFAULT_CONFIG.keyUtilityItems,
  };
}

/**
 * Helper to check if an item is a boot
 */
export function isBootItem(itemName: string, config: AnalysisConfig = DEFAULT_CONFIG): boolean {
  return config.bootItems.includes(itemName);
}
