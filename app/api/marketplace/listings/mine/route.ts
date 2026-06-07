import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { MarketplaceListingPreview } from "@/types";

export const runtime = "nodejs";

type ListingRow = {
  id: string;
  card_id: string | null;
  status: string;
  list_price_cents: number;
  cmv_mid_cents: number | null;
  listed_at: string;
  updated_at: string;
  marketplace_cards: { title: string | null } | null;
};

/**
 * Active marketplace listings owned by the calling user — powers the
 * dashboard "Marketplace listings" preview. Only live listings (active /
 * price_reduced) are returned; this is intentionally a small preview, not the
 * full storefront.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const service = await createServiceClient();
    const { data, error } = await service
      .from("listings")
      .select(
        "id, card_id, status, list_price_cents, cmv_mid_cents, listed_at, updated_at, marketplace_cards!inner(title)"
      )
      .eq("seller_id", user.id)
      .in("status", ["active", "price_reduced"])
      .order("listed_at", { ascending: false })
      .limit(24);

    if (error) {
      // Table may not exist on environments without the marketplace schema —
      // degrade gracefully so the dashboard still renders.
      return NextResponse.json({ listings: [] });
    }

    const rows = (data ?? []) as unknown as ListingRow[];
    const listings: MarketplaceListingPreview[] = rows.map((row) => {
      const spread =
        row.cmv_mid_cents != null
          ? row.list_price_cents - row.cmv_mid_cents
          : null;
      return {
        id: row.id,
        card_id: row.card_id,
        title: row.marketplace_cards?.title?.trim() || "Untitled listing",
        status: row.status,
        list_price_cents: row.list_price_cents,
        cmv_mid_cents: row.cmv_mid_cents,
        spread_cents: spread,
        listed_at: row.listed_at,
        updated_at: row.updated_at,
      };
    });

    return NextResponse.json({ listings });
  } catch (err) {
    console.error("Marketplace listings/mine error:", err);
    return NextResponse.json({ listings: [] });
  }
}
