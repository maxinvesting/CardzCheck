/**
 * eBay fee rate constants and parity price calculator.
 *
 * Given a target net (e.g. Shop price), calculates the eBay listing price
 * that nets the same amount after eBay takes its cut.
 */

export const EBAY_FEE_RATES = {
  standard: 0.13, // 13% standard seller fee
  top_rated_plus: 0.12, // 12% Top Rated Plus discount
} as const;

export type EbayFeeRateKey = keyof typeof EBAY_FEE_RATES;

/**
 * Calculate the eBay listing price needed so the seller nets `targetNet`.
 *
 * Formula: ebayPrice = targetNet / (1 - feeRate)
 *
 * @param targetNet - The net amount the seller wants to receive (e.g. Shop price)
 * @param feeRateKey - Which fee schedule to use
 * @returns The listing price on eBay that produces the desired net after fees
 */
export function calculateEbayParityPrice(
  targetNet: number,
  feeRateKey: EbayFeeRateKey = "standard"
): number {
  const feeRate = EBAY_FEE_RATES[feeRateKey];
  if (targetNet <= 0) return 0;
  return targetNet / (1 - feeRate);
}

/**
 * Calculate the eBay fees from a given listing price.
 */
export function calculateEbayFees(
  listingPrice: number,
  feeRateKey: EbayFeeRateKey = "standard"
): number {
  const feeRate = EBAY_FEE_RATES[feeRateKey];
  return listingPrice * feeRate;
}

/**
 * Format a card title in optimal eBay listing format.
 * Pattern: "{Year} {Player} {Set} {Parallel} {Grade}"
 */
export function formatEbayTitle(parts: {
  year?: string | null;
  player?: string | null;
  set?: string | null;
  parallel?: string | null;
  grade?: string | null;
  grading_company?: string | null;
}): string {
  const segments: string[] = [];

  if (parts.year) segments.push(parts.year);
  if (parts.player) segments.push(parts.player);
  if (parts.set) segments.push(parts.set);
  if (parts.parallel) segments.push(parts.parallel);

  if (parts.grade) {
    const grader = parts.grading_company?.toUpperCase();
    const gradeStr = grader ? `${grader} ${parts.grade}` : parts.grade;
    segments.push(gradeStr);
  }

  return segments.filter(Boolean).join(" ").trim();
}
