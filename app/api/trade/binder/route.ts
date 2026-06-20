import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBinder } from "@/lib/trade/queries";

export const runtime = "nodejs";

/**
 * GET /api/trade/binder?user_id=<uuid>
 *
 * Returns a user's "Available for Trade" cards as a sanitized projection (no
 * cost basis / private columns). Used by the trade builder to pick which of a
 * partner's cards to request. Auth required; you can't request your own cards.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "use_inventory_endpoint" }, { status: 400 });
  }

  const cards = await getBinder(userId);
  return NextResponse.json({ cards });
}
