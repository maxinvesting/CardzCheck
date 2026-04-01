/**
 * Bulk Mode — editable business rule constants
 *
 * All thresholds, fees, and defaults live here for easy operator tuning.
 * Do not hardcode these values inside service logic.
 */

// ----------------------------------------------------------------
// Confidence thresholds
// ----------------------------------------------------------------

/** Identification confidence below this → flag for manual review */
export const LOW_CONFIDENCE_THRESHOLD = 0.80;

/** Identification confidence above this → trusted without review */
export const STRONG_CONFIDENCE_THRESHOLD = 0.92;

// ----------------------------------------------------------------
// Profitability thresholds
// ----------------------------------------------------------------

/** Minimum estimated net profit (USD) to recommend listing a card */
export const MIN_NET_PROFIT_THRESHOLD = 0.40;

// ----------------------------------------------------------------
// Duplicate / quantity thresholds
// ----------------------------------------------------------------

/** If a card appears this many times or more in one batch → recommend multi_quantity */
export const DUPLICATE_MULTI_QTY_THRESHOLD = 3;

// ----------------------------------------------------------------
// eBay Standard Envelope (ESE)
// ESE is a low-cost tracked shipping method for eligible trading cards
// Max sale price ~$20 to qualify
// ----------------------------------------------------------------

/** Max listing price still eligible for eBay Standard Envelope */
export const ESE_MAX_SALE_PRICE = 20.00;

/**
 * ESE shipping tiers by weight (USD).
 * eBay Standard Envelope prices as of early 2026.
 */
export const ESE_SHIPPING_TIERS: Array<{ maxOz: number; cost: number }> = [
  { maxOz: 1, cost: 0.74 },
  { maxOz: 2, cost: 1.03 },
  { maxOz: 3, cost: 1.32 },
];

/** Default ESE tier to use when we don't know exact weight (1 standard card) */
export const ESE_DEFAULT_TIER_OZ = 1;

/** Standard first-class mail fallback when ESE is not eligible */
export const FIRST_CLASS_SHIPPING_COST = 1.08;

// ----------------------------------------------------------------
// Packaging
// ----------------------------------------------------------------

/** Cost per listing for materials (sleeve, top loader, bubble mailer) */
export const PACKAGING_COST = 0.15;

// ----------------------------------------------------------------
// eBay fee structure
// These are estimates — real fees may vary by account/category/promo.
// ----------------------------------------------------------------

/** eBay fixed fee per order (below $10 orders typically have a flat fee) */
export const EBAY_FIXED_FEE = 0.30;

/**
 * eBay final value fee as a decimal (13.25% = 0.1325).
 * Sports cards category as of 2026; adjust if your store rate differs.
 */
export const EBAY_FINAL_VALUE_FEE_RATE = 0.1325;

// ----------------------------------------------------------------
// Pricing bands (rules-based fallback for unknown cards)
// All values are suggested listing prices in USD
// ----------------------------------------------------------------

export const PRICE_BANDS = {
  /** Common base card, veteran player, low demand */
  base_veteran: { low: 0.99, suggested: 0.99 },
  /** Common base card, younger player with some upside */
  base_young: { low: 0.99, suggested: 1.49 },
  /** Confirmed or likely rookie (non-insert) */
  rookie: { low: 1.49, suggested: 2.99 },
  /** Insert or parallel without known serial numbering */
  insert_generic: { low: 1.99, suggested: 3.49 },
  /** Insert or parallel with serial number hint */
  insert_numbered: { low: 3.49, suggested: 6.99 },
  /** Card type unknown or identification failed */
  unknown: { low: 0.99, suggested: 0.99 },
} as const;

export type PriceBandKey = keyof typeof PRICE_BANDS;
