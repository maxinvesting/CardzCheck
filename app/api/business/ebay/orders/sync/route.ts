/**
 * POST /api/business/ebay/orders/sync
 * Manually trigger an eBay order sync for the authenticated business user.
 * Also callable from a Vercel cron job for automatic sync.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { syncOrders } from "@/lib/ebay/selling/sync";

export const dynamic = "force-dynamic";
// Allow up to 60 seconds for high-volume sellers with many orders
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

    // Ensure there is an active eBay account before attempting sync
    const { data: account, error: accountError } = await supabase
      .from("ebay_accounts")
      .select("id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account?.is_active) {
      return NextResponse.json(
        { error: "No active eBay account connected." },
        { status: 400 }
      );
    }

    const result = await syncOrders(user.id);

    return NextResponse.json({
      success: true,
      new_sales_created: result.newSalesCreated,
      orders_processed: result.ordersProcessed,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[ebay/orders/sync] error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
