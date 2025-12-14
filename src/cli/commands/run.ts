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
      auraMultiplier: generalConfig.auraMultiplier,
      itemCount: generalConfig.itemCount,
      resultLimit: generalConfig.resultLimit,
      beamWidth: generalConfig.beamWidth,
      minReuse: generalConfig.minReuse,
      targetCoverage: generalConfig.targetCoverage,
      inventorySlots: generalConfig.inventorySlots,
      backpackSlots: generalConfig.backpackSlots,
      exclude: generalConfig.exclude,
      stages,
      slotOptions: {
        inventorySlots: generalConfig.inventorySlots,
        backpackSlots: generalConfig.backpackSlots,
      },
      onProgress: (msg) => console.log(msg),
    };

    // Run analysis
    const s = spinner();
    s.start("Analyzing progression...");

    const result = await analyzeProgression(ctx, options);

    s.stop("Analysis complete!");
    console.log("");

    // Display results
    console.log(formatProgressionStats(result));
    console.log("");
    console.log(formatProgression(result, generalConfig.resultLimit));

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
    (await promptNumber("Aura Multiplier?", {
      defaultValue: "1.0",
      validator: (v) => {
        const num = parseFloat(v);
        if (isNaN(num) || num < 0.5 || num > 10) {
          return "Must be between 0.5 and 10";
        }
        return true;
      },
    }));

  const itemCount = await promptNumber("Max items per loadout? (1-6)", {
    defaultValue: "3",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 6) {
        return "Must be between 1 and 6";
      }
      return true;
    },
  });

  const resultLimit = await promptNumber("Maximum results to show? (1-100)", {
    defaultValue: "20",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 100) {
        return "Must be between 1 and 100";
      }
      return true;
    },
  });

  const beamWidthInput = await promptString(
    "Beam width for search? (leave empty for auto)",
    {
      defaultValue: "auto",
      placeholder: "auto or number",
    }
  );

  const beamWidth =
    beamWidthInput === "auto" ? undefined : parseInt(beamWidthInput, 10) || undefined;

  const minReuse = await promptNumber("Minimum component reuse? (0.0-1.0)", {
    defaultValue: "0.3",
    validator: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return "Must be between 0.0 and 1.0";
      }
      return true;
    },
  });

  const targetCoverage = await promptNumber("Target coverage weight? (0.0-1.0)", {
    defaultValue: "0.4",
    validator: (v) => {
      const num = parseFloat(v);
      if (isNaN(num) || num < 0 || num > 1) {
        return "Must be between 0.0 and 1.0";
      }
      return true;
    },
  });

  const inventorySlots = await promptNumber("Inventory slots? (1-6)", {
    defaultValue: "6",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 1 || num > 6) {
        return "Must be between 1 and 6";
      }
      return true;
    },
  });

  const backpackSlots = await promptNumber("Backpack slots? (0-3)", {
    defaultValue: "3",
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < 0 || num > 3) {
        return "Must be between 0 and 3";
      }
      return true;
    },
  });

  const excludeList = await promptCommaList("Exclude specific items?");

  return {
    auraMultiplier: typeof auraMultiplier === "string" ? parseFloat(auraMultiplier) : auraMultiplier,
    itemCount: typeof itemCount === "string" ? parseInt(itemCount, 10) : itemCount,
    resultLimit: typeof resultLimit === "string" ? parseInt(resultLimit, 10) : resultLimit,
    beamWidth,
    minReuse: typeof minReuse === "string" ? parseFloat(minReuse) : minReuse,
    targetCoverage: typeof targetCoverage === "string" ? parseFloat(targetCoverage) : targetCoverage,
    inventorySlots: typeof inventorySlots === "string" ? parseInt(inventorySlots, 10) : inventorySlots,
    backpackSlots: typeof backpackSlots === "string" ? parseInt(backpackSlots, 10) : backpackSlots,
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

  return typeof result === "string" ? parseInt(result, 10) : result;
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

  for (let i = 0; i < numStages; i++) {
    console.log("");
    console.log(`═══ STAGE ${i + 1} ═══`);

    const defaultCost = i === 0 ? "2000" : String(parseInt((stages[i - 1].maxCost || 2000) as string, 10) + 2000);

    const maxCost = await promptNumber(`Max cost for stage ${i + 1}? (gold)`, {
      defaultValue: defaultCost,
      validator: (v) => {
        const num = parseInt(v, 10);
        const previousCost = i > 0 ? (stages[i - 1].maxCost as number) : 0;
        if (isNaN(num) || num <= previousCost) {
          return `Must be greater than ${previousCost}`;
        }
        return true;
      },
    });

    const requiredItems = await promptCommaList(
      `Required items for stage ${i + 1}? (optional)`
    );

    const excludedItems = await promptCommaList(
      `Excluded items for stage ${i + 1}? (optional)`
    );

    let requireBoots: number | undefined = undefined;

    if (!bootAlreadyRequired) {
      const wantBoots = await promptConfirm(
        `Require boots at stage ${i + 1}?`,
        false
      );

      if (wantBoots) {
        requireBoots = i;
        bootAlreadyRequired = true;
      }
    } else {
      console.log(`ℹ Boots already required from stage ${stages.findIndex((s) => s.requireBoots !== undefined) + 1}`);
    }

    const stage: StageDefinition = {
      maxCost: typeof maxCost === "string" ? parseInt(maxCost, 10) : maxCost,
    };

    if (requiredItems.length > 0) {
      stage.requiredItems = requiredItems;
    }

    if (excludedItems.length > 0) {
      stage.excludedItems = excludedItems;
    }

    if (requireBoots !== undefined) {
      stage.requireBoots = requireBoots;
    }

    stages.push(stage);
  }

  return stages;
}
