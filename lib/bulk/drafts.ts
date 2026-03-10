/**
 * Bulk Mode — Draft Listing Generator
 *
 * Assembles draft eBay listing payloads from identification + pricing + strategy data.
 * Drafts are stored as JSONB in bulk_listing_drafts and displayed in the review UI.
 *
 * This does NOT post to eBay. It produces a structured payload that a future
 * eBay listing integration can consume.
 *
 * TODO: When eBay listing API integration is available, pipe the payload here.
 */

import type {
  BulkListingPayload,
  IdentificationResult,
  PricingResult,
  ShippingResult,
  StrategyResult,
  BulkStrategy,
} from "@/types/bulk";

// ----------------------------------------------------------------
// Internal: build item specifics for the eBay listing
// ----------------------------------------------------------------

function buildItemSpecifics(id: IdentificationResult): Record<string, string> {
  const specifics: Record<string, string> = {};

  if (id.player)    specifics["Player"] = id.player;
  if (id.brand)     specifics["Manufacturer"] = id.brand;
  if (id.setName)   specifics["Set"] = id.setName;
  if (id.year)      specifics["Season"] = id.year;
  if (id.cardNumber) specifics["Card Number"] = id.cardNumber;

  if (id.rookieFlag) {
    specifics["Rookie"] = "Yes";
  }

  if (id.insertParallelNotes) {
    specifics["Parallel/Variety"] = id.insertParallelNotes;
  }

  // Sports cards are almost always raw (ungraded) in bulk mode
  specifics["Grade"] = "Ungraded";
  specifics["Sport"] = "Sports Cards"; // TODO: get from identification when available

  return specifics;
}

// ----------------------------------------------------------------
// Internal: pick shipping method label
// ----------------------------------------------------------------

function pickShippingMethod(
  shipping: ShippingResult,
): BulkListingPayload["shipping_method"] {
  if (shipping.eseEligible) return "standard_envelope";
  return "first_class";
}

// ----------------------------------------------------------------
// Internal: determine condition label
// For bulk mode, all cards are assumed to be raw/ungraded
// ----------------------------------------------------------------

function pickCondition(): BulkListingPayload["condition"] {
  // Default for raw bulk cards; operator can adjust in review UI
  return "Very Good";
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Build a draft eBay listing payload from all pipeline outputs.
 *
 * @param id             Card identification result
 * @param pricing        Price engine result
 * @param shipping       Margin engine result
 * @param strategy       Strategy engine result
 * @param imageUrls      Array of image URLs to attach (front first)
 * @param duplicateCount How many of this card are in the batch (sets quantity)
 */
export function buildListingDraft(
  id: IdentificationResult,
  pricing: PricingResult,
  shipping: ShippingResult,
  strategy: StrategyResult,
  imageUrls: string[],
  duplicateCount: number,
): BulkListingPayload {
  const title = id.titleCandidate ?? buildFallbackTitle(id);

  // Quantity: for multi-quantity strategy use duplicate count; otherwise 1
  const quantity = strategy.recommendedStrategy === "multi_quantity"
    ? Math.max(1, duplicateCount)
    : 1;

  // Build notes that will appear in the review UI
  const internalNotes = buildInternalNotes(id, pricing, shipping, strategy);

  return {
    title: title.slice(0, 80), // eBay title limit is 80 characters
    price: pricing.suggestedListingPrice ?? 0.99,
    condition: pickCondition(),
    category_hint: detectCategoryHint(id),
    photos: imageUrls.slice(0, 12), // eBay max 12 photos per listing
    shipping_method: pickShippingMethod(shipping),
    quantity,
    item_specifics: buildItemSpecifics(id),
    strategy: strategy.recommendedStrategy as BulkStrategy,
    internal_notes: internalNotes,
  };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function buildFallbackTitle(id: IdentificationResult): string {
  if (id.player) return `${id.player} Sports Card`;
  return "Sports Trading Card";
}

function detectCategoryHint(id: IdentificationResult): string | null {
  // TODO: Map to real eBay category IDs once category lookup is wired up
  if (id.rookieFlag) return "Sports Trading Cards > Rookie Cards";
  if (id.insertParallelNotes) return "Sports Trading Cards > Inserts & Parallels";
  return "Sports Trading Cards";
}

function buildInternalNotes(
  id: IdentificationResult,
  pricing: PricingResult,
  shipping: ShippingResult,
  strategy: StrategyResult,
): string {
  const lines: string[] = [];

  lines.push(`Strategy: ${strategy.recommendedStrategy}`);
  lines.push(`Confidence: ${(id.confidence * 100).toFixed(0)}%`);

  if (pricing.pricingNotes) {
    lines.push(`Pricing: ${pricing.pricingNotes}`);
  }

  lines.push(`Net profit est.: $${shipping.estimatedNetProfit?.toFixed(2) ?? "?"}`);

  if (id.needsReview) {
    lines.push("⚠ Flagged for manual review (low ID confidence or missing fields).");
  }

  return lines.join("\n");
}
