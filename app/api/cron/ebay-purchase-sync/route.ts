/**
 * GET /api/cron/ebay-purchase-sync
 * Vercel Cron job — runs every 6 hours.
 * Syncs eBay purchase history for all users with active eBay accounts.
 *
 * Protected by CRON_SECRET header (set in Vercel env vars).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncEbayPurchases } from "@/lib/ebay/buying/purchase-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Verify cron secret to prevent unauthorized triggers
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = await createServiceClient();

  // Fetch all active eBay accounts
  const { data: accounts, error } = await supabase
    .from("ebay_accounts")
    .select("user_id")
    .eq("is_active", true);

  if (error) {
    console.error("[cron/ebay-purchase-sync] Failed to fetch accounts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (accounts ?? []).map((a: { user_id: string }) => a.user_id);
  console.log(`[cron/ebay-purchase-sync] Syncing purchases for ${userIds.length} users`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const userId of userIds) {
    try {
      const result = await syncEbayPurchases(userId);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    } catch (err) {
      console.error(`[cron/ebay-purchase-sync] Failed for user ${userId}:`, err);
      totalErrors++;
    }
  }

  console.log(`[cron/ebay-purchase-sync] Done — imported: ${totalImported}, skipped: ${totalSkipped}, errors: ${totalErrors}`);

  return NextResponse.json({
    users_processed: userIds.length,
    imported: totalImported,
    skipped: totalSkipped,
    errors: totalErrors,
  });
}
