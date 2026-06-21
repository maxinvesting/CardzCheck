/**
 * Trade Center fee policy.
 *
 * Two settlement paths:
 *
 *   1. Direct (ship-to-ship) — FREE, but reserved for subscribers (Business /
 *      Business Pro). Both sides approve and ship to each other; the platform
 *      takes nothing. Free-tier users can't settle a direct trade — they use
 *      the middleman instead (or upgrade).
 *
 *   2. Middleman — the platform mediates the swap for a flat fee of 3% of the
 *      TOTAL trade value (both sides' cards + any cash). Available to everyone,
 *      no subscription required. This is the protected path.
 *
 * Cash-on-top, when present, is still settled through Stripe; the cash-leg fee
 * below is folded into the middleman fee so a trade is never double-charged.
 */

export const TRADE_CASH_FEE_PCT = 0.03; // 3% of the cash amount
export const TRADE_CASH_FEE_MIN_CENTS = 50;

/** Platform fee taken on a cash-on-top leg (0 when there is no cash). */
export function tradeCashFeeCents(cashCents: number): number {
  if (!Number.isFinite(cashCents) || cashCents <= 0) return 0;
  return Math.max(TRADE_CASH_FEE_MIN_CENTS, Math.round(cashCents * TRADE_CASH_FEE_PCT));
}

// ── Middleman (mediated) settlement ──────────────────────────────────────────

/** Flat middleman fee: 3% of the total trade value (both sides' cards + cash). */
export const TRADE_MIDDLEMAN_FEE_PCT = 0.03;
export const TRADE_MIDDLEMAN_FEE_MIN_CENTS = 100;

/**
 * Middleman fee in cents for a given total trade value (combined card value of
 * both sides plus any cash on top). Returns 0 for a non-positive total.
 */
export function tradeMiddlemanFeeCents(totalValueCents: number): number {
  if (!Number.isFinite(totalValueCents) || totalValueCents <= 0) return 0;
  return Math.max(
    TRADE_MIDDLEMAN_FEE_MIN_CENTS,
    Math.round(totalValueCents * TRADE_MIDDLEMAN_FEE_PCT)
  );
}

/**
 * The platform fee for a trade given its settlement method.
 *   - middleman → 3% of total value (the cash-leg fee is subsumed by this).
 *   - direct    → free (0). Subscriber-gated at creation time.
 */
export function tradePlatformFeeCents(args: {
  useMiddleman: boolean;
  totalValueCents: number;
  cashCents: number;
}): number {
  if (args.useMiddleman) return tradeMiddlemanFeeCents(args.totalValueCents);
  return 0;
}

/** Max cash on top accepted in a single trade ($25k) — sanity bound. */
export const TRADE_MAX_CASH_CENTS = 2_500_000;

/** How close the two sides must be (in cents) to count as "balanced". */
export const TRADE_BALANCE_TOLERANCE_CENTS = 500;
