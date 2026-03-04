/**
 * POST /api/business/ebay/orders/sync
 * Manually trigger an eBay order sync for the authenticated business user.
 * Also callable from a Vercel cron job for automatic sync.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
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

    await requireBusinessAccess(user.id);

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
