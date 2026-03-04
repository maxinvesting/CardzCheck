/**
 * eBay Parity Price Calculator
 *
 * Given a Shop (direct-sale) price, calculates the eBay listing price so
 * the seller nets the same amount after eBay fees.
 *
 * Standard eBay final-value fee: 13%
 * Top Rated Plus discount:       12%
 *
 * Formula:  ebayPrice = shopPrice / (1 - feeRate)
 *
 * Example: Shop price $100, standard 13%
 *          → eBay price = 100 / 0.87 = $114.94
 */

import { EBAY_FEE_RATES, type EbayFeeProfile } from "@/contexts/EbaySettingsContext";

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the eBay listing price that nets the seller the same amount as a
 * given shop (direct) price, after eBay's final-value fee is deducted.
 *
 * @param shopPriceCents  The direct-sale price in cents.
 * @param feeRate         Decimal fee rate (e.g. 0.13 for 13%).
 * @returns               The required eBay listing price in cents (rounded up
 *                        to the nearest cent so the seller never under-nets).
 */
export function calculateEbayParityPriceCents(
  shopPriceCents: number,
  feeRate: number
): number {
  if (shopPriceCents <= 0 || feeRate < 0 || feeRate >= 1) return 0;
  return Math.ceil(shopPriceCents / (1 - feeRate));
}

/**
 * Convenience overload using a named fee profile.
 */
export function calculateEbayParityPriceCentsByProfile(
  shopPriceCents: number,
  profile: EbayFeeProfile
): number {
  return calculateEbayParityPriceCents(shopPriceCents, EBAY_FEE_RATES[profile]);
}

// ---------------------------------------------------------------------------
// Dollar helpers (for UI display)
// ---------------------------------------------------------------------------

/**
 * Same as `calculateEbayParityPriceCents` but takes and returns dollars.
 */
export function calculateEbayParityPrice(
  shopPrice: number,
  feeRate: number
): number {
  if (shopPrice <= 0 || feeRate < 0 || feeRate >= 1) return 0;
  const raw = shopPrice / (1 - feeRate);
  return Math.ceil(raw * 100) / 100; // round up to nearest cent
}

/**
 * Calculate the eBay fees in dollars for a given listing price.
 */
export function calculateEbayFees(
  listingPrice: number,
  feeRate: number
): number {
  if (listingPrice <= 0) return 0;
  return Math.round(listingPrice * feeRate * 100) / 100;
}

/**
 * Calculate net proceeds after eBay fees.
 */
export function calculateEbayNetProceeds(
  listingPrice: number,
  feeRate: number
): number {
  return Math.round((listingPrice - calculateEbayFees(listingPrice, feeRate)) * 100) / 100;
}
