#!/usr/bin/env bun
/**
 * Dota 2 Item Analysis CLI
 * 
 * A command-line tool for analyzing Dota 2 items, build transitions,
 * and finding optimal upgrade paths.
 */

import { Command } from "commander";
import { initializeContext } from "./context";
import { printEfficiencyAnalysis } from "./commands/efficiency";
import { printTransitionsAnalysis } from "./commands/transitions";
import { printReachabilityAnalysis } from "./commands/reachability";
import { printProgressionAnalysis } from "./commands/progression";

const program = new Command();

program
  .name("dota-chop")
  .description("Dota 2 Item Cost Efficiency Calculator and Build Path Analyzer")
  .version("1.0.0")
  .option(
    "-a, --aura <number>",
    "Aura multiplier: 1=solo, 2.5=teamfight, 5=full team",
    parseFloat
  )
  .addHelpText(
    "after",
    `
Examples:
  $ dota-chop efficiency              Show item efficiency rankings
  $ dota-chop --aura 2.5 efficiency   Account for auras benefiting ~2.5 heroes
  $ dota-chop transitions --type pair Show pair transitions only
  $ dota-chop progression -t 2000,4000,7000
                                      Analyze multi-stage build progression
  $ dota-chop progression --targets "Force Staff,Skadi"
                                      Find optimal path to target items
  $ dota-chop --aura 3 all            Run full analysis with 3x aura multiplier

Aura Multiplier (use before command):
  1.0  = Solo (only affects yourself) [default]
  2.5  = Average teamfight (yourself + ~1.5 teammates)
  5.0  = Full team (yourself + 4 teammates)
`
  );

/**
 * Helper to get aura multiplier from parent command options
 */
function getAuraMultiplier(command: Command): number | undefined {
  const opts = command.optsWithGlobals();
  return opts.aura;
}

