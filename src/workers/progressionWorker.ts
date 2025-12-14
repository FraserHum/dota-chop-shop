/**
 * Progression analysis worker for async processing.
 *
 * This worker runs the build progression analysis in a separate thread,
 * posting progress updates back to the main thread so the UI can remain
 * responsive.
 *
 * Uses Bun's native Worker API.
 */

/// <reference lib="webworker" />

import { ItemRepository } from "../data/ItemRepository";
import { analyzeProgression } from "../calculators/buildProgression";
import { DEFAULT_CONFIG } from "../config/analysisConfig";
import {
  ProgressionWorkerInput,
  ProgressionWorkerMessage,
  serializeBuildSequence,
} from "./types";

// Worker globals
declare function postMessage(message: ProgressionWorkerMessage): void;
declare const self: {
  onmessage: ((event: { data: ProgressionWorkerInput }) => void) | null;
};

// ─────────────────────────────────────────────────────────────
// Worker Message Handler
// ─────────────────────────────────────────────────────────────

self.onmessage = (event: { data: ProgressionWorkerInput }) => {
  const input = event.data;

  try {
    // Create item repository from plain item objects
    const repo = new ItemRepository(input.allItems);

    // Run the analysis with progress callback
    const result = analyzeProgression(
      input.allItems,
      input.config ?? DEFAULT_CONFIG,
      {
        stages: input.stages,
        defaultItemCount: input.defaultItemCount,
        resultLimit: input.resultLimit,
        beamWidth: input.beamWidth,
        minTotalRecovery: input.minTotalRecovery,
        statValuation: input.statValuation,
        auraMultiplier: input.auraMultiplier,
        targetCoverageWeight: input.targetCoverageWeight,
        inventorySlots: input.inventorySlots,
        backpackSlots: input.backpackSlots,
        onProgress: (update) => {
          // Forward progress updates to main thread
          postMessage({
            type: "progress",
            ...update,
          });
        },
      },
      repo
    );

    // Serialize the result for transfer back to main thread
    const serializedSequences = result.sequences.map(serializeBuildSequence);

    // Convert Maps to arrays for serialization
    const resolvedTargets: [number, string[]][] = [];
    for (const [stageIdx, items] of result.resolvedTargets) {
      resolvedTargets.push([stageIdx, items.map((item) => item.name)]);
    }

    const unresolvedTargets: [number, string[]][] = [];
    for (const [stageIdx, names] of result.unresolvedTargets) {
      unresolvedTargets.push([stageIdx, [...names]]);
    }

    postMessage({
      type: "result",
      sequences: serializedSequences,
      resolvedTargets,
      unresolvedTargets,
      stats: result.stats,
    });
  } catch (error) {
    postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
