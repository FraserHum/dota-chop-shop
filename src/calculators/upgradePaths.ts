import { Item } from "../models/types";
import { calculateStatValuation } from "./statValuation";
import { calculateItemEfficiency } from "./efficiency";
import { AnalysisConfig, DEFAULT_CONFIG, isBootItem as isBootItemName } from "../config/analysisConfig";
import { ItemRepository } from "../data/ItemRepository";
import { findMatchingComponents } from "./componentUtils";
import { calculateSynergyScore, calculateEarlyItemMetrics } from "./scoring";
import { countBy, partition, orderBy, sumBy, difference, take, groupBy } from "es-toolkit";

/**
 * Represents a component and what it can build into
 */
export interface ComponentUpgradeInfo {
  componentName: string;
  componentCost: number;
  canUpgradeInto: string[]; // List of item names this component can build into
  isUsable: boolean; // Whether this component can be used in any upgrade
}

/**
 * Represents an item's disassemble potential for Gyrocopter
 */
export interface DisassembleAnalysis {
  item: Item;
  recipeCost: number;
  components: ComponentUpgradeInfo[];
  usableComponentsGold: number; // Gold value of components that can be reused
  totalRecoveredGold: number; // usableComponentsGold + recipeCost
  goldEfficiency: number; // totalRecoveredGold / item.cost (1.0 = 100%)
  wastedGold: number; // Gold that cannot be recovered
  // Item value metrics
  efficiency: number;
  statValue: number;
  utilityValue: number;
  totalValue: number;
  /**
   * Combined score for ranking disassemble candidates.
   * Higher = better candidate. Factors in:
   * - Gold efficiency (how much gold is recovered)
   * - Cost (lower cost items score higher - more practical early game buys)
   * - Value (items with good stats/utility score higher)
   */
  disassembleScore: number;
}



/**
 * Calculate disassemble score for ranking candidates.
 * 
 * Score formula: goldEfficiency * valuePerGold * costFactor
 * - goldEfficiency: 0-1, how much gold is recovered
 * - valuePerGold: totalValue / cost, normalized
 * - costFactor: 1000 / cost, so cheaper items score higher
 * 
 * The result naturally ranks items by:
 * 1. High gold recovery (most important for Gyro's innate)
 * 2. Good value for cost (efficient items)
 * 3. Lower cost (more practical early game purchases)
 */
function calculateDisassembleScore(
  goldEfficiency: number,
  totalValue: number,
  cost: number
): number {
  if (cost <= 0) return 0;
  
  // Value per gold (normalized by dividing by typical good efficiency ~1.0)
  const valuePerGold = totalValue / cost;
  
  // Cost factor: cheaper items get higher scores
  // Using 1000/cost means a 1000g item gets 1.0, 2000g gets 0.5, 500g gets 2.0
  const costFactor = 1000 / cost;
  
  // Combine: gold efficiency is most important, then value, then cost preference
  // Weights: 50% gold efficiency, 25% value efficiency, 25% cost preference
  return (goldEfficiency * 0.5) + (valuePerGold * 0.25) + (costFactor * 0.25);
}

/**
 * Analyze an item's disassemble potential for Gyrocopter.
 * 
 * Considers ALL upgraded items (items with components) as candidates.
 * Items are scored by gold efficiency, value, and cost - with cheaper
 * items naturally ranking higher as more practical early game purchases.
 */
