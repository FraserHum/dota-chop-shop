/**
 * Progression Analysis Command
 *
 * Unified command for analyzing build progressions through multiple stages.
 * Supports both cost-based sequences and target-item pathfinding through
 * a single interface.
 *
 * This is the recommended command for build analysis as it provides:
 * - Cost thresholds per stage (like sequences command)
 * - Required items per stage (like pathfind command)
 * - Role-based filtering
 * - Flexible stage configurations
 */

import { CliContext } from "../context";
import {
  analyzeProgression,
  stagesFromCosts,
  stagesForTargets,
  stagesForIncrementalTargets,
  formatProgression,
  formatProgressionStats,
} from "../../calculators/buildProgression";
import {
  BuildProgressionResult,
  BuildProgressionOptions,
  StageDefinition,
  ProgressionProgressCallback,
} from "../../models/buildTypes";

/**
 * Options for progression analysis command.
 */
export interface ProgressionOptions {
  /**
   * Cost thresholds as comma-separated string.
   * Example: "2000,4000,7000"
   */
  thresholds?: string;

  /**
   * Target items to acquire (comma-separated).
   * Example: "Force Staff,Skadi"
   */
  targets?: string;

  /**
   * Stage-specific targets as JSON.
   * Example: '[{"cost":3000},{"cost":6000,"items":["Force Staff"]}]'
   */
  stages?: string;

  /** Number of items per loadout (default: 3) */
  itemCount?: number;

  /** Maximum results to return (default: 20) */
  resultLimit?: number;

  /** Beam width for search (default: resultLimit * 10) */
  beamWidth?: number;

  /** Minimum component reuse percentage (0-1, default: 0.3) */
  minReuse?: number;

  /** Target coverage weight (0-1, default: 0.4) */
  targetCoverage?: number;

  /** Show summary only */
  summaryOnly?: boolean;

  /** Number of detailed results to show */
  detailLimit?: number;

  /** Include verbose transition details */
  verbose?: boolean;

  /** Suppress progress output */
  quiet?: boolean;

  /** Items to exclude (comma-separated) */
  exclude?: string;

  /**
   * Stage index at which to inject Boots of Speed into the component pool.
   * Once injected, boots will flow through all subsequent stages.
   * E.g., 0 to require boots from the first stage.
   */
  requireBoots?: number;

  /**
   * Include component items (like Boots of Speed, Blades of Attack) in the
   * item pool as standalone items. Default: true.
   * 
   * Set to false to only consider assembled/upgraded items.
   */
  componentItems?: boolean;

  /** Number of active inventory slots (default: 6) */
  inventorySlots?: number;

  /** Number of backpack slots (default: 3) */
  backpackSlots?: number;

  /** Show progress updates during analysis */
  showProgress?: boolean;
}

/**
 * Parse cost thresholds from a comma-separated string.
 */
