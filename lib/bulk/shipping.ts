/**
 * Bulk Mode — Shipping & Margin Engine
 *
 * Computes:
 *   - eBay Standard Envelope eligibility
 *   - Estimated shipping cost
 *   - eBay fee estimate
 *   - Net profit
 *   - Whether the card is worth listing at all
 *
 * All cost constants live in config.ts for easy operator adjustment.
 */

import {
  ESE_MAX_SALE_PRICE,
  ESE_SHIPPING_TIERS,
  ESE_DEFAULT_TIER_OZ,
  FIRST_CLASS_SHIPPING_COST,
  PACKAGING_COST,
  EBAY_FIXED_FEE,
  EBAY_FINAL_VALUE_FEE_RATE,
  MIN_NET_PROFIT_THRESHOLD,
} from "./config";
import type { ShippingInput, ShippingResult } from "@/types/bulk";

// ----------------------------------------------------------------
// Internal: look up ESE shipping cost for a given weight in oz
// ----------------------------------------------------------------

function getEseCost(oz: number): number {
  const tier = ESE_SHIPPING_TIERS.find((t) => oz <= t.maxOz);
  // Fall back to the most expensive tier if over the max
  return tier?.cost ?? ESE_SHIPPING_TIERS[ESE_SHIPPING_TIERS.length - 1].cost;
}

// ----------------------------------------------------------------
// Internal: estimate total eBay fees for a given sale price
// ----------------------------------------------------------------

function estimateEbayFee(salePrice: number): number {
  const finalValueFee = salePrice * EBAY_FINAL_VALUE_FEE_RATE;
  return Math.round((EBAY_FIXED_FEE + finalValueFee) * 100) / 100;
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Calculate shipping eligibility, fees, and net profit for a single card.
 *
 * Assumes a single card at the default ESE weight (1 oz).
 * Multi-card bundles should call this with an adjusted oz estimate.
 *
 * @param input  Pricing output for this item
 * @param weightOz  Override the weight assumption (default: ESE_DEFAULT_TIER_OZ)
 */
export function computeShippingAndMargin(
  input: ShippingInput,
  weightOz: number = ESE_DEFAULT_TIER_OZ,
): ShippingResult {
  const salePrice = input.estimatedSalePrice ?? 0;
  const listingPrice = input.suggestedListingPrice ?? 0;

  // eBay Standard Envelope: card must be <= ESE_MAX_SALE_PRICE to qualify
  const eseEligible = listingPrice > 0 && listingPrice <= ESE_MAX_SALE_PRICE;

  // Choose shipping method
  const shippingCost = eseEligible
    ? getEseCost(weightOz)
    : FIRST_CLASS_SHIPPING_COST;

  // Estimate eBay fees based on estimated sale price
  const ebayFee = salePrice > 0 ? estimateEbayFee(salePrice) : EBAY_FIXED_FEE;

  // Net profit = sale price - shipping - eBay fees - packaging
  const netProfit =
    Math.round(
      (salePrice - shippingCost - ebayFee - PACKAGING_COST) * 100
    ) / 100;

  // Flag as "not worth listing" if below the minimum profit threshold
  const notWorthListing = netProfit < MIN_NET_PROFIT_THRESHOLD;

  return {
    eseEligible,
    estimatedShippingCost: shippingCost,
    estimatedEbayFee: ebayFee,
    estimatedNetProfit: netProfit,
    notWorthListing,
  };
}

/**
 * Human-readable explanation of the margin calculation.
 * Useful for the strategy rationale field.
 */
export function buildMarginRationale(result: ShippingResult, salePrice: number): string {
  const parts: string[] = [];

  if (result.eseEligible) {
    parts.push("eBay Standard Envelope eligible.");
  } else {
    parts.push("Not ESE eligible (price above threshold); using first-class shipping.");
  }

  parts.push(
    `Fees: $${result.estimatedEbayFee.toFixed(2)} eBay + $${result.estimatedShippingCost.toFixed(2)} ship + $${PACKAGING_COST.toFixed(2)} pkg = $${(result.estimatedEbayFee + result.estimatedShippingCost + PACKAGING_COST).toFixed(2)} total costs on ~$${salePrice.toFixed(2)} sale.`
  );

  parts.push(`Net: $${result.estimatedNetProfit.toFixed(2)}.`);

  if (result.notWorthListing) {
    parts.push(`Below min profit threshold ($${MIN_NET_PROFIT_THRESHOLD.toFixed(2)}) — recommending skip.`);
  }

  return parts.join(" ");
}
