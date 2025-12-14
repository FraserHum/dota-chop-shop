import { Item, StatValuation } from "../models/types";
import { ItemRepository } from "../data/ItemRepository";
import { AnalysisConfig, mergeConfig } from "../config/analysisConfig";
import { calculateStatValuation } from "./statValuation";
import { calculateItemEfficiency } from "./efficiency";
import { collectAvailableComponents } from "./componentUtils";
import { countBy, orderBy, sumBy } from "es-toolkit";

/**
 * Pre-computed upgrade target information (any upgraded item)
 */
export interface UpgradeTarget {
  item: Item;
  baseComponents: string[];
  componentCounts: Map<string, number>;
  totalComponentCost: number;
  recipeCost: number;
}

/**
 * Disassemble candidate analysis data
 */
export interface DisassembleCandidateAnalysis {
  item: Item;
  goldEfficiency: number;
  totalValue: number;
  wastedGold: number;
  statValue: number;
  utilityValue: number;
  recipeCost: number;
  /** Combined score factoring in gold efficiency, value, and cost */
  disassembleScore: number;
}

/**
 * Calculate disassemble score for ranking candidates.
 * Score formula balances gold efficiency, value per gold, and cost preference.
 */
function calculateDisassembleScore(
  goldEfficiency: number,
  totalValue: number,
  cost: number
): number {
  if (cost <= 0) return 0;
  
  const valuePerGold = totalValue / cost;
  const costFactor = 1000 / cost;
  
  // Weights: 50% gold efficiency, 25% value efficiency, 25% cost preference
  return (goldEfficiency * 0.5) + (valuePerGold * 0.25) + (costFactor * 0.25);
}

/**
 * Shared analysis context that pre-computes common data.
 * Pass this to analysis functions to avoid redundant computation.
 */
export class AnalysisContext {
  readonly config: AnalysisConfig;
  readonly itemRepo: ItemRepository;
  readonly statValuation: StatValuation;

  // Lazy-initialized caches
  private _disassembleCandidates: DisassembleCandidateAnalysis[] | null = null;
  private _filteredCandidates: DisassembleCandidateAnalysis[] | null = null;
  private _availableComponents: Set<string> | null = null;
  private _upgradeTargets: UpgradeTarget[] | null = null;

  constructor(
    items: Item[],
    config: Partial<AnalysisConfig> = {}
  ) {
    this.config = mergeConfig(config);
    this.itemRepo = new ItemRepository(items);
    this.statValuation = calculateStatValuation(items);
  }

  /**
   * Get all items (convenience method)
   */
  get items(): Item[] {
    return this.itemRepo.getAll();
  }

  /**
   * Get disassemble candidate analyses (lazy computed).
   * These are ALL upgraded items, scored by disassemble potential.
   */
  get disassembleCandidates(): DisassembleCandidateAnalysis[] {
    if (!this._disassembleCandidates) {
      this._disassembleCandidates = this.computeDisassembleCandidates();
    }
    return this._disassembleCandidates;
  }

  /**
   * @deprecated Use disassembleCandidates instead
   */
  get earlyItemAnalyses(): DisassembleCandidateAnalysis[] {
    return this.disassembleCandidates;
  }

  /**
   * Get filtered candidates (meeting gold recovery threshold)
   */
  get filteredCandidates(): DisassembleCandidateAnalysis[] {
    if (!this._filteredCandidates) {
      this._filteredCandidates = this.disassembleCandidates.filter(
        a => a.goldEfficiency >= this.config.thresholds.minGoldRecovery
      );
    }
    return this._filteredCandidates;
  }

  /**
   * @deprecated Use filteredCandidates instead
   */
  get filteredEarlyAnalyses(): DisassembleCandidateAnalysis[] {
    return this.filteredCandidates;
  }

  /**
   * Get set of components available from filtered candidates (lazy computed)
   */
  get availableComponents(): Set<string> {
    if (!this._availableComponents) {
      this._availableComponents = collectAvailableComponents(
        this.filteredCandidates,
        this.itemRepo
      );
    }
    return this._availableComponents;
  }

  /**
   * Get all upgrade targets (any upgraded item, lazy computed)
   */
  get upgradeTargets(): UpgradeTarget[] {
    if (!this._upgradeTargets) {
      this._upgradeTargets = this.computeUpgradeTargets();
    }
    return this._upgradeTargets;
  }

  /**
   * @deprecated Use upgradeTargets instead
   */
  get lateGameTargets(): UpgradeTarget[] {
    return this.upgradeTargets;
  }

  /**
   * Check if an item is a boot
   */
  isBootItem(item: Item): boolean {
    return this.config.bootItems.includes(item.name);
  }

  private computeDisassembleCandidates(): DisassembleCandidateAnalysis[] {
    // Get ALL upgraded items - no cost filter
    const upgradedItems = this.itemRepo.getAllUpgradedItems();

    const results: DisassembleCandidateAnalysis[] = [];

    for (const item of upgradedItems) {
      const effResult = calculateItemEfficiency(item, this.statValuation);
      if (effResult.totalValue <= 0) continue;

      const recipeCost = this.itemRepo.getRecipeCost(item);
      const baseComponents = this.itemRepo.getBaseComponents(item);

      // Calculate usable components gold
      // A component is "usable" if it builds into ANY other item (excluding this one)
      const usableComponentsGold = sumBy(baseComponents, comp => {
        const compItem = this.itemRepo.getByName(comp);
        if (!compItem) return 0;

        const upgradeTargets = this.itemRepo.findAllUpgradeTargets(comp, [item.name]);
        return upgradeTargets.length > 0 ? compItem.cost : 0;
      });

      const totalRecoveredGold = usableComponentsGold + recipeCost;
      const goldEfficiency = totalRecoveredGold / item.cost;
      const wastedGold = item.cost - totalRecoveredGold;

      const disassembleScore = calculateDisassembleScore(
        goldEfficiency,
        effResult.totalValue,
        item.cost
      );

      results.push({
        item,
        goldEfficiency,
        totalValue: effResult.totalValue,
        wastedGold,
        statValue: effResult.totalStatValue,
        utilityValue: effResult.utilityValue,
        recipeCost,
        disassembleScore,
      });
    }

    // Sort by disassemble score (highest first)
    return orderBy(results, [r => r.disassembleScore], ['desc']);
  }

  private computeUpgradeTargets(): UpgradeTarget[] {
    // Get ALL upgraded items - no cost filter
    const upgradedItems = this.itemRepo.getAllUpgradedItems();

    return upgradedItems.map(item => {
      const baseComponents = this.itemRepo.getBaseComponents(item);
      const componentCounts = new Map(
        Object.entries(countBy(baseComponents, c => c)).map(([k, v]) => [k, v])
      );

      return {
        item,
        baseComponents,
        componentCounts,
        totalComponentCost: this.itemRepo.getComponentsGoldValue(baseComponents),
        recipeCost: this.itemRepo.getRecipeCost(item),
      };
    });
  }
}

/**
 * Create an analysis context from items
 */
export function createAnalysisContext(
  items: Item[],
  config: Partial<AnalysisConfig> = {}
): AnalysisContext {
  return new AnalysisContext(items, config);
}
