/**
 * eBay fee calculator for US trading card sales.
 *
 * Produces a single `platform_fees_cents` value that flows directly into
 * the existing createSale() call — no profit math is reimplemented here.
 *
 * Fee schedule reference (as of early 2026):
 *   - Standard seller: 13.25% FVF + $0.30/order (trading card categories)
 *   - Top Rated Plus: 12.35% FVF + $0.30/order (10% discount on FVF)
 *   - Insertion fee: $0 for standard store / first 250 free listings
 *   - Promoted listings: optional % of final sale price (0% if not promoted)
 *
 * eBay category IDs for trading cards:
 *   261328 — Sports Trading Cards (parent)
 *   183454 — CCG Individual Cards (Pokemon / One Piece / other TCG)
 *   183050 — Non-Sport Trading Cards
 *   261333 — Football Cards
 *   261334 — Baseball Cards
 *   261335 — Basketball Cards
 */

import type { EbayFeeResult } from "./types";

/** eBay FVF rates for US trading cards (fractional, e.g. 0.1325 = 13.25%) */
const STANDARD_FVF_RATE = 0.1325;
const TOP_RATED_FVF_RATE = 0.1235; // 10% discount for Top Rated Plus
const PER_ORDER_FEE_CENTS = 30; // $0.30 flat per order

/**
 * Calculate eBay fees for a single order line.
 *
 * @param soldPriceCents      - The card's sale price in cents (before shipping)
 * @param isTopRated          - Whether the seller is Top Rated Plus (12.35% vs 13.25%)
 * @param promotedListingRate - Optional promoted listings ad rate (0.0–1.0). Default 0.
 */
export function calculateEbayFees(
  soldPriceCents: number,
  isTopRated = false,
  promotedListingRate = 0
): EbayFeeResult {
  if (soldPriceCents <= 0) {
    return {
      platform_fees_cents: 0,
      final_value_fee_cents: 0,
      per_order_fee_cents: 0,
      promoted_listing_fee_cents: 0,
    };
  }

  const fvfRate = isTopRated ? TOP_RATED_FVF_RATE : STANDARD_FVF_RATE;
  const finalValueFeeCents = Math.round(soldPriceCents * fvfRate);
  const promotedListingFeeCents =
    promotedListingRate > 0
      ? Math.round(soldPriceCents * promotedListingRate)
      : 0;

  const platformFeesCents =
    finalValueFeeCents + PER_ORDER_FEE_CENTS + promotedListingFeeCents;

  return {
    platform_fees_cents: platformFeesCents,
    final_value_fee_cents: finalValueFeeCents,
    per_order_fee_cents: PER_ORDER_FEE_CENTS,
    promoted_listing_fee_cents: promotedListingFeeCents,
  };
}

/**
 * Estimate eBay fees for a hypothetical listing (used in UI margin preview).
 * Same math as calculateEbayFees, exposed with a distinct name to make
 * intent clear at call sites.
 */
export function estimateEbayFees(
  listPriceCents: number,
  isTopRated = false
): EbayFeeResult {
  return calculateEbayFees(listPriceCents, isTopRated);
}
