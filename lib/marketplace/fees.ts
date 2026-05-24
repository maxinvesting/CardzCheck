export type FeeTier = "one_pct" | "two_pct" | "five_pct" | "negotiated";
export type ListingMode = "self_serve" | "full_service";
export type Pipeline = "standard" | "elite" | "grails";

export const STRONG_COMPS_THRESHOLD = 5;

/**
 * Subscription-tier-based fee schedules. The card-listing logic picks one
 * of the three slot keys (one_pct / two_pct / five_pct) based on grade +
 * comps depth; the seller's tier picks the actual rate.
 *
 * Headline "1% / 2% / 5%" copy applies to Business Pro. Business pays
 * +3 points across the board. Free pays the highest fees as an upsell.
 */
export const FEE_RATES_BY_TIER = {
  business_pro: { one_pct: 0.01, two_pct: 0.02, five_pct: 0.05 },
  business: { one_pct: 0.04, two_pct: 0.05, five_pct: 0.08 },
  free: { one_pct: 0.08, two_pct: 0.12, five_pct: 0.15 },
} as const;

export type FeeTierKey = "business_pro" | "business" | "free";

/** Legacy export: defaults to Business Pro rates for any caller that hasn't
 *  yet been updated to pass a seller tier. New callers should use
 *  FEE_RATES_BY_TIER[sellerTier] instead. */
export const FEE_RATES: Record<Exclude<FeeTier, "negotiated">, number> =
  FEE_RATES_BY_TIER.business_pro;

export type FeeTierInput = {
  mode: ListingMode;
  pipeline: Pipeline;
  grade: string;
  sold_comps_count: number;
};

/**
 * Pure server-side fee tier resolution. Called at transaction completion
 * (Stripe webhook) and at quote time (fee-estimate route). Never trust client.
 *
 *  Self-serve            → one_pct (always)
 *  Grails                → one_pct (flat — publicity workflow)
 *  Elite                 → negotiated (admin sets fee_amount manually)
 *  Full-service standard:
 *    PSA 10 + strong comps → two_pct (high liquidity)
 *    otherwise            → five_pct (medium / weaker liquidity)
 */
export function resolveFeeTier(input: FeeTierInput): FeeTier {
  if (input.mode === "self_serve") return "one_pct";
  if (input.pipeline === "grails") return "one_pct";
  if (input.pipeline === "elite") return "negotiated";

  const isPsa10 = normalizeGrade(input.grade) === "PSA 10";
  const hasStrongComps = input.sold_comps_count >= STRONG_COMPS_THRESHOLD;
  if (isPsa10 && hasStrongComps) return "two_pct";
  return "five_pct";
}

/**
 * Compute the platform fee for a completed sale.
 *
 * sellerTier picks the schedule (Business Pro / Business / Free). Omit it for
 * legacy callers — they default to Business Pro rates (the headline 1/2/5).
 *
 * 'negotiated' is admin-set and ignores sellerTier (the negotiated amount is
 * the final number).
 */
export function calculateFee(
  salePriceCents: number,
  feeTier: FeeTier,
  negotiatedFeeCents?: number,
  sellerTier: FeeTierKey = "business_pro"
): { fee_amount_cents: number } {
  if (!Number.isFinite(salePriceCents) || salePriceCents < 0) {
    throw new Error("invalid sale price");
  }
  if (feeTier === "negotiated") {
    if (
      negotiatedFeeCents == null ||
      !Number.isFinite(negotiatedFeeCents) ||
      negotiatedFeeCents < 0
    ) {
      throw new Error("negotiated fee requires a non-negative explicit amount");
    }
    return { fee_amount_cents: Math.round(negotiatedFeeCents) };
  }
  const rate = FEE_RATES_BY_TIER[sellerTier][feeTier];
  return { fee_amount_cents: Math.round(salePriceCents * rate) };
}

function normalizeGrade(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Accept "PSA 10", "PSA10", "10" (assume PSA), etc.
  if (/^PSA\s*10$/.test(trimmed)) return "PSA 10";
  if (/^10$/.test(trimmed)) return "PSA 10";
  return trimmed;
}
