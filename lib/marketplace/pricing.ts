import { createServiceClient } from "@/lib/supabase/server";
import { getMarketCmvForQuery } from "@/lib/market-discount";

export type ListingCmv = {
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  source: "sold_median" | "listing_adjusted" | "insufficient_data";
  comps_count: number;
  card_fingerprint: string;
  query_text: string;
};

const dollarsToCents = (dollars: number | null): number | null =>
  dollars === null || !Number.isFinite(dollars) ? null : Math.round(dollars * 100);

/**
 * Resolve CMV (low/mid/high in cents) for a marketplace_cards row.
 * Uses the existing market-discount engine; never trusts client input.
 */
export async function computeListingCmv(cardId: string): Promise<ListingCmv> {
  const service = await createServiceClient();
  const { data: card, error } = await service
    .from("marketplace_cards")
    .select(
      "id, player, year, title, grade, parallel, estimated_value_cents"
    )
    .eq("id", cardId)
    .single();

  if (error || !card) {
    throw new Error(`marketplace_cards row not found: ${cardId}`);
  }

  const result = await getMarketCmvForQuery({
    query: {
      player: card.player,
      year: String(card.year),
      set: card.title,
      grade: card.grade,
      parallelType: card.parallel ?? undefined,
    },
  });

  const cmv = result.cmv;
  return {
    low_cents: dollarsToCents(cmv.rangeLow),
    mid_cents: dollarsToCents(cmv.cmv),
    high_cents: dollarsToCents(cmv.rangeHigh),
    source: cmv.method,
    comps_count: cmv.soldCount ?? 0,
    card_fingerprint: cmv.cardFingerprint,
    query_text: cmv.queryText,
  };
}