export function analyzeDisassemble(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): DisassembleAnalysis[] {
  const repo = itemRepo ?? new ItemRepository(items);
  const statValuation = calculateStatValuation(items);

  const results: DisassembleAnalysis[] = [];

  // Get ALL upgraded items (items with components) - no cost filter
  const upgradedItems = repo.getAllUpgradedItems();

  for (const item of upgradedItems) {
    const effResult = calculateItemEfficiency(item, statValuation);
    
    // Skip items with no value
    if (effResult.totalValue <= 0) continue;

    const recipeCost = repo.getRecipeCost(item);
    const baseComponents = repo.getBaseComponents(item);

    // Analyze each component
    const componentInfos: ComponentUpgradeInfo[] = [];
    let usableComponentsGold = 0;

    // Count component occurrences (some items use multiples of same component)
    const componentCounts = countBy(baseComponents, (c) => c);

    for (const [componentName, count] of Object.entries(componentCounts)) {
      const componentItem = repo.getByName(componentName);
      if (!componentItem) continue;

      // Get ALL items this component builds into, EXCLUDING the item being analyzed.
      // This prevents circular logic where a component is considered "usable" just
      // because it builds into the very item we're disassembling.
      const upgradeTargets = repo.findAllUpgradeTargetNames(componentName, [item.name]);
      const isUsable = upgradeTargets.length > 0;

      // Add entry for each instance of this component
      for (let i = 0; i < count; i++) {
        componentInfos.push({
          componentName: componentItem.displayName,
          componentCost: componentItem.cost,
          canUpgradeInto: upgradeTargets,
          isUsable,
        });

        if (isUsable) {
          usableComponentsGold += componentItem.cost;
        }
      }
    }

    const totalRecoveredGold = usableComponentsGold + recipeCost;
    const goldEfficiency = totalRecoveredGold / item.cost;
    const wastedGold = item.cost - totalRecoveredGold;

    // Calculate combined score for ranking
    const disassembleScore = calculateDisassembleScore(
      goldEfficiency,
      effResult.totalValue,
      item.cost
    );

    results.push({
      item,
      recipeCost,
      components: componentInfos,
      usableComponentsGold,
      totalRecoveredGold,
      goldEfficiency,
      wastedGold,
      efficiency: effResult.efficiencyWithUtility,
      statValue: effResult.totalStatValue,
      utilityValue: effResult.utilityValue,
      totalValue: effResult.totalValue,
      disassembleScore,
    });
  }

  // Sort by disassemble score (highest first)
  return orderBy(results, ['disassembleScore'], ['desc']);
}

// ============================================================================
// Synergy Analysis - Finding early item combinations
// ============================================================================

/**
 * Represents a late-game item and which early items contribute to it
 */
export interface LateGameTarget {
  item: Item;
  baseComponents: string[]; // All base components needed
  totalComponentCost: number;
  recipeCost: number;
}

/**
 * Shared target info for upgrade path analysis
 */
export interface SharedTargetInfo {
  lateItem: Item;
  contributingEarlyItems: string[]; // Names of early items that contribute
  componentsProvided: string[]; // Which components are covered
  componentsCovered: number; // Count of unique components covered
  totalComponentsNeeded: number;
  coveragePercent: number; // What % of the late item's components are covered
  goldContributed: number; // Gold value of matched components
  goldContributionPercent: number; // goldContributed / lateItem.cost
  remainingCost: number; // Cost to complete the late item
}

/**
 * Represents a synergistic combination of early items
 */
export interface EarlyItemCombo {
  earlyItems: DisassembleAnalysis[];
  combinedCost: number;
  combinedValue: number;
  // Gold lost when disassembling (sum of wasted gold from early items)
  totalWastedGold: number;
  // Average recovery % across early items
  averageRecovery: number;
  // Shared upgrade targets - late items that multiple early items contribute to
  sharedTargets: SharedTargetInfo[];
  // Best gold contribution (what % of late item cost is covered)
  bestGoldContributionPercent: number;
  synergyScore: number; // Combined metric
}

/**
 * Get all upgraded items (items with components) with their base components.
 * 
 * No cost filtering - build-level validation handles the real constraint
 * (final loadout cost > initial loadout cost).
 */
function getLateGameTargets(
  repo: ItemRepository,
  config: AnalysisConfig = DEFAULT_CONFIG
): LateGameTarget[] {
  // Get ALL upgraded items (no cost filter)
  return repo.getAllUpgradedItems()
    .map(item => {
      const baseComponents = repo.getBaseComponents(item);
      const totalComponentCost = repo.getComponentsGoldValue(baseComponents);
      const recipeCost = item.cost - totalComponentCost;
      return {
        item,
        baseComponents,
        totalComponentCost,
        recipeCost: Math.max(0, recipeCost),
      };
    });
}


