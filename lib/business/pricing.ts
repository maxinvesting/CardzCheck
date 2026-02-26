/**
 * Card Profile pricing calculations.
 *
 * All monetary inputs/outputs are in **cents** unless the function name
 * explicitly says "dollars".
 */

// ── Position vs Floor ────────────────────────────────────────────────

export interface PositionVsFloor {
  /** Absolute difference (list - floor) in cents. Positive = above floor. */
  diffCents: number;
  /** Percentage above/below floor. Positive = above. */
  diffPct: number;
  /** Severity label for badge colour. */
  severity: "low" | "at" | "above" | "well-above";
}

/**
 * Compute the seller's price position relative to the market floor.
 *
 * Returns `null` when either value is missing/invalid.
 */
export function computePositionVsFloor(
  listPriceCents: number | null | undefined,
  floorCents: number | null | undefined
): PositionVsFloor | null {
  if (
    listPriceCents == null ||
    floorCents == null ||
    !Number.isFinite(listPriceCents) ||
    !Number.isFinite(floorCents) ||
    floorCents <= 0
  ) {
    return null;
  }

  const diffCents = listPriceCents - floorCents;
  const diffPct = (diffCents / floorCents) * 100;

  let severity: PositionVsFloor["severity"];
  if (diffPct <= -5) severity = "low";
  else if (diffPct <= 5) severity = "at";
  else if (diffPct <= 20) severity = "above";
  else severity = "well-above";

  return { diffCents, diffPct, severity };
}

// ── Estimated Take-Home ──────────────────────────────────────────────

export interface TakeHomeEstimate {
  channel: string;
  grossCents: number;
  feesCents: number;
  netCents: number;
  feeRate: number;
}

/**
 * Standard fee rates used when the seller has not customised them.
 *
 * eBay:   ~13% (final value fee + payment processing)
 * Whatnot: ~9.5% (seller fee + payment processing)
 */
const DEFAULT_FEE_RATES: Record<string, number> = {
  ebay: 0.13,
  whatnot: 0.095,
};

/**
 * Estimate the take-home (net payout) for a given list price on each
 * supported channel.
 */
export function estimateTakeHome(
  listPriceCents: number | null | undefined,
  customFeeRates?: Record<string, number>
): TakeHomeEstimate[] {
  if (
    listPriceCents == null ||
    !Number.isFinite(listPriceCents) ||
    listPriceCents <= 0
  ) {
    return [];
  }

  const rates = { ...DEFAULT_FEE_RATES, ...customFeeRates };

  return Object.entries(rates).map(([channel, rate]) => {
    const feesCents = Math.round(listPriceCents * rate);
    return {
      channel,
      grossCents: listPriceCents,
      feesCents,
      netCents: listPriceCents - feesCents,
      feeRate: rate,
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

export function fmtCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function fmtPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
