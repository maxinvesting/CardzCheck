import type { CardComp, CmvCalculation } from "@/types/comps";

/**
 * Compute the median of a sorted numeric array.
 * Returns null if the array is empty.
 */
function median(sortedPrices: number[]): number | null {
  const n = sortedPrices.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
    : sortedPrices[mid];
}

/**
 * Derive a confidence band from selected comp count.
 *
 * - high   → 5+ comps
 * - medium → 3–4 comps
 * - low    → <3 comps
 */
function confidenceFromCount(count: number): "high" | "medium" | "low" {
  if (count >= 5) return "high";
  if (count >= 3) return "medium";
  return "low";
}

/**
 * Calculate CMV from a list of selected comps.
 *
 * Uses median price as the midpoint, with ±12.5% bands for low/high.
 * Returns null if there are no comps with a positive price.
 */
export function calculateCmvFromComps(
  comps: CardComp[]
): CmvCalculation | null {
  const prices = comps
    .filter((c) => c.is_selected && c.price > 0)
    .map((c) => c.price)
    .sort((a, b) => a - b);

  const mid = median(prices);
  if (mid === null) return null;

  const band = 0.125; // ±12.5%
  return {
    cmv_value: Math.round(mid * 100) / 100,
    cmv_low: Math.round(mid * (1 - band) * 100) / 100,
    cmv_high: Math.round(mid * (1 + band) * 100) / 100,
    confidence: confidenceFromCount(prices.length),
    comps_count: prices.length,
  };
}
