/**
 * Transitions Analysis Command
 * 
 * Analyzes build transitions from early to late game items.
 * Uses parallel processing for trio analysis when running under Bun.
 */

import { CliContext } from "../context";
import { 
  analyzePairTransitions, 
  analyzeTrioTransitions,
  analyzeTrioTransitionsParallel,
} from "../../calculators/buildAnalysis";
import {
  formatTransitionsTable,
  formatTransitionsDetails,
  formatTransitionsSummary,
} from "../../output/display";
import { BuildAnalysisResult } from "../../models/buildTypes";

/**
 * Options for transition analysis.
 */
export interface TransitionsOptions {
  /** Analysis type: "pair" (2→2), "trio" (3→3), or "both" */
  type?: "pair" | "trio" | "both";
  /** Maximum transitions to display in table */
  tableLimit?: number;
  /** Maximum transitions to show details for */
  detailLimit?: number;
  /** Show summary only */
  summaryOnly?: boolean;
  /** Use parallel processing for trio analysis (requires Bun) */
  parallel?: boolean;
  /** Show progress during parallel analysis */
  showProgress?: boolean;
  /** Maximum total cost for initial build (e.g., 4000 for early game budget) */
  initialBuildMaxCost?: number;
}

/**
 * Result of transition analysis.
 */
export interface TransitionsResult {
  pair?: BuildAnalysisResult;
  trio?: BuildAnalysisResult;
}

/**
 * Check if we're running under Bun.
 */
function isBun(): boolean {
  return typeof globalThis.Bun !== "undefined";
}

/**
 * Run transition analysis and return results.
 */
export async function runTransitionsAnalysis(
  ctx: CliContext,
  options: TransitionsOptions = {}
): Promise<TransitionsResult> {
  const { type = "both", parallel = true, showProgress = true, initialBuildMaxCost } = options;

  const result: TransitionsResult = {};

  if (type === "pair" || type === "both") {
    result.pair = analyzePairTransitions(ctx.items, ctx.config, ctx.repo, ctx.statValuation, initialBuildMaxCost);
  }

  if (type === "trio" || type === "both") {
    // Use parallel processing if available and requested
    const useParallel = parallel && isBun();
    
    if (useParallel) {
      const startTime = performance.now();
      let lastProgress = 0;
      
      result.trio = await analyzeTrioTransitionsParallel(
        ctx.items,
        ctx.config,
        ctx.repo,
        ctx.statValuation,
        showProgress ? (progress) => {
          // Only log every 10% to avoid spam
          const currentPercent = Math.floor(progress.overallProgress * 100);
          if (currentPercent >= lastProgress + 10) {
            lastProgress = currentPercent;
            process.stdout.write(`\rAnalyzing trio transitions... ${currentPercent}% (${progress.valid} valid)`);
          }
        } : undefined,
        initialBuildMaxCost
      );
      
      if (showProgress) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\rAnalyzing trio transitions... 100% complete in ${elapsed}s\n`);
      }
    } else {
      result.trio = analyzeTrioTransitions(ctx.items, ctx.config, ctx.repo, ctx.statValuation, initialBuildMaxCost);
    }
  }

  return result;
}

/**
 * Run transition analysis synchronously (for backwards compatibility).
 * Note: Uses single-threaded analysis for trios.
 */
export function runTransitionsAnalysisSync(
  ctx: CliContext,
  options: TransitionsOptions = {}
): TransitionsResult {
  const { type = "both" } = options;

  const result: TransitionsResult = {};

  if (type === "pair" || type === "both") {
    result.pair = analyzePairTransitions(ctx.items, ctx.config, ctx.repo, ctx.statValuation);
  }

  if (type === "trio" || type === "both") {
    result.trio = analyzeTrioTransitions(ctx.items, ctx.config, ctx.repo, ctx.statValuation);
  }

  return result;
}

/**
 * Print transition analysis to console.
 */
export async function printTransitionsAnalysis(
  ctx: CliContext,
  options: TransitionsOptions = {}
): Promise<void> {
  const { tableLimit = 15, detailLimit = 5, summaryOnly = false } = options;

  const result = await runTransitionsAnalysis(ctx, options);

  if (result.pair) {
    console.log("=".repeat(60));
    console.log("BUILD TRANSITIONS - PAIR ANALYSIS (2 Early → 2 Final)");
    console.log("=".repeat(60));
    console.log("\n");

    console.log(formatTransitionsSummary(result.pair));
    console.log("\n");

    if (!summaryOnly) {
      console.log("Top Pair Transitions:\n");
      console.log(formatTransitionsTable(result.pair, tableLimit));
      console.log("\n");
      console.log("Detailed Pair Transitions:\n");
      console.log(formatTransitionsDetails(result.pair, detailLimit));
    }
  }

  if (result.trio) {
    console.log("=".repeat(60));
    console.log("BUILD TRANSITIONS - TRIO ANALYSIS (3 Early → 3 Final)");
    console.log("=".repeat(60));
    console.log("\n");

    console.log(formatTransitionsSummary(result.trio));
    console.log("\n");

    if (!summaryOnly) {
      console.log("Top Trio Transitions:\n");
      console.log(formatTransitionsTable(result.trio, tableLimit));
      console.log("\n");
      console.log("Detailed Trio Transitions:\n");
      console.log(formatTransitionsDetails(result.trio, detailLimit));
    }
  }
}
