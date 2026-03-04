/**
 * eBay order sync — polls the Fulfillment API for new orders since the last sync.
 *
 * Used by:
 *   1. POST /api/business/ebay/orders/sync  (manual "Sync Now" button + Vercel cron)
 *   2. Fallback polling when webhooks aren't configured
 *
 * All order processing is delegated to event-handlers.ts so there is zero
 * duplication between the sync path and the webhook push path.
 */

import { createClient } from "@/lib/supabase/server";
import { getOrders } from "./fulfillment-api";
import { handleEbayOrderSold } from "./event-handlers";
import { businessInventoryProvider } from "@/lib/inventory/business-inventory-provider";

export type SyncResult = {
  newSalesCreated: number;
  ordersProcessed: number;
  errors: string[];
};

/**
 * Sync new eBay orders for a seller since their last sync timestamp.
 * Updates `ebay_accounts.updated_at` as the sync cursor.
 *
 * This function is safe to call concurrently — duplicate orders are deduped
 * by the UNIQUE(business_id, external_order_id) constraint in business_sales.
 */
export async function syncOrders(userId: string): Promise<SyncResult> {
  const supabase = await createClient();

  // Fetch the last sync time from ebay_accounts as our cursor
  const { data: account, error: accountError } = await supabase
    .from("ebay_accounts")
    .select("updated_at, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account?.is_active) {
    throw new Error("No active eBay account connected. Connect your eBay account in Business Settings.");
  }

  // Default: look back 30 days on first sync; otherwise use last sync time
  const lastSync = new Date(account.updated_at);
  const after = isNaN(lastSync.getTime())
    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    : lastSync;

  const result: SyncResult = {
    newSalesCreated: 0,
    ordersProcessed: 0,
    errors: [],
  };

  // Page through all orders since last sync
  let offset = 0;
  const limit = 200;
  let hasMore = true;

  while (hasMore) {
    let page;
    try {
      page = await getOrders(userId, { after, limit, offset });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`eBay API page error at offset ${offset}: ${message}`);
      break;
    }

    for (const order of page.orders) {
      // Only process paid orders
      if (order.orderPaymentStatus !== "PAID") continue;

      try {
        const { created } = await handleEbayOrderSold(
          userId,
          order,
          businessInventoryProvider
        );
        result.ordersProcessed++;
        if (created) result.newSalesCreated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Order ${order.orderId}: ${message}`);
      }
    }

    hasMore = page.hasMore;
    offset += limit;
  }

  // Update the sync cursor
  await supabase
    .from("ebay_accounts")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return result;
}
