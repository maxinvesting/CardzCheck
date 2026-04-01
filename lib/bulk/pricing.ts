/**
 * Bulk Mode — Low-End Pricing Engine
 *
 * Two-tier pricing strategy:
 *   1. High-confidence cards (>= STRONG_CONFIDENCE_THRESHOLD): attempt live eBay
 *      sold comps via searchEbayDualSignal, fall back to rules-based if unavailable.
 *   2. All other cards: rules-based price bands (fast, no API call).
 *
 * This keeps the pipeline quick for bulk processing while giving the best
 * price data to cards the AI is confident about.
 */

import {
  PRICE_BANDS,
  STRONG_CONFIDENCE_THRESHOLD,
  type PriceBandKey,
} from "./config";
import { searchEbayDualSignal } from "@/lib/ebay";
import type { IdentificationResult, PricingInput, PricingResult } from "@/types/bulk";
import { inferShopCategoryLabel } from "@/lib/cards/market-category";

// ----------------------------------------------------------------
// Internal: detect serial-numbered cards from insert/parallel notes
// ----------------------------------------------------------------

function hasSerialNumber(notes: string | null): boolean {
  if (!notes) return false;
  return /\/\d{1,4}/.test(notes) || /\b1\/1\b/i.test(notes);
}

// ----------------------------------------------------------------
// Internal: choose price band key based on identification signals
// ----------------------------------------------------------------

function choosePriceBand(id: IdentificationResult): PriceBandKey {
  if (!id.titleCandidate && !id.player) return "unknown";

  const hasInsertOrParallel =
    !!id.insertParallelNotes && id.insertParallelNotes.trim().length > 0;

  if (hasInsertOrParallel) {
    return hasSerialNumber(id.insertParallelNotes) ? "insert_numbered" : "insert_generic";
  }

  const inferredCategory = inferShopCategoryLabel(
    {
      title: id.titleCandidate,
      set: id.setName,
      player: id.player,
    },
    "Football"
  );

  if (id.rookieFlag && inferredCategory !== "Pokemon" && inferredCategory !== "One Piece") {
    return "rookie";
  }

  if (!id.year || !id.player) return "unknown";

  const yearNum = parseInt(id.year, 10);
  const isRecent = !isNaN(yearNum) && yearNum >= new Date().getFullYear() - 3;
  return isRecent ? "base_young" : "base_veteran";
}

// ----------------------------------------------------------------
// Internal: rules-based pricing (no external API)
// ----------------------------------------------------------------

function rulesBasedPrice(id: IdentificationResult): PricingResult {
  if (id.confidence === 0) {
    return {
      suggestedListingPrice: null,
      estimatedSalePrice: null,
      pricingConfidence: 0,
      pricingNotes: "Cannot price: card identification failed.",
    };
  }

  const inferredCategory = inferShopCategoryLabel(
    {
      title: id.titleCandidate,
      set: id.setName,
      player: id.player,
    },
    "Football"
  );

  const bandKey = choosePriceBand(id);
  const band = PRICE_BANDS[bandKey];
  let listingPrice: number = band.suggested;

  // Rookie bump for high-confidence identified rookies
  if (
    id.rookieFlag &&
    inferredCategory !== "Pokemon" &&
    inferredCategory !== "One Piece" &&
    id.confidence >= STRONG_CONFIDENCE_THRESHOLD
  ) {
    listingPrice = Math.round(listingPrice * 1.25 * 100) / 100;
  }

  // Floor pricing for low-confidence
  if (id.confidence < 0.60) listingPrice = band.low;

  const estimatedSalePrice = Math.round(listingPrice * 0.85 * 100) / 100;
  const pricingConfidence = Math.round(id.confidence * 0.85 * 1000) / 1000;

  const bandLabels: Record<PriceBandKey, string> = {
    base_veteran:    "base card (older era)",
    base_young:      "base card (modern era)",
    rookie:          "rookie card",
    insert_generic:  "insert/parallel",
    insert_numbered: "serial-numbered insert/parallel",
    unknown:         "unknown card type",
  };

  const notes = [
    `Band: ${bandLabels[bandKey]}.`,
    id.rookieFlag && id.confidence >= STRONG_CONFIDENCE_THRESHOLD ? "Rookie bump applied." : null,
    id.confidence < 0.60 ? "Low confidence — listed at floor price." : null,
    `Suggested: $${listingPrice.toFixed(2)} (rules-based; no live comps).`,
  ].filter(Boolean).join(" ");

  return { suggestedListingPrice: listingPrice, estimatedSalePrice, pricingConfidence, pricingNotes: notes };
}