/**
 * Check if an item is a boot (movement speed items that don't stack)
 */
function isBootItem(item: Item, config: AnalysisConfig = DEFAULT_CONFIG): boolean {
  return isBootItemName(item.name, config);
}

/**
 * Analyze synergies between early item combinations
 */
export function analyzeEarlyItemCombos(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): EarlyItemCombo[] {
  const repo = itemRepo ?? new ItemRepository(items);
  
  // Get early item analyses (items meeting minimum recovery threshold)
  const earlyAnalyses = analyzeDisassemble(items, config, repo).filter(
    a => a.goldEfficiency >= config.thresholds.minGoldRecovery
  );
  
  // Get late game targets
  const lateTargets = getLateGameTargets(repo, config);
  
  const combos: EarlyItemCombo[] = [];
  
  // Generate all pairs of early items
  for (let i = 0; i < earlyAnalyses.length; i++) {
    for (let j = i + 1; j < earlyAnalyses.length; j++) {
      const early1 = earlyAnalyses[i];
      const early2 = earlyAnalyses[j];
      
      // Skip boot + boot combos - movement speed doesn't stack
      if (isBootItem(early1.item, config) && isBootItem(early2.item, config)) {
        continue;
      }
      
      // Get combined base components from both items
      const components1 = repo.getBaseComponents(early1.item);
      const components2 = repo.getBaseComponents(early2.item);
      const combinedComponents = [...components1, ...components2];
      
      // Find shared targets - late items where both early items contribute
      const sharedTargets: SharedTargetInfo[] = [];
      
      for (const target of lateTargets) {
        const matches1 = findMatchingComponents(components1, target.baseComponents);
        const matches2 = findMatchingComponents(components2, target.baseComponents);
        
        // Both items must contribute at least one component
        if (matches1.length > 0 && matches2.length > 0) {
          // Calculate total unique coverage
          const allMatches = findMatchingComponents(combinedComponents, target.baseComponents);
          const coveragePercent = allMatches.length / target.baseComponents.length;
          
          // Calculate gold contribution
          const goldContributed = repo.getComponentsGoldValue(allMatches);
          const goldContributionPercent = goldContributed / target.item.cost;
          const remainingCost = target.item.cost - goldContributed;
          
          sharedTargets.push({
            lateItem: target.item,
            contributingEarlyItems: [early1.item.displayName, early2.item.displayName],
            componentsProvided: allMatches.map(c => repo.getByName(c)?.displayName || c),
            componentsCovered: allMatches.length,
            totalComponentsNeeded: target.baseComponents.length,
            coveragePercent,
            goldContributed,
            goldContributionPercent,
            remainingCost,
          });
        }
      }
      
      if (sharedTargets.length > 0) {
        // Sort shared targets by gold contribution % (highest first)
        const sortedSharedTargets = orderBy(sharedTargets, ['goldContributionPercent'], ['desc']);
        
        const bestGoldContribution = sortedSharedTargets[0].goldContributionPercent;
        const metrics = calculateEarlyItemMetrics([early1, early2]);
        
        // Calculate synergy score using configurable weights
        const synergyScore = calculateSynergyScore(
          {
            bestGoldContribution,
            combinedValue: metrics.combinedValue,
            combinedCost: metrics.combinedCost,
            averageRecovery: metrics.averageRecovery,
            sharedTargetCount: sortedSharedTargets.length,
          },
          config.pairSynergyWeights
        );
        
        combos.push({
          earlyItems: [early1, early2],
          combinedCost: metrics.combinedCost,
          combinedValue: metrics.combinedValue,
          totalWastedGold: metrics.totalWastedGold,
          averageRecovery: metrics.averageRecovery,
          sharedTargets: sortedSharedTargets,
          bestGoldContributionPercent: bestGoldContribution,
          synergyScore,
        });
      }
    }
  }
  
  // Sort by synergy score
  return orderBy(combos, ['synergyScore'], ['desc']);
}