// ─────────────────────────────────────────────────────────────
// efficiency command
// ─────────────────────────────────────────────────────────────
program
  .command("efficiency")
  .description("Analyze item efficiency rankings and stat valuations")
  .option("-s, --stats", "Show stat valuations", true)
  .option("--simple", "Show simple items only")
  .option("--upgraded", "Show upgraded items only")
  .option("-d, --disassemble", "Show disassemble analysis (Gyrocopter)")
  .option("-l, --limit <number>", "Maximum items to display", parseInt)
  .action(async function(this: Command, options) {
    try {
      const auraMultiplier = getAuraMultiplier(this);
      const ctx = await initializeContext({
        auraMultiplier,
        onProgress: (msg) => console.log(msg),
      });
      console.log("");
      printEfficiencyAnalysis(ctx, {
        showStatValues: options.stats,
        simpleOnly: options.simple,
        upgradedOnly: options.upgraded,
        showDisassemble: options.disassemble,
        limit: options.limit,
      });
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────
// transitions command
// ─────────────────────────────────────────────────────────────
program
  .command("transitions")
  .description("Analyze build transitions from early to late game items")
  .option("-t, --type <type>", "Analysis type: pair, trio, or both", "both")
  .option("--table-limit <number>", "Maximum transitions in table", parseInt, 15)
  .option("--detail-limit <number>", "Maximum detailed transitions", parseInt, 5)
  .option("--summary", "Show summary only")
  .option("--no-parallel", "Disable parallel processing for trio analysis")
  .option("--quiet", "Suppress progress output")
  .option("-m, --max-cost <number>", "Maximum total gold cost for initial build", parseInt)
  .action(async function(this: Command, options) {
    try {
      const auraMultiplier = getAuraMultiplier(this);
      const ctx = await initializeContext({
        auraMultiplier,
        onProgress: (msg) => console.log(msg),
      });
      console.log("");
      await printTransitionsAnalysis(ctx, {
        type: options.type as "pair" | "trio" | "both",
        tableLimit: options.tableLimit,
        detailLimit: options.detailLimit,
        summaryOnly: options.summary,
        parallel: options.parallel,
        showProgress: !options.quiet,
        initialBuildMaxCost: options.maxCost,
      });
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────
// reachability command
// ─────────────────────────────────────────────────────────────
program
  .command("reachability")
  .description("Analyze which late-game items can be reached via early item disassembly")
  .option("--no-utility", "Skip key utility items analysis")
  .option("--no-orphans", "Skip orphan components")
  .option("--no-hybrid", "Skip hybrid strategy details")
  .option("-l, --limit <number>", "Maximum items to display", parseInt, 25)
  .action(async function(this: Command, options) {
    try {
      const auraMultiplier = getAuraMultiplier(this);
      const ctx = await initializeContext({
        auraMultiplier,
        onProgress: (msg) => console.log(msg),
      });
      console.log("");
      printReachabilityAnalysis(ctx, {
        showKeyUtility: options.utility,
        showOrphans: options.orphans,
        showHybridDetails: options.hybrid,
        limit: options.limit,
      });
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────
// progression command (unified build progression analysis)
// ─────────────────────────────────────────────────────────────
program
  .command("progression")
  .description("Unified build progression analysis with cost thresholds and/or target items")
  .option(
    "-t, --thresholds <costs>",
    "Cost thresholds for each stage (comma-separated), e.g., 2000,4000,7000"
  )
  .option(
    "--targets <items>",
    "Target items to acquire (comma-separated), e.g., \"Force Staff,Skadi\""
  )
  .option(
    "--stages <json>",
    "Stage definitions as JSON, e.g., '[{\"maxCost\":3000},{\"maxCost\":6000,\"requiredItems\":[\"Force Staff\"]}]'"
  )
  .option("-i, --items <number>", "Maximum items per loadout", (v) => parseInt(v, 10), 3)
  .option("-r, --results <number>", "Maximum results to show", parseInt, 20)
  .option("-b, --beam <number>", "Beam width for search (default: results * 10)", parseInt)
  .option("--min-reuse <number>", "Minimum component reuse (0-1)", parseFloat, 0.3)
  .option("--coverage <number>", "Target coverage weight (0-1)", parseFloat, 0.4)
  .option("-x, --exclude <items>", "Items to exclude (comma-separated)")
  .option("--require-boots <stage>", "Inject boots at specified stage index (e.g., 0 for first stage)", parseInt)
  .option("--no-component-items", "Exclude component items (like Boots of Speed) from item pool")
  .option("--inventory-slots <number>", "Number of active inventory slots (default: 6)", parseInt, 6)
  .option("--backpack-slots <number>", "Number of backpack slots (default: 3)", parseInt, 3)
  .option("--summary", "Show summary only")
  .option("-d, --details <number>", "Number of detailed results to show", parseInt, 5)
  .option("-v, --verbose", "Show verbose transition details")
  .option("--quiet", "Suppress progress output")
  .addHelpText(
    "after",
    `
Examples:
  # Cost-based progression (like sequences command):
  $ dota-chop progression -t 2000,4000,7000

  # Target-based progression (find path to items):
  $ dota-chop progression --targets "Force Staff,Skadi"

  # Incremental target acquisition:
  $ dota-chop progression --targets "Force Staff,Skadi" -t 2000,4500,10000

  # Custom stage definitions (full control):
  $ dota-chop progression --stages '[{"maxCost":3000},{"maxCost":6000,"requiredItems":["Force Staff"]}]'

  # With inventory/backpack limits and component items:
  $ dota-chop progression -t 2000,4000,7000 --inventory-slots 5 --backpack-slots 2

  # Exclude specific items:
  $ dota-chop progression --targets "BKB" -x "Ogre Axe"

Modes:
  --thresholds only    : Pure cost-based progression (like sequences)
  --targets only       : Two-stage path to acquire all targets
  --targets + thresholds: Incremental acquisition (one target per stage)
  --stages             : Full control with JSON stage definitions

Inventory/Backpack System:
  Items are distributed to:
  - Inventory (active slots, 1-6 default): Provide stats
  - Backpack (inactive slots, 1-3 default): No stats bonus
  - Sold: Excess items converted to gold (50% recovery, 100% for recipes)
  
  Use --inventory-slots and --backpack-slots to configure limits.
  Items are prioritized by type and cost: upgraded items first, then components.

Stage Definition Format (--stages JSON):
  [
    {
      "maxCost": 3000,
      "minCost": 0,
      "requiredItems": ["Force Staff"],
      "excludedItems": ["Divine Rapier"],
      "itemCount": 3,
      "requireBoots": 0
    },
    ...
  ]
  
  Fields:
  - maxCost (required): Maximum gold for this stage
  - minCost: Minimum gold (default: previous stage cost + 1, or 0 for first)
  - requiredItems: Items that MUST appear in loadout
  - excludedItems: Items that MUST NOT appear
  - itemCount: Number of items to assemble (default: 3)
  - requireBoots: Stage index (0-based) at which to inject Boots into component pool
`
  )
  .action(async function(this: Command, options) {
    try {
      const auraMultiplier = getAuraMultiplier(this);
      const ctx = await initializeContext({
        auraMultiplier,
        onProgress: options.quiet ? undefined : (msg) => console.log(msg),
      });
      console.log("");
      printProgressionAnalysis(ctx, {
        thresholds: options.thresholds,
        targets: options.targets,
        stages: options.stages,
        itemCount: options.items,
        resultLimit: options.results,
        beamWidth: options.beam,
        minReuse: options.minReuse,
        targetCoverage: options.coverage,
        exclude: options.exclude,
        requireBoots: options.requireBoots,
        componentItems: options.componentItems,
        inventorySlots: options.inventorySlots,
        backpackSlots: options.backpackSlots,
        summaryOnly: options.summary,
        detailLimit: options.details,
        verbose: options.verbose,
        quiet: options.quiet,
      });
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// ─────────────────────────────────────────────────────────────
// all command (default full analysis)
// ─────────────────────────────────────────────────────────────
program
  .command("all")
  .description("Run full analysis (default)")
  .action(async function(this: Command) {
    try {
      const auraMultiplier = getAuraMultiplier(this);
      const ctx = await initializeContext({
        auraMultiplier,
        onProgress: (msg) => console.log(msg),
      });

      console.log("\nDota 2 Item Cost Efficiency Calculator");
      console.log("======================================\n");

      // Efficiency (with disassemble analysis)
      printEfficiencyAnalysis(ctx, { showDisassemble: true });

      // Transitions
      await printTransitionsAnalysis(ctx);

      // Reachability
      printReachabilityAnalysis(ctx);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// Default to showing help if no command specified
program.action(() => {
  program.help();
});

program.parse();
