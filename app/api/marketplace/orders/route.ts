/**
 * GET /api/marketplace/orders?role=seller|buyer
 *
 * Returns the caller's marketplace orders. `seller` = cards they sold,
 * `buyer` = cards they bought. RLS on `transactions` already scopes rows to
 * the buyer/seller, but we filter explicitly for clarity and join the card.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = req.nextUrl.searchParams.get("role") === "buyer" ? "buyer" : "seller";
  const column = role === "buyer" ? "buyer_id" : "seller_id";

  const { data, error } = await supabase
    .from("transactions")
    .select(
      `id, sale_price_cents, shipping_cents, fee_amount_cents, seller_payout_cents,
       fee_tier, fulfilled_by, fulfillment_status, ship_to, carrier, service_level,
       tracking_number, tracking_url, label_url, shipped_at, delivered_at, completed_at,
       listing_id,
       listings!inner(id, mode, fulfilled_by, marketplace_cards!inner(title, player, year, grade, grading_service, image_url))`
    )
    .eq(column, user.id)
    .order("completed_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "orders_query_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ role, orders: data ?? [] });
}
