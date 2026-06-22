/**
 * Pricing constants for display and computed values.
 *
 * Single-plan model: one paid subscription at $19.99/mo with a 7-day free
 * trial. There is no annual option, no activation fee, and no separate
 * tiers — every paid subscriber gets the full feature set.
 */

/** The one and only paid subscription price, in dollars/month. */
export const SUBSCRIPTION_MONTHLY_PRICE = 19.99;

/** Length of the free trial granted at checkout, in days. */
export const TRIAL_DAYS = 7;

// ---------------------------------------------------------------------------
// Legacy aliases — kept so existing imports keep compiling. All now point at
// the single $19.99 plan. Prefer SUBSCRIPTION_MONTHLY_PRICE for new code.
// ---------------------------------------------------------------------------
export const PRO_MONTHLY_PRICE = SUBSCRIPTION_MONTHLY_PRICE;
export const BUSINESS_MONTHLY_PRICE = SUBSCRIPTION_MONTHLY_PRICE;
export const BUSINESS_INCLUDED_SEATS = 1;

/** Price per additional team seat, in dollars/month. */
export const BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE = 5;

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
