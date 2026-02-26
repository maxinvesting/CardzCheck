export type SaleMathInput = {
  sold_price_cents?: number | null;
  shipping_charged_cents?: number | null;
  platform_fees_cents?: number | null;
  shipping_cost_cents?: number | null;
  tax_cents?: number | null;
  net_payout_cents?: number | null;
  cogs_cents?: number | null;
};

function toInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Returns net payout in cents.
 * If an explicit net payout is provided, it is used as-is.
 * Otherwise, net = (sold + shipping charged) - platform fees - shipping cost - tax.
 */
export function computeNetPayout(input: SaleMathInput): number {
  if (input.net_payout_cents != null) {
    return toInt(input.net_payout_cents);
  }

  const grossRevenueCents =
    toInt(input.sold_price_cents) + toInt(input.shipping_charged_cents);

  return (
    grossRevenueCents -
    toInt(input.platform_fees_cents) -
    toInt(input.shipping_cost_cents) -
    toInt(input.tax_cents)
  );
}

/** Profit in cents. Can be negative for loss-making sales. */
export function computeProfit(input: SaleMathInput): number {
  const netPayoutCents =
    input.net_payout_cents != null
      ? toInt(input.net_payout_cents)
      : computeNetPayout(input);

  return netPayoutCents - toInt(input.cogs_cents);
}

export function formatMoney(cents: number, locale = "en-US", currency = "USD"): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(safeCents / 100);
}