// ----------------------------------------------------------------
// Internal: live eBay comps pricing (for strong-confidence cards only)
// ----------------------------------------------------------------

async function liveCompsPrice(id: IdentificationResult): Promise<PricingResult | null> {
  // Need at minimum a player name to search
  if (!id.player) return null;

  const inferredCategory = inferShopCategoryLabel(
    {
      title: id.titleCandidate,
      set: id.setName,
      player: id.player,
    },
    "Football"
  );

  try {
    const result = await searchEbayDualSignal({
      player: id.player,
      sport: inferredCategory,
      year: id.year ?? undefined,
      set: id.setName ?? undefined,
      grade: undefined, // bulk cards are ungraded
      cardNumber: id.cardNumber ?? undefined,
      parallelType: id.insertParallelNotes ?? undefined,
    });

    // If the API returned no data or marked as failed, bail out
    if (result.status === "failed" || !result.estimatedSaleRange.pricingAvailable) return null;

    const range = result.estimatedSaleRange.estimatedSaleRange;
    if (!range) return null;

    // Bulk mode: list at the low end of the range to move inventory faster
    const listingPrice = Math.round(range.low * 100) / 100;
    const estimatedSalePrice = Math.round(((range.low + range.high) / 2) * 100) / 100;

    if (listingPrice <= 0) return null;

    // Confidence: high when we have real market data, capped by our ID confidence
    const pricingConfidence = Math.min(0.95, id.confidence);

    const listingCount = result.forSale.count ?? 0;
    const notes = [
      `Live comps: ${listingCount} active listing(s) found.`,
      `Listing at low end of range ($${range.low.toFixed(2)}–$${range.high.toFixed(2)}).`,
      result.disclaimers?.[0] ? `Note: ${result.disclaimers[0]}` : null,
    ].filter(Boolean).join(" ");

    return { suggestedListingPrice: listingPrice, estimatedSalePrice, pricingConfidence, pricingNotes: notes };
  } catch (err) {
    // Non-fatal — fall back to rules-based
    console.warn("[bulk/pricing] live comps lookup failed, using rules-based:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Estimate a price for a bulk mode card.
 *
 * For high-confidence identifications (>= STRONG_CONFIDENCE_THRESHOLD),
 * attempts to fetch live eBay sold comps first. Falls back to rules-based
 * pricing if live data is unavailable or the card is low-confidence.
 *
 * This is async because of the optional live comps fetch.
 */
export async function estimateBulkPrice(input: PricingInput): Promise<PricingResult> {
  const { identification } = input;

  // Try live comps for well-identified cards
  if (identification.confidence >= STRONG_CONFIDENCE_THRESHOLD) {
    const liveResult = await liveCompsPrice(identification);
    if (liveResult) return liveResult;
  }

  // Fall back to (or directly use) rules-based
  return rulesBasedPrice(identification);
}

/**
 * Synchronous rules-based-only pricing.
 * Use when you need instant results without any API calls
 * (e.g., for re-processing without hitting eBay rate limits).
 */
export function estimateBulkPriceSync(input: PricingInput): PricingResult {
  return rulesBasedPrice(input.identification);
}
