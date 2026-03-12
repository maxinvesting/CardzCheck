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
import { inferCardMarketDomain } from "@/lib/cards/market-category";

// ----------------------------------------------------------------
// Internal: build item specifics for the eBay listing
// ----------------------------------------------------------------

function buildItemSpecifics(id: IdentificationResult): Record<string, string> {
  const specifics: Record<string, string> = {};
  const domain = inferCardMarketDomain({
    title: id.titleCandidate,
    set: id.setName,
    player: id.player,
  });

  if (id.player) {
    specifics[domain === "sports" ? "Player" : "Card Name"] = id.player;
  }
  if (id.brand)     specifics["Manufacturer"] = id.brand;
  if (id.setName)   specifics["Set"] = id.setName;
  if (id.year) {
    specifics[domain === "sports" ? "Season" : "Year Manufactured"] = id.year;
  }
  if (id.cardNumber) specifics["Card Number"] = id.cardNumber;

  if (id.rookieFlag && domain === "sports") {
    specifics["Rookie"] = "Yes";
  }

  if (id.insertParallelNotes) {
    specifics[domain === "sports" ? "Parallel/Variety" : "Card Variant"] =
      id.insertParallelNotes;
  }

  // Bulk mode defaults to raw/ungraded unless changed in review.
  specifics["Grade"] = "Ungraded";

  if (domain === "sports") specifics["Sport"] = "Sports Cards";
  if (domain === "pokemon") specifics["Game"] = "Pokemon TCG";
  if (domain === "one_piece") specifics["Game"] = "One Piece Card Game";
  if (domain === "other_tcg") specifics["Game"] = "Trading Card Game";

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
  if (id.player) return `${id.player} Trading Card`;
  return "Trading Card";
}

function detectCategoryHint(id: IdentificationResult): string | null {
  const domain = inferCardMarketDomain({
    title: id.titleCandidate,
    set: id.setName,
    player: id.player,
  });

  if (domain === "sports") {
    if (id.rookieFlag) return "Sports Trading Cards > Rookie Cards";
    if (id.insertParallelNotes) return "Sports Trading Cards > Inserts & Parallels";
    return "Sports Trading Cards";
  }

  if (domain === "pokemon") return "Collectible Card Games > Pokemon > Individual Cards";
  if (domain === "one_piece") return "Collectible Card Games > One Piece > Individual Cards";
  if (domain === "other_tcg") return "Collectible Card Games > Individual Cards";
  return "Non-Sport Trading Cards";
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