// ============================================================================
// Boot + 2 Items Trio Analysis
// ============================================================================

/**
 * Represents a boot + 2 non-boot items trio combination
 */
export interface BootTrioCombo {
  bootItem: DisassembleAnalysis;
  nonBootItems: DisassembleAnalysis[];
  combinedCost: number;
  combinedValue: number;
  // Gold lost when disassembling (sum of wasted gold from all 3 items)
  totalWastedGold: number;
  // Average recovery % across all 3 items
  averageRecovery: number;
  // Upgrade targets where at least 2 items contribute
  sharedTargets: SharedTargetInfo[];
  bestGoldContributionPercent: number;
  synergyScore: number;
}

/**
 * Analyze boot + 2 non-boot item combinations
 * Since boots are mandatory, find the best non-boot pairs to go with each boot
 */
export function analyzeBootTrios(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): BootTrioCombo[] {
  const repo = itemRepo ?? new ItemRepository(items);
  
  // Get early item analyses (items meeting minimum recovery threshold)
  const earlyAnalyses = analyzeDisassemble(items, config, repo).filter(
    a => a.goldEfficiency >= config.thresholds.minGoldRecovery
  );
  
  // Split into boots and non-boots using partition
  const [bootItems, nonBootItems] = partition(earlyAnalyses, a => isBootItem(a.item, config));
  
  // Get late game targets
  const lateTargets = getLateGameTargets(repo, config);
  
  const trios: BootTrioCombo[] = [];
  
  // For each boot, find best pairs of non-boot items
  for (const boot of bootItems) {
    // Generate all pairs of non-boot items
    for (let i = 0; i < nonBootItems.length; i++) {
      for (let j = i + 1; j < nonBootItems.length; j++) {
        const item1 = nonBootItems[i];
        const item2 = nonBootItems[j];
        
        // Get components from all three items
        const bootComponents = repo.getBaseComponents(boot.item);
        const components1 = repo.getBaseComponents(item1.item);
        const components2 = repo.getBaseComponents(item2.item);
        const allComponents = [...bootComponents, ...components1, ...components2];
        
        // Find shared targets where at least 2 of the 3 items contribute
        const sharedTargets: SharedTargetInfo[] = [];
        
        for (const target of lateTargets) {
          const bootMatches = findMatchingComponents(bootComponents, target.baseComponents);
          const matches1 = findMatchingComponents(components1, target.baseComponents);
          const matches2 = findMatchingComponents(components2, target.baseComponents);
          
          // Count how many items contribute
          const contributors: string[] = [];
          if (bootMatches.length > 0) contributors.push(boot.item.displayName);
          if (matches1.length > 0) contributors.push(item1.item.displayName);
          if (matches2.length > 0) contributors.push(item2.item.displayName);
          
          // At least 2 items must contribute
          if (contributors.length >= 2) {
            const allMatches = findMatchingComponents(allComponents, target.baseComponents);
            const coveragePercent = allMatches.length / target.baseComponents.length;
            const goldContributed = repo.getComponentsGoldValue(allMatches);
            const goldContributionPercent = goldContributed / target.item.cost;
            const remainingCost = target.item.cost - goldContributed;
            
            sharedTargets.push({
              lateItem: target.item,
              contributingEarlyItems: contributors,
              componentsProvided: allMatches.map(c => repo.getByName(c)?.displayName || c),
              componentsCovered: allMatches.length,
              totalComponentsNeeded: target.baseComponents.length,
              coveragePercent,
              goldContributed,
              goldContributionPercent,
              remainingCost,
            });
          }
        }
        
        if (sharedTargets.length > 0) {
          // Sort shared targets by gold contribution % (highest first)
          const sortedSharedTargets = orderBy(sharedTargets, ['goldContributionPercent'], ['desc']);
          
          const bestGoldContribution = sortedSharedTargets[0].goldContributionPercent;
          const metrics = calculateEarlyItemMetrics([boot, item1, item2]);
          const threeWayTargetCount = sortedSharedTargets.filter(t => t.contributingEarlyItems.length === 3).length;
          
          // Calculate synergy score using configurable weights
          const synergyScore = calculateSynergyScore(
            {
              bestGoldContribution,
              combinedValue: metrics.combinedValue,
              combinedCost: metrics.combinedCost,
              averageRecovery: metrics.averageRecovery,
              sharedTargetCount: sortedSharedTargets.length,
              threeWayTargetCount,
            },
            config.trioSynergyWeights
          );
          
          trios.push({
            bootItem: boot,
            nonBootItems: [item1, item2],
            combinedCost: metrics.combinedCost,
            combinedValue: metrics.combinedValue,
            totalWastedGold: metrics.totalWastedGold,
            averageRecovery: metrics.averageRecovery,
            sharedTargets: sortedSharedTargets,
            bestGoldContributionPercent: bestGoldContribution,
            synergyScore,
          });
        }
      }
    }
  }
  
  // Sort by synergy score
  return orderBy(trios, ['synergyScore'], ['desc']);
}