function parseCostThresholds(input: string): number[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Parse target items from a comma-separated string.
 */
function parseTargets(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse stage definitions from JSON string.
 */
function parseStageDefinitions(input: string): StageDefinition[] | null {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return null;

    return parsed.map((stage: any) => {
      // Validate required field
      if (typeof stage.maxCost !== 'number') {
        throw new Error('Each stage must have "maxCost" (number)');
      }

      return {
        maxCost: stage.maxCost,
        minCost: stage.minCost,
        requiredItems: stage.requiredItems,
        excludedItems: stage.excludedItems,
        itemCount: stage.itemCount,
        requireBoots: stage.requireBoots,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Build stage definitions from options.
 */
function buildStageDefinitions(
  options: ProgressionOptions
): { stages: StageDefinition[]; error?: string } {
  // Priority: explicit stages > targets + thresholds > thresholds only

  // Option 1: Explicit stage definitions
  if (options.stages) {
    const stages = parseStageDefinitions(options.stages);
    if (!stages) {
      return {
        stages: [],
        error:
          "Invalid stage definitions. Use JSON format: " +
          '[{"maxCost":3000},{"maxCost":6000,"requiredItems":["Force Staff"]}]',
      };
    }
    return { stages };
  }

  // Option 2: Targets with thresholds (incremental acquisition)
  if (options.targets && options.thresholds) {
    const targets = parseTargets(options.targets);
    const costs = parseCostThresholds(options.thresholds);

    if (targets.length === 0) {
      return { stages: [], error: "No valid target items provided." };
    }
    if (costs.length !== targets.length + 1) {
      return {
        stages: [],
        error: `Need ${targets.length + 1} cost thresholds for ${targets.length} targets. ` +
          `Got ${costs.length}. Format: initial,after-target1,after-target2,...`,
      };
    }

    return { stages: stagesForIncrementalTargets(targets, costs) };
  }

  // Option 3: Targets only (two-stage: early → final with all targets)
  if (options.targets) {
    const targets = parseTargets(options.targets);
    if (targets.length === 0) {
      return { stages: [], error: "No valid target items provided." };
    }

    // Default to reasonable cost thresholds based on item count
    const earlyMax = 3000;
    const finalMax = 15000;
    return { stages: stagesForTargets(targets, earlyMax, finalMax) };
  }

  // Option 4: Cost thresholds only (sequences style)
  if (options.thresholds) {
    const costs = parseCostThresholds(options.thresholds);
    if (costs.length < 2) {
      return {
        stages: [],
        error: "At least 2 cost thresholds required. Example: --thresholds 2000,4000,7000",
      };
    }

    // Validate increasing
    for (let i = 1; i < costs.length; i++) {
      if (costs[i] <= costs[i - 1]) {
        return {
          stages: [],
          error: `Cost thresholds must be increasing: ${costs[i - 1]}g >= ${costs[i]}g`,
        };
      }
    }

    return { stages: stagesFromCosts(costs) };
  }

  // No valid input
  return {
    stages: [],
    error:
      "Must specify --thresholds, --targets, or --stages. Examples:\n" +
      "  --thresholds 2000,4000,7000\n" +
      '  --targets "Force Staff,Skadi"\n' +
      "  --targets \"Force Staff\" --thresholds 2000,4000,7000\n" +
      '  --stages \'[{"cost":3000},{"cost":6000,"items":["Force Staff"]}]\'',
  };
}

/**
 * Run progression analysis and return results.
 */
export function runProgressionAnalysis(
  ctx: CliContext,
  options: ProgressionOptions,
  onProgress?: ProgressionProgressCallback
): BuildProgressionResult | null {
  const { stages, error } = buildStageDefinitions(options);

  if (error) {
    console.error(`Error: ${error}`);
    return null;
  }

  if (stages.length === 0) {
    return null;
  }

  // Apply excluded items to stages, and mark the boot injection stage
  const excludedItems = options.exclude ? parseTargets(options.exclude) : undefined;
  const bootStage = options.requireBoots;
  
  const stagesWithOptions: StageDefinition[] = stages.map((stage, idx) => ({
    ...stage,
    excludedItems: excludedItems
      ? [...(stage.excludedItems ?? []), ...excludedItems]
      : stage.excludedItems,
    // Only set requireBoots on the specified stage
    requireBoots: idx === bootStage ? true : stage.requireBoots,
  }));

  const progressionOptions: BuildProgressionOptions = {
    stages: stagesWithOptions,
    defaultItemCount: options.itemCount ?? 3,
    resultLimit: options.resultLimit ?? 20,
    beamWidth: options.beamWidth,
    minTotalRecovery: options.minReuse ?? 0.3,
    statValuation: ctx.statValuation,
    auraMultiplier: ctx.config.thresholds.auraMultiplier,
    targetCoverageWeight: options.targetCoverage ?? 0.4,
    inventorySlots: options.inventorySlots,
    backpackSlots: options.backpackSlots,
    onProgress,
  };

  return analyzeProgression(ctx.items, ctx.config, progressionOptions, ctx.repo);
}

/**
 * Print progression analysis to console.
 */
export function printProgressionAnalysis(
  ctx: CliContext,
  options: ProgressionOptions
): void {
  const {
    summaryOnly = false,
    detailLimit = 5,
    verbose = false,
    quiet = false,
    showProgress = false,
  } = options;

  if (!quiet) {
    const { stages, error } = buildStageDefinitions(options);
    if (error) {
      console.error(`Error: ${error}`);
      return;
    }
    console.log(`Analyzing ${stages.length}-stage build progression...`);
    const costStr = stages.map((s) => `${s.maxCost}g`).join(" → ");
    console.log(`Cost thresholds: ${costStr}`);

    // Show required items if any
    const targetsPerStage = stages
      .map((s, i) => (s.requiredItems?.length ? `Stage ${i + 1}: ${s.requiredItems.join(", ")}` : null))
      .filter(Boolean);
    if (targetsPerStage.length > 0) {
      console.log(`Required items:`);
      for (const t of targetsPerStage) {
        console.log(`  ${t}`);
      }
    }
    console.log("");
  }

  // Set up progress reporting
  let lastProgressMessage = '';
  const onProgress: ProgressionProgressCallback | undefined = showProgress
    ? (update) => {
        // Only update if message changed (avoid flicker)
        if (update.message !== lastProgressMessage) {
          lastProgressMessage = update.message;
          process.stdout.write(`\r${update.message.padEnd(70)}`);
        }
      }
    : undefined;

  const startTime = performance.now();
  const result = runProgressionAnalysis(ctx, options, onProgress);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  // Clear progress line if we were showing progress
  if (showProgress) {
    process.stdout.write('\r' + ' '.repeat(70) + '\r');
  }

  if (!result) {
    return;
  }

  if (result.sequences.length === 0) {
    console.log("No valid build progressions found.");
    if (result.unresolvedTargets.size > 0) {
      console.log("\nUnresolved target items:");
      for (const [stageIdx, names] of result.unresolvedTargets) {
        console.log(`  Stage ${stageIdx + 1}: ${names.join(", ")}`);
      }
    }
    return;
  }

  // Print header
  const { stages } = buildStageDefinitions(options);
  console.log("=".repeat(70));
  console.log(`BUILD PROGRESSION - ${stages.length}-STAGE ANALYSIS`);
  console.log("=".repeat(70));
  console.log("");

  // Print summary statistics
  console.log("Summary Statistics:");
  console.log("-".repeat(40));
  console.log(formatProgressionStats(result.stats));
  console.log(`Analysis completed in ${elapsed}s`);
  console.log("");

  if (summaryOnly) {
    // Show top 5 compact results
    console.log("Top 5 Progressions:");
    console.log("-".repeat(40));
    for (let i = 0; i < Math.min(5, result.sequences.length); i++) {
      const seq = result.sequences[i];
      const stageStrs = seq.stages.map((stage, j) => {
        const items = stage.loadout.items.map((item) => item.displayName).join(" + ");
        return `[${j + 1}] ${items} (${stage.loadout.totalCost}g)`;
      });
      console.log(`#${i + 1} (${seq.totalScore.toFixed(3)}): ${stageStrs.join(" → ")}`);
    }
    return;
  }

  // Print full results
  console.log(formatProgression(result, verbose));

  // Print detailed view for top N if not verbose (verbose already shows details)
  if (!verbose && detailLimit > 0) {
    console.log(`\nDetailed Analysis (Top ${Math.min(detailLimit, result.sequences.length)}):`);
    console.log("=".repeat(70));

    for (let i = 0; i < Math.min(detailLimit, result.sequences.length); i++) {
      const seq = result.sequences[i];
      console.log(`\n--- Progression #${i + 1} (Score: ${seq.totalScore.toFixed(3)}) ---`);

      for (let j = 0; j < seq.stages.length; j++) {
        const stage = seq.stages[j];
        const loadout = stage.loadout;
        const items = loadout.items.map((item) => item.displayName).join(" + ");
        const leftovers = loadout.leftoverComponents ?? [];
        const leftoverStr = leftovers.length > 0
          ? ` + [${leftovers.map((c) => c.displayName).join(", ")}]`
          : "";
        const cost = loadout.totalInvestedCost ?? loadout.totalCost;
        const threshold = stage.costThreshold;

        // Check for required items
        const requiredItems = result.resolvedTargets.get(j);
        const targetMarker = requiredItems?.length ? " [TARGET]" : "";

        if (j === 0) {
          console.log(`Stage ${j + 1} (≤${threshold}g): ${items}${leftoverStr} (${cost}g)${targetMarker}`);
        } else {
          const prevStage = seq.stages[j - 1];
          const prevCost = prevStage.loadout.totalInvestedCost ?? prevStage.loadout.totalCost;
          const transition = stage.transition;
          const goldDelta = cost - prevCost;
          const reusePercent = transition
            ? Math.round(
                (transition.componentFlow.reusedGold / prevStage.loadout.totalCost) * 100
              )
            : 0;

          console.log(`    ↓ +${goldDelta}g, ${reusePercent}% component reuse`);
          if (transition) {
            const flow = transition.componentFlow;
            if (flow.reused.length > 0) {
              console.log(`      Components used: ${flow.reused.slice(0, 5).join(", ")}${flow.reused.length > 5 ? "..." : ""}`);
            }
            if (leftovers.length > 0) {
              console.log(`      Leftovers (retained): ${leftovers.map((c) => c.displayName).join(", ")}`);
            }
            if (flow.acquired.length > 0) {
              console.log(`      New components: ${flow.acquired.slice(0, 5).join(", ")}${flow.acquired.length > 5 ? "..." : ""}`);
            }
          }
          console.log(`Stage ${j + 1} (≤${threshold}g): ${items}${leftoverStr} (${cost}g)${targetMarker}`);
        }
      }
    }
  }
}
