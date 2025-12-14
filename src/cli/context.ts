/**
 * CLI Context - Shared state and initialization for all CLI commands.
 * 
 * This module provides a clean interface to initialize the analysis
 * context once and share it across all commands.
 */

import { Item, StatValuation } from "../models/types";
import { ItemRepository } from "../data/ItemRepository";
import { fetchItemsFromAPI } from "../data/fetchItems";
import { calculateStatValuation } from "../calculators/statValuation";
import { AnalysisConfig, mergeConfig } from "../config/analysisConfig";

/**
 * Shared context for CLI operations.
 * Contains all initialized data needed for analysis commands.
 */
export interface CliContext {
  /** All items (excluding consumables) */
  readonly items: Item[];
  /** Item repository with memoized lookups */
  readonly repo: ItemRepository;
  /** Calculated stat valuations */
  readonly statValuation: StatValuation;
  /** Analysis configuration */
  readonly config: AnalysisConfig;
}

/**
 * Options for initializing the CLI context.
 */
export interface CliContextOptions {
  /** Override default configuration */
  config?: Partial<AnalysisConfig>;
  /** Include consumables in item list */
  includeConsumables?: boolean;
  /** 
   * Aura multiplier for team-wide benefit calculation.
   * 1.0 = solo, 2.5 = average teamfight, 5.0 = full team
   */
  auraMultiplier?: number;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Initialize the CLI context by fetching items and calculating valuations.
 * This is the entry point for all analysis operations.
 */
export async function initializeContext(
  options: CliContextOptions = {}
): Promise<CliContext> {
  const {
    config: configOverrides,
    includeConsumables = false,
    auraMultiplier,
    onProgress = () => {},
  } = options;

  // Merge configuration first to get auraMultiplier from config if not explicitly set
  const baseConfig = mergeConfig(configOverrides);
  const effectiveAuraMultiplier = auraMultiplier ?? baseConfig.thresholds.auraMultiplier;
  
  // Update config with the effective aura multiplier
  const config: AnalysisConfig = {
    ...baseConfig,
    thresholds: {
      ...baseConfig.thresholds,
      auraMultiplier: effectiveAuraMultiplier,
    },
  };

  onProgress("Fetching item data from OpenDota API...");
  const allItems = await fetchItemsFromAPI({ auraMultiplier: effectiveAuraMultiplier });

  // Filter consumables unless explicitly requested
  const items = includeConsumables
    ? allItems
    : allItems.filter((item) => !item.isConsumable);

  onProgress(`Loaded ${items.length} items.`);
  if (effectiveAuraMultiplier !== 1.0) {
    onProgress(`Aura multiplier: ${effectiveAuraMultiplier}x`);
  }

  // Create shared repository
  const repo = new ItemRepository(items);

  // Calculate stat valuations
  onProgress("Calculating stat valuations...");
  const statValuation = calculateStatValuation(items);

  return {
    items,
    repo,
    statValuation,
    config,
  };
}

/**
 * Create a context from pre-loaded items (useful for testing).
 */
export function createContextFromItems(
  items: Item[],
  options: Omit<CliContextOptions, "onProgress"> = {}
): CliContext {
  const { config: configOverrides, includeConsumables = false } = options;

  const filteredItems = includeConsumables
    ? items
    : items.filter((item) => !item.isConsumable);

  const repo = new ItemRepository(filteredItems);
  const statValuation = calculateStatValuation(filteredItems);
  const config = mergeConfig(configOverrides);

  return {
    items: filteredItems,
    repo,
    statValuation,
    config,
  };
}