// ============================================================================
// Late-Game Reachability Analysis
// ============================================================================

/**
 * Represents a component that doesn't appear in any disassemblable early item
 */
export interface OrphanComponent {
  name: string;
  displayName: string;
  cost: number;
  usedInLateItems: string[]; // Late game items that need this component
}

/**
 * Represents a late-game item's reachability via the disassemble strategy
 */
export interface LateItemReachability {
  item: Item;
  totalComponents: number;
  componentsFromEarlyItems: string[]; // Components obtainable via disassemble
  orphanComponents: string[]; // Components that must be bought directly
  goldFromEarlyItems: number; // Gold value of reachable components
  goldFromOrphans: number; // Gold value of orphan components (must buy directly)
  reachabilityPercent: number; // What % of the item can be built from early items
  recipeCost: number;
  // Which early items contribute to this late item
  contributingEarlyItems: { name: string; components: string[] }[];
}

/**
 * Summary of the disassemble strategy's coverage
 */
export interface ReachabilityAnalysis {
  // All components available via disassembling early items
  availableComponents: Set<string>;
  // Components that don't appear in any early item (must buy directly)
  orphanComponents: OrphanComponent[];
  // Late-game items sorted by reachability
  lateItemReachability: LateItemReachability[];
  // Stats
  totalLateItems: number;
  fullyReachableCount: number; // 100% reachable
  partiallyReachableCount: number; // Some components available
  unreachableCount: number; // No components available via early items
}

/**
 * Analyze which late-game items are reachable via the disassemble strategy
 */
