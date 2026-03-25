/**
 * POST /api/business/ebay/purchases/sync
 * Manually trigger an eBay purchase sync for the authenticated business user.
 * Also called by the Vercel cron job for automatic background sync.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { syncEbayPurchases } from "@/lib/ebay/buying/purchase-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessOwnerContext(user.id);

    const { data: account } = await supabase
      .from("ebay_accounts")
      .select("is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account?.is_active) {
      return NextResponse.json(
        { error: "No active eBay account connected." },
        { status: 400 }
      );
    }

    const result = await syncEbayPurchases(user.id);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[ebay/purchases/sync] error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
