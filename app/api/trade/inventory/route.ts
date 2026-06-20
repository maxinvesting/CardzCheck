import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTradeableCards } from "@/lib/trade/queries";

export const runtime = "nodejs";

/** GET /api/trade/inventory → the caller's own "Available for Trade" cards. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cards = await getTradeableCards(user.id);
  return NextResponse.json({ cards });
}