export function analyzeReachability(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): ReachabilityAnalysis {
  const repo = itemRepo ?? new ItemRepository(items);
  
  // Get early items that meet the gold recovery threshold
  const earlyAnalyses = analyzeDisassemble(items, config, repo).filter(
    a => a.goldEfficiency >= config.thresholds.minGoldRecovery
  );
  
  // Collect all unique base components available from early items
  const allEarlyComponents = earlyAnalyses.flatMap(a => repo.getBaseComponents(a.item));
  const availableComponents = new Set<string>(allEarlyComponents);
  
  // Build component sources using groupBy
  const componentPairs = earlyAnalyses.flatMap(a => 
    repo.getBaseComponents(a.item).map(comp => ({ comp, itemName: a.item.displayName }))
  );
  const componentSourcesObj = groupBy(componentPairs, p => p.comp);
  const componentSources = new Map(
    Object.entries(componentSourcesObj).map(([comp, pairs]) => [comp, pairs.map(p => p.itemName)])
  );
  
  // Get late game targets
  const lateTargets = getLateGameTargets(repo, config);
  
  // Find orphan components using difference
  const allLateComponents = [...new Set(lateTargets.flatMap(t => t.baseComponents))];
  const orphanComponentNames = difference(allLateComponents, [...availableComponents]);
  
  // Build orphan component details
  const orphanComponents: OrphanComponent[] = orphanComponentNames
    .map(compName => {
      const compItem = repo.getByName(compName);
      if (!compItem) return null;
      
      const usedIn = lateTargets
        .filter(target => target.baseComponents.includes(compName))
        .map(target => target.item.displayName);
      
      return {
        name: compName,
        displayName: compItem.displayName,
        cost: compItem.cost,
        usedInLateItems: usedIn,
      };
    })
    .filter((c): c is OrphanComponent => c !== null);
  
  // Sort orphans by how many late items use them (most impactful first)
  const sortedOrphanComponents = orderBy(orphanComponents, [c => c.usedInLateItems.length], ['desc']);
  
  // Analyze reachability for each late item
  const lateItemReachability: LateItemReachability[] = [];
  
  for (const target of lateTargets) {
    const componentsFromEarlyItems: string[] = [];
    const orphans: string[] = [];
    let goldFromEarlyItems = 0;
    let goldFromOrphans = 0;
    
    // Count component occurrences
    const componentCounts = countBy(target.baseComponents, c => c);
    
    for (const [comp, count] of Object.entries(componentCounts)) {
      const compItem = repo.getByName(comp);
      if (!compItem) continue;
      
      for (let i = 0; i < count; i++) {
        if (availableComponents.has(comp)) {
          componentsFromEarlyItems.push(compItem.displayName);
          goldFromEarlyItems += compItem.cost;
        } else {
          orphans.push(compItem.displayName);
          goldFromOrphans += compItem.cost;
        }
      }
    }
    
    const totalGold = goldFromEarlyItems + goldFromOrphans;
    const reachabilityPercent = totalGold > 0 ? goldFromEarlyItems / totalGold : 0;
    
    // Find which early items contribute
    const contributingEarlyItems: { name: string; components: string[] }[] = [];
    for (const analysis of earlyAnalyses) {
      const earlyComponents = repo.getBaseComponents(analysis.item);
      const matches = findMatchingComponents(earlyComponents, target.baseComponents);
      if (matches.length > 0) {
        contributingEarlyItems.push({
          name: analysis.item.displayName,
          components: matches.map(c => repo.getByName(c)?.displayName || c),
        });
      }
    }
    
    lateItemReachability.push({
      item: target.item,
      totalComponents: target.baseComponents.length,
      componentsFromEarlyItems,
      orphanComponents: orphans,
      goldFromEarlyItems,
      goldFromOrphans,
      reachabilityPercent,
      recipeCost: target.recipeCost,
      contributingEarlyItems,
    });
  }
  
  // Sort by reachability (highest first), then by item cost
  lateItemReachability.sort((a, b) => {
    if (Math.abs(a.reachabilityPercent - b.reachabilityPercent) > 0.01) {
      return b.reachabilityPercent - a.reachabilityPercent;
    }
    return a.item.cost - b.item.cost;
  });
  
  // Calculate stats
  const fullyReachableCount = lateItemReachability.filter(r => r.reachabilityPercent >= 0.99).length;
  const partiallyReachableCount = lateItemReachability.filter(r => r.reachabilityPercent > 0 && r.reachabilityPercent < 0.99).length;
  const unreachableCount = lateItemReachability.filter(r => r.reachabilityPercent === 0).length;
  
  return {
    availableComponents,
    orphanComponents,
    lateItemReachability,
    totalLateItems: lateTargets.length,
    fullyReachableCount,
    partiallyReachableCount,
    unreachableCount,
  };
}

// ============================================================================
// Key Utility Items Analysis
// ============================================================================

/**
 * Detailed analysis for a key utility item
 */
export interface KeyItemAnalysis {
  item: Item;
  reachabilityPercent: number;
  componentsFromEarlyItems: { name: string; cost: number }[];
  orphanComponents: { name: string; cost: number }[];
  goldFromEarlyItems: number;
  goldFromOrphans: number;
  recipeCost: number;
  // Best early item sources
  bestEarlySources: { earlyItem: string; components: string[]; goldContrib: number }[];
  // Recommended early game loadout to build toward this item
  recommendedLoadout: string[];
}

/**
 * Analyze key utility items that players commonly want
 */
