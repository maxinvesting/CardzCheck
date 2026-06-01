import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveLiveFee } from "@/lib/marketplace/fee-resolver";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: listingId } = await params;

  const service = await createServiceClient();
  const { data: listing, error } = await service
    .from("listings")
    .select("id, status, list_price_cents")
    .eq("id", listingId)
    .single();

  if (error || !listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!["active", "price_reduced"].includes(listing.status)) {
    return NextResponse.json({ error: "not_for_sale" }, { status: 410 });
  }

  try {
    const fee = await resolveLiveFee(listingId, listing.list_price_cents);
    return NextResponse.json({
      list_price_cents: listing.list_price_cents,
      fee_tier: fee.fee_tier,
      fee_amount_cents: fee.fee_amount_cents,
      take_home_cents:
        fee.fee_tier === "negotiated"
          ? null
          : listing.list_price_cents - fee.fee_amount_cents,
      sold_comps_count: fee.sold_comps_count,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("negotiated fee")) {
      // Elite tier — fee not derivable until admin sets it on the listing.
      return NextResponse.json({
        list_price_cents: listing.list_price_cents,
        fee_tier: "negotiated",
        fee_amount_cents: null,
        take_home_cents: null,
        sold_comps_count: null,
      });
    }
    console.error("[fee-estimate] failed", err);
    return NextResponse.json({ error: "estimate_failed" }, { status: 500 });
  }
}
