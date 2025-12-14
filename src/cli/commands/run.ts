/**
 * Interactive Run Command
 *
 * Guides users through a step-by-step interactive flow to build a custom
 * progression analysis without needing to know command-line syntax.
 *
 * Uses @clack/prompts for beautiful, accessible terminal UI.
 */

import { CliContext } from "../context";
import {
  promptNumber,
  promptString,
  promptSelect,
  promptConfirm,
  promptCommaList,
} from "../prompts";
import {
  analyzeProgression,
  stagesFromCosts,
  stagesForTargets,
  stagesForIncrementalTargets,
  formatProgression,
  formatProgressionStats,
} from "../../calculators/buildProgression";
import { BuildProgressionOptions, StageDefinition } from "../../models/buildTypes";
import { intro, outro, spinner } from "@clack/prompts";

type StageMethod = "thresholds" | "targets" | "combined" | "custom";

/**
 * Main entry point for interactive run command
 */
export async function printInteractiveRun(
  ctx: CliContext,
  prefilledAura?: number
): Promise<void> {
  intro("Welcome to chop-shop interactive mode!");

  try {
    // Phase 1: Collect general flags
    const generalFlags = await promptGeneralFlags(prefilledAura);

    // Phase 2: Choose stage definition method
    const stageMethod = await promptStageMethod();

    // Phase 3 & 4: Get stages based on method
    let stages: StageDefinition[] = [];

    switch (stageMethod) {
      case "thresholds": {
        const numStages = await promptNumberOfStages();
        const costs = await promptCostThresholds(numStages);
        stages = stagesFromCosts(costs);
        break;
      }

      case "targets": {
        const targets = await promptTargetItems();
        stages = stagesForTargets(targets);
        break;
      }

      case "combined": {
        const numStages = await promptNumberOfStages();
        const targets = await promptIncrementalTargets(numStages);
        const costs = await promptCostThresholds(numStages);
        stages = stagesForIncrementalTargets(targets, costs);
        break;
      }

      case "custom": {
        stages = await promptCustomStages();
        break;
      }
    }

    // Build final options
    const options: BuildProgressionOptions = {
      auraMultiplier: generalFlags.auraMultiplier,
      itemCount: generalFlags.itemCount,
      resultLimit: generalFlags.resultLimit,
      beamWidth: generalFlags.beamWidth,
      minReuse: generalFlags.minReuse,
      targetCoverage: generalFlags.targetCoverage,
      inventorySlots: generalFlags.inventorySlots,
      backpackSlots: generalFlags.backpackSlots,
      exclude: generalFlags.exclude,
      stages,
      slotOptions: {
        inventorySlots: generalFlags.inventorySlots,
        backpackSlots: generalFlags.backpackSlots,
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
    console.log(formatProgression(result, 20));

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
 * Phase 1: Prompt for general flags
 */
async function promptGeneralFlags(
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
      defaultValue: 1.0,
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
 * Phase 2: Choose stage definition method
 */
async function promptStageMethod(): Promise<StageMethod> {
  console.log("");
  const method = await promptSelect<StageMethod>(
    "How would you like to define stages?",
    [
      {
        value: "thresholds",
        label: "Cost thresholds (e.g., 2000g, 4000g, 7000g)",
      },
      {
        value: "targets",
        label: "Target items (e.g., Force Staff, Skadi)",
      },
      {
        value: "combined",
        label: "Combined (both cost thresholds and target items)",
      },
      {
        value: "custom",
        label: "Custom JSON (full control)",
      },
    ],
    "thresholds"
  );

  return method;
}

/**
 * Phase 3: Get number of stages
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
 * Get cost threshold for each stage
 */
async function promptCostThresholds(numStages: number): Promise<number[]> {
  console.log("");
  const costs: number[] = [];
  let previousCost = 0;

  for (let i = 0; i < numStages; i++) {
    const defaultCost = previousCost + (i === 0 ? 2000 : 2000);

    const result = await promptNumber(`Max cost for stage ${i + 1}? (gold)`, {
      defaultValue: String(defaultCost),
      validator: (v) => {
        const num = parseInt(v, 10);
        if (isNaN(num) || num <= previousCost) {
          return `Must be greater than ${previousCost}`;
        }
        return true;
      },
    });

    const cost = typeof result === "string" ? parseInt(result, 10) : result;
    costs.push(cost);
    previousCost = cost;
  }

  return costs;
}

/**
 * Get target items for incremental acquisition
 */
async function promptTargetItems(): Promise<string[]> {
  console.log("");
  return await promptCommaList("Target items to acquire?");
}

/**
 * Get target items per stage for combined method
 */
async function promptIncrementalTargets(numStages: number): Promise<string[]> {
  console.log("");
  const targets: string[] = [];

  for (let i = 0; i < numStages; i++) {
    const target = await promptString(`Target item for stage ${i + 1}?`, {
      defaultValue: "",
      placeholder: "optional",
    });

    if (target.trim()) {
      targets.push(target.trim());
    }
  }

  return targets;
}

/**
 * Get custom JSON stage definitions
 */
async function promptCustomStages(): Promise<StageDefinition[]> {
  console.log("");
  const jsonInput = await promptString(
    "Paste JSON stage definitions (or path to file):",
    {
      defaultValue: '[]',
    }
  );

  try {
    // Try parsing as JSON first
    return JSON.parse(jsonInput) as StageDefinition[];
  } catch {
    // If that fails, might be a file path
    throw new Error("Invalid JSON format. Please provide valid JSON array.");
  }
}