export function analyzeKeyUtilityItems(
  items: Item[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  itemRepo?: ItemRepository
): KeyItemAnalysis[] {
  const repo = itemRepo ?? new ItemRepository(items);
  
  // Get early items that meet the gold recovery threshold
  const earlyAnalyses = analyzeDisassemble(items, config, repo).filter(
    a => a.goldEfficiency >= config.thresholds.minGoldRecovery
  );
  
  // Collect all unique base components available from early items
  const availableComponents = new Set<string>();
  
  for (const analysis of earlyAnalyses) {
    const baseComponents = repo.getBaseComponents(analysis.item);
    for (const comp of baseComponents) {
      availableComponents.add(comp);
    }
  }
  
  const results: KeyItemAnalysis[] = [];
  
  for (const keyItemName of config.keyUtilityItems) {
    const item = repo.getByName(keyItemName);
    if (!item || item.components.length === 0) continue;
    
    const baseComponents = repo.getBaseComponents(item);
    const recipeCost = repo.getRecipeCost(item);
    
    // Analyze components
    const componentsFromEarlyItems: { name: string; cost: number }[] = [];
    const orphanComponents: { name: string; cost: number }[] = [];
    let goldFromEarlyItems = 0;
    let goldFromOrphans = 0;
    
    // Count component occurrences
    const componentCounts = countBy(baseComponents, c => c);
    
    for (const [comp, count] of Object.entries(componentCounts)) {
      const compItem = repo.getByName(comp);
      if (!compItem) continue;
      
      for (let i = 0; i < count; i++) {
        if (availableComponents.has(comp)) {
          componentsFromEarlyItems.push({ name: compItem.displayName, cost: compItem.cost });
          goldFromEarlyItems += compItem.cost;
        } else {
          orphanComponents.push({ name: compItem.displayName, cost: compItem.cost });
          goldFromOrphans += compItem.cost;
        }
      }
    }
    
    const totalGold = goldFromEarlyItems + goldFromOrphans;
    const reachabilityPercent = totalGold > 0 ? goldFromEarlyItems / totalGold : 0;
    
    // Find best early item sources
    const earlySources: { earlyItem: string; components: string[]; goldContrib: number }[] = [];
    for (const analysis of earlyAnalyses) {
      const earlyComponents = repo.getBaseComponents(analysis.item);
      const matches = findMatchingComponents(earlyComponents, baseComponents);
      if (matches.length > 0) {
        const goldContrib = repo.getComponentsGoldValue(matches);
        earlySources.push({
          earlyItem: analysis.item.displayName,
          components: matches.map(c => repo.getByName(c)?.displayName || c),
          goldContrib,
        });
      }
    }
    
    // Sort by gold contribution
    const sortedEarlySources = orderBy(earlySources, ['goldContrib'], ['desc']);
    
    // Recommend loadout: pick non-overlapping early items that maximize coverage
    const recommendedLoadout: string[] = [];
    const usedComponents = new Set<string>();
    
    for (const source of sortedEarlySources) {
      // Check if this early item adds new components
      const earlyItem = repo.getByDisplayName(source.earlyItem);
      if (!earlyItem) continue;
      
      const earlyBaseComps = repo.getBaseComponents(earlyItem);
      const newComps = earlyBaseComps.filter(c => 
        baseComponents.includes(c) && !usedComponents.has(c)
      );
      
      if (newComps.length > 0) {
        recommendedLoadout.push(source.earlyItem);
        for (const c of newComps) {
          usedComponents.add(c);
        }
      }
      
      // Limit to 3 items
      if (recommendedLoadout.length >= 3) break;
    }
    
    results.push({
      item,
      reachabilityPercent,
      componentsFromEarlyItems,
      orphanComponents,
      goldFromEarlyItems,
      goldFromOrphans,
      recipeCost,
      bestEarlySources: sortedEarlySources.slice(0, 5),
      recommendedLoadout,
    });
  }
  
  // Sort by reachability (highest first)
  return orderBy(results, ['reachabilityPercent'], ['desc']);
}
