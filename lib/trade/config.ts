/**
 * Trade Center fee policy.
 *
 * v1: card-only trades are FREE. When one side adds cash on top, the platform
 * takes a small fee on the cash leg (collected as a Stripe `application_fee`
 * on the destination charge — same mechanism as the marketplace). The fee hook
 * exists so a flat protection fee on card-only trades can be added later
 * without touching the settlement flow.
 */

export const TRADE_CASH_FEE_PCT = 0.03; // 3% of the cash amount
export const TRADE_CASH_FEE_MIN_CENTS = 50;

/** Platform fee taken on a cash-on-top leg (0 when there is no cash). */
export function tradeCashFeeCents(cashCents: number): number {
  if (!Number.isFinite(cashCents) || cashCents <= 0) return 0;
  return Math.max(TRADE_CASH_FEE_MIN_CENTS, Math.round(cashCents * TRADE_CASH_FEE_PCT));
}

/** Max cash on top accepted in a single trade ($25k) — sanity bound. */
export const TRADE_MAX_CASH_CENTS = 2_500_000;

/** How close the two sides must be (in cents) to count as "balanced". */
export const TRADE_BALANCE_TOLERANCE_CENTS = 500;
