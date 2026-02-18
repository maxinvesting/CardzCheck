/**
 * Pricing constants for display and computed values.
 * Single source of truth for Pro monthly, annual, and savings.
 */

export const PRO_MONTHLY_PRICE = 8.99;
export const PRO_ANNUAL_PRICE = 79;

/** What 12 months of monthly would cost (for savings copy). */
export const PRO_MONTHLY_PRICE_YEARLY = PRO_MONTHLY_PRICE * 12;

/** Savings when choosing annual over 12x monthly. */
export const ANNUAL_SAVINGS = Math.round((PRO_MONTHLY_PRICE_YEARLY - PRO_ANNUAL_PRICE) * 100) / 100;

/**
 * Format a price for display. Uses 2 decimals for cents (e.g. $8.99), whole number for dollars (e.g. $79).
 */
export function formatPrice(amount: number, options?: { decimals?: number }): string {
  const decimals = options?.decimals ?? (amount % 1 === 0 ? 0 : 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
