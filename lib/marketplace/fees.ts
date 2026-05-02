export type FeeTier = "one_pct" | "two_pct" | "five_pct" | "negotiated";
export type ListingMode = "self_serve" | "full_service";
export type Pipeline = "standard" | "elite" | "grails";

export const STRONG_COMPS_THRESHOLD = 5;

export const FEE_RATES: Record<Exclude<FeeTier, "negotiated">, number> = {
  one_pct: 0.01,
  two_pct: 0.02,
  five_pct: 0.05,
};

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
 * Compute the platform fee for a completed sale. For 'negotiated' the caller
 * must supply a manually agreed feeAmountCents; this function just clamps it.
 */
export function calculateFee(
  salePriceCents: number,
  feeTier: FeeTier,
  negotiatedFeeCents?: number
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
  const rate = FEE_RATES[feeTier];
  return { fee_amount_cents: Math.round(salePriceCents * rate) };
}

function normalizeGrade(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  // Accept "PSA 10", "PSA10", "10" (assume PSA), etc.
  if (/^PSA\s*10$/.test(trimmed)) return "PSA 10";
  if (/^10$/.test(trimmed)) return "PSA 10";
  return trimmed;
}
