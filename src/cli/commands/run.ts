/**
 * Interactive Run Command
 *
 * Guides users through a step-by-step interactive flow to configure
 * and run a progression analysis.
 *
 * Uses @clack/prompts for beautiful, accessible terminal UI.
 */

import { CliContext } from "../context";
import {
  promptNumber,
  promptString,
  promptConfirm,
  promptCommaList,
} from "../prompts";
import {
  analyzeProgression,
  formatProgression,
  formatProgressionStats,
} from "../../calculators/buildProgression";
import { BuildProgressionOptions, StageDefinition } from "../../models/buildTypes";
import { intro, outro, spinner } from "@clack/prompts";

/**
 * Main entry point for interactive run command
 */
export async function printInteractiveRun(
  ctx: CliContext,
  prefilledAura?: number
): Promise<void> {
  intro("Welcome to chop-shop interactive mode!");

  try {
    // Phase 1: Collect general configuration
    const generalConfig = await promptGeneralConfig(prefilledAura);

    // Phase 2: Get number of stages
    const numStages = await promptNumberOfStages();

    // Phase 3: Configure each stage
    const stages = await promptStages(numStages);

    // Build final options
    const options: BuildProgressionOptions = {
      stages,
      defaultItemCount: generalConfig.itemCount,
      resultLimit: generalConfig.resultLimit,
      beamWidth: generalConfig.beamWidth,
      minComponentReuse: generalConfig.minReuse,
      statValuation: ctx.statValuation,
      targetCoverageWeight: generalConfig.targetCoverage,
      includeComponentItems: true,
      inventorySlots: generalConfig.inventorySlots,
      backpackSlots: generalConfig.backpackSlots,
    };

    // Run analysis
    const s = spinner();
    s.start("Analyzing progression...");

    const result = analyzeProgression(ctx.items, ctx.config, options, ctx.repo);

    s.stop("Analysis complete!");
    console.log("");

    // Display results
    console.log(formatProgressionStats(result.stats));
    console.log("");
    console.log(formatProgression(result, false));

    outro("Analysis complete!");
  } catch (error) {
    if (error instanceof Error && error.message.includes("cancelled")) {
      outro("Cancelled");
      process.exit(0);
    }
    throw error;
  }
}

/**
 * Phase 1: Prompt for general configuration (applies to all stages)
 */
async function promptGeneralConfig(
  prefilledAura?: number
): Promise<{
  auraMultiplier: number;
  itemCount: number;
  resultLimit: number;
  beamWidth?: number;
  minReuse: number;
  targetCoverage: number;
  inventorySlots: number;
  backpackSlots: number;
  exclude?: string[];
}> {
  console.log("");

  const auraMultiplier =
    prefilledAura ??
    parseFloat(await promptNumber("Aura Multiplier?", {
      defaultValue: "1.0",
      validator: (v) => {
        const num = parseFloat(v);
        if (isNaN(num) || num < 0.5 || num > 10) {
          return "Must be between 0.5 and 10";
        }
        return true;
      },
    }));

  const itemCount = parseInt(await promptNumber("Max items per loadout? (1-6)", {
    defaultValue: "3",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 6) {
        return "Must be between 1 and 6";
      }
      return true;
    },
  }), 10);

  const resultLimit = parseInt(await promptNumber("Maximum results to show? (1-100)", {
    defaultValue: "20",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 100) {
        return "Must be between 1 and 100";
      }
      return true;
    },
  }), 10);

  const beamWidthInput = await promptString(
    "Beam width for search?",
    {
      defaultValue: "auto",
      placeholder: "auto or number",
    }
  );

  const beamWidth =
    beamWidthInput === "auto" ? undefined : parseInt(beamWidthInput, 10) || undefined;

  const minReuse = parseFloat(await promptNumber("Minimum component reuse? (0.0-1.0)", {
    defaultValue: "0.3",
    validator: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return "Must be between 0.0 and 1.0";
      }
      return true;
    },
  }));

  const targetCoverage = parseFloat(await promptNumber("Target coverage weight? (0.0-1.0)", {
    defaultValue: "0.4",
    validator: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return "Must be between 0.0 and 1.0";
      }
      return true;
    },
  }));

  const inventorySlots = parseInt(await promptNumber("Inventory slots? (1-6)", {
    defaultValue: "6",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 6) {
        return "Must be between 1 and 6";
      }
      return true;
    },
  }), 10);

  const backpackSlots = parseInt(await promptNumber("Backpack slots? (0-3)", {
    defaultValue: "3",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 0 || num > 3) {
        return "Must be between 0 and 3";
      }
      return true;
    },
  }), 10);

  const excludeList = await promptCommaList("Exclude specific items?");

  return {
    auraMultiplier,
    itemCount,
    resultLimit,
    beamWidth,
    minReuse,
    targetCoverage,
    inventorySlots,
    backpackSlots,
    exclude: excludeList.length > 0 ? excludeList : undefined,
  };
}

/**
 * Phase 2: Get number of stages
 */
async function promptNumberOfStages(): Promise<number> {
  console.log("");
  const result = await promptNumber("How many stages do you want to analyze?", {
    defaultValue: "3",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 10) {
        return "Must be between 1 and 10";
      }
      return true;
    },
  });

  return parseInt(result, 10);
}

/**
 * Phase 3: Configure each stage
 *
 * For each stage, ask:
 * - Max cost
 * - Required items (optional)
 * - Excluded items (optional)
 * - Whether boots should be required at this stage
 */
async function promptStages(numStages: number): Promise<StageDefinition[]> {
  console.log("");
  const stages: StageDefinition[] = [];
  let bootAlreadyRequired = false;
  let bootStageIndex = -1;

  for (let i = 0; i < numStages; i++) {
    console.log("");
    console.log(`═══ STAGE ${i + 1} ═══`);

    const previousCost = i > 0 ? stages[i - 1].maxCost : 0;
    const defaultCost = previousCost + 2000;

    const maxCost = parseInt(await promptNumber(`Max cost for stage ${i + 1}? (gold)`, {
      defaultValue: String(defaultCost),
      validator: (v) => {
        const num = parseInt(v, 10);
        if (isNaN(num) || num <= previousCost) {
          return `Must be greater than ${previousCost}`;
        }
        return true;
      },
    }), 10);

    const requiredItems = await promptCommaList(
      `Required items for stage ${i + 1}?`
    );

    const excludedItems = await promptCommaList(
      `Excluded items for stage ${i + 1}?`
    );

    let requireBoots: boolean | undefined = undefined;

    if (!bootAlreadyRequired) {
      const wantBoots = await promptConfirm(
        `Require boots at stage ${i + 1}?`,
        false
      );

      if (wantBoots) {
        requireBoots = true;
        bootAlreadyRequired = true;
        bootStageIndex = i;
      }
    } else {
      console.log(`ℹ Boots already required from stage ${bootStageIndex + 1}`);
    }

    const stage: StageDefinition = {
      maxCost,
      requiredItems: requiredItems.length > 0 ? requiredItems : undefined,
      excludedItems: excludedItems.length > 0 ? excludedItems : undefined,
      requireBoots,
    };

    stages.push(stage);
  }

  return stages;
}
