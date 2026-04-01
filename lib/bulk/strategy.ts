/**
 * Bulk Mode — Strategy Recommendation Engine
 *
 * Decides the best listing strategy for each card:
 *   single           → list as an individual card
 *   multi_quantity   → list as a multi-quantity lot (duplicates)
 *   bundle_candidate → flag for grouping with similar cards
 *   skip             → not worth listing
 *
 * All thresholds live in config.ts.
 */

import {
  LOW_CONFIDENCE_THRESHOLD,
  DUPLICATE_MULTI_QTY_THRESHOLD,
  MIN_NET_PROFIT_THRESHOLD,
} from "./config";
import { buildMarginRationale } from "./shipping";
import type { StrategyInput, StrategyResult } from "@/types/bulk";

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Recommend a listing strategy for one card given all available signals.
 *
 * Decision tree (in priority order):
 * 1. If not_worth_listing → skip
 * 2. If identification confidence is too low → needs review (still assigned, but flagged)
 * 3. If duplicates >= threshold → multi_quantity
 * 4. If player/set cluster potential (insert + low dupe count) → bundle_candidate
 * 5. Otherwise → single
 */
export function recommendStrategy(input: StrategyInput): StrategyResult {
  const { identification, pricing, shipping, duplicateCount } = input;

  // ----------------------------------------------------------------
  // Rule 1: Not profitable → skip
  // ----------------------------------------------------------------
  if (shipping.notWorthListing || (shipping.estimatedNetProfit ?? 0) < MIN_NET_PROFIT_THRESHOLD) {
    const marginNote = buildMarginRationale(shipping, pricing.estimatedSalePrice ?? 0);
    return {
      recommendedStrategy: "skip",
      rationale: `Not worth listing. ${marginNote}`,
    };
  }

  // ----------------------------------------------------------------
  // Rule 2: Low identification confidence
  // We still assign a strategy but mark needs_review in identification.
  // This lets the user see the card and decide manually.
  // ----------------------------------------------------------------
  const confidenceLow = identification.confidence < LOW_CONFIDENCE_THRESHOLD;

  // ----------------------------------------------------------------
  // Rule 3: Duplicate count qualifies for multi-quantity listing
  // ----------------------------------------------------------------
  if (duplicateCount >= DUPLICATE_MULTI_QTY_THRESHOLD) {
    const marginNote = buildMarginRationale(shipping, pricing.estimatedSalePrice ?? 0);
    return {
      recommendedStrategy: "multi_quantity",
      rationale: `${duplicateCount} copies detected in this batch — recommend multi-quantity listing. ${marginNote}${confidenceLow ? " Confidence is low; review before listing." : ""}`,
    };
  }

  // ----------------------------------------------------------------
  // Rule 4: Bundle candidate heuristic
  // Cards with insert/parallel notes and a low dupe count within the same
  // player/set cluster are good candidates to bundle together later.
  // ----------------------------------------------------------------
  const hasInsertOrParallel =
    !!identification.insertParallelNotes &&
    identification.insertParallelNotes.trim().length > 0;

  if (hasInsertOrParallel && duplicateCount < DUPLICATE_MULTI_QTY_THRESHOLD) {
    const marginNote = buildMarginRationale(shipping, pricing.estimatedSalePrice ?? 0);
    return {
      recommendedStrategy: "bundle_candidate",
      rationale: `Insert/parallel card — may pair well in a themed lot. ${marginNote}${confidenceLow ? " Confidence is low; review before listing." : ""}`,
    };
  }

  // ----------------------------------------------------------------
  // Rule 5: Default → single listing
  // ----------------------------------------------------------------
  const marginNote = buildMarginRationale(shipping, pricing.estimatedSalePrice ?? 0);
  return {
    recommendedStrategy: "single",
    rationale: `Standard single card listing. ${marginNote}${confidenceLow ? " Confidence is low; review before listing." : ""}`,
  };
}
