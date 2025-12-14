/**
 * Stats that items can provide in Dota 2
 */
export interface ItemStats {
  strength?: number;
  agility?: number;
  intelligence?: number;
  damage?: number;
  attackSpeed?: number;
  armor?: number;
  magicResistance?: number;
  evasion?: number;
  health?: number;
  mana?: number;
  healthRegen?: number;
  manaRegen?: number;
  lifesteal?: number;
  spellLifesteal?: number;
  spellAmplification?: number;
  moveSpeed?: number;
  moveSpeedPercent?: number;
  attackRange?: number;
  castRange?: number;
  cooldownReduction?: number;
  statusResistance?: number;
}

/**
 * Represents a Dota 2 item
 */
export interface Item {
  id: string;
  name: string;
  displayName: string;
  cost: number;
  stats: ItemStats;
  isComponent: boolean;
  isConsumable: boolean;
  components: string[];
}

/**
 * Gold cost per 1 unit of each stat type
 */
export type StatValuation = {
  [K in keyof ItemStats]: number;
};

/**
 * Result of efficiency calculation for an item
 */
export interface EfficiencyResult {
  item: Item;
  totalStatValue: number;
  utilityValue: number;
  totalValue: number;
  efficiency: number;
  efficiencyWithUtility: number;
  statBreakdown: {
    stat: keyof ItemStats;
    amount: number;
    goldValue: number;
  }[];
}
