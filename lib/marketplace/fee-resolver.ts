import { createServiceClient } from "@/lib/supabase/server";
import { getMarketCmvForQuery } from "@/lib/market-discount";
import {
  calculateFee,
  resolveFeeTier,
  type FeeTier,
} from "@/lib/marketplace/fees";

/**
 * Server-only helper: load a listing + its card, derive the live fee tier
 * and a fee amount for a hypothetical sale at salePriceCents. Used by both
 * the fee-estimate quote endpoint and the Stripe webhook (single source of truth).
 *
 * For 'negotiated' (elite) listings, the caller must supply the agreed fee.
 */
export async function resolveLiveFee(
  listingId: string,
  salePriceCents: number,
  negotiatedFeeCents?: number
): Promise<{
  fee_tier: FeeTier;
  fee_amount_cents: number;
  sold_comps_count: number;
}> {
  const service = await createServiceClient();
  const { data: listing, error } = await service
    .from("listings")
    .select(
      "id, mode, pipeline, fee_tier, marketplace_cards!inner(player, year, title, grade, parallel)"
    )
    .eq("id", listingId)
    .single<{
      id: string;
      mode: "self_serve" | "full_service";
      pipeline: "standard" | "elite" | "grails";
      fee_tier: FeeTier;
      marketplace_cards: {
        player: string;
        year: number;
        title: string;
        grade: string;
        parallel: string | null;
      };
    }>();

  if (error || !listing) {
    throw new Error(`listing not found: ${listingId}`);
  }

  const card = listing.marketplace_cards;

  let soldCount = 0;
  try {
    const result = await getMarketCmvForQuery({
      query: {
        player: card.player,
        year: String(card.year),
        set: card.title,
        grade: card.grade,
        parallelType: card.parallel ?? undefined,
      },
    });
    soldCount = result.cmv.soldCount ?? 0;
  } catch (err) {
    console.error("[fee-resolver] comps lookup failed", err);
  }

  const tier = resolveFeeTier({
    mode: listing.mode,
    pipeline: listing.pipeline,
    grade: card.grade,
    sold_comps_count: soldCount,
  });

  const { fee_amount_cents } = calculateFee(
    salePriceCents,
    tier,
    negotiatedFeeCents
  );

  return {
    fee_tier: tier,
    fee_amount_cents,
    sold_comps_count: soldCount,
  };
}
