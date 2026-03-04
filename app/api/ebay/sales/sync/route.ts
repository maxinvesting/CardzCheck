import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidUserAccessToken, withEbayBackoff } from "@/lib/ebay/user-oauth";
import { requireBusinessAccess } from "@/lib/business/actions";

const EBAY_FULFILLMENT_BASE = "https://api.ebay.com/sell/fulfillment/v1";

// Fee rates by seller tier
const FEE_RATES: Record<string, number> = {
  standard: 0.13,       // 13%
  top_rated_plus: 0.12, // 12%
};

interface EbayLineItem {
  lineItemId: string;
  sku?: string;
  title: string;
  quantity: number;
  lineItemCost: { value: string; currency: string };
  legacyItemId?: string; // eBay listing ID (matches ebay_item_id in collection_items)
}

interface EbayOrder {
  orderId: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  creationDate: string;
  lastModifiedDate: string;
  pricingSummary: {
    priceSubtotal: { value: string; currency: string };
    deliveryCost?: { value: string; currency: string };
    total: { value: string; currency: string };
  };
  lineItems: EbayLineItem[];
}

interface EbayOrdersResponse {
  orders?: EbayOrder[];
  total?: number;
  next?: string;
}

async function fetchRecentOrders(
  accessToken: string,
  sinceDate: Date
): Promise<EbayOrder[]> {
  const allOrders: EbayOrder[] = [];
  let offset = 0;
  const limit = 200;

  // eBay date filter format: yyyy-MM-ddTHH:mm:ssZ (no milliseconds)
  const since = sinceDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const filter = `lastmodifieddate:[${since}..]`;

  while (true) {
    const url =
      `${EBAY_FULFILLMENT_BASE}/order` +
      `?filter=${encodeURIComponent(filter)}` +
      `&limit=${limit}&offset=${offset}`;

    const res = await withEbayBackoff(() =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      })
    );

    if (res.status === 404 || res.status === 204) break;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eBay orders fetch failed (${res.status}): ${text}`);
    }

    const data: EbayOrdersResponse = await res.json();
    const orders = data.orders ?? [];

    // Only include paid/fulfilled orders
    const paidOrders = orders.filter(
      (o) =>
        o.orderPaymentStatus === "PAID" ||
        o.orderFulfillmentStatus === "FULFILLED"
    );
    allOrders.push(...paidOrders);

    if (orders.length < limit) break;
    offset += limit;
  }

  return allOrders;
}

function dollarStringToCents(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * POST /api/ebay/sales/sync
 *
 * Pulls completed eBay orders since last sync (or 90 days back).
 * Creates a business_sales row per line item, deduped by external_order_id
 * (format: "${orderId}-${lineItemId}").
 *
 * Fee calculation: 13% standard, 12% Top Rated Plus (from user's ebay_fee_rate).
 * COGS: matched by legacyItemId → collection_items.ebay_item_id.
 * Marks matched inventory items as sold.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessAccess(user.id);

    const accessToken = await getValidUserAccessToken(supabase, user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: "eBay account not connected. Connect your eBay account in Settings." },
        { status: 400 }
      );
    }

    // Load user settings
    const { data: userData } = await supabase
      .from("users")
      .select("ebay_fee_rate, ebay_last_sales_sync")
      .eq("id", user.id)
      .maybeSingle();

    const feeRate = FEE_RATES[userData?.ebay_fee_rate ?? "standard"] ?? 0.13;

    // Sync from last timestamp or 90 days ago
    const sinceDate = userData?.ebay_last_sales_sync
      ? new Date(userData.ebay_last_sales_sync)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const orders = await fetchRecentOrders(accessToken, sinceDate);

    const syncedAt = new Date().toISOString();

    if (orders.length === 0) {
      await supabase
        .from("users")
        .update({ ebay_last_sales_sync: syncedAt })
        .eq("id", user.id);

      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: 0,
        synced_at: syncedAt,
      });
    }

    // Bulk-load inventory items matching any legacyItemId from these orders
    const allLegacyIds = orders
      .flatMap((o) => o.lineItems)
      .map((li) => li.legacyItemId)
      .filter(Boolean) as string[];

    const { data: inventoryItems } = allLegacyIds.length
      ? await supabase
          .from("collection_items")
          .select("id, ebay_item_id, cost_basis_total_cents")
          .eq("user_id", user.id)
          .in("ebay_item_id", allLegacyIds)
      : { data: [] };

    const inventoryMap = new Map<string, { id: string; cost_basis_total_cents: number | null }>();
    for (const item of inventoryItems ?? []) {
      if (item.ebay_item_id) inventoryMap.set(item.ebay_item_id, item);
    }

    // Build all candidate external_order_ids (orderId-lineItemId) for duplicate check
    const lineItemExternalIds = orders.flatMap((o) =>
      o.lineItems.map((li) => `${o.orderId}-${li.lineItemId}`)
    );

    const { data: existingSales } = await supabase
      .from("business_sales")
      .select("external_order_id")
      .eq("user_id", user.id)
      .in("external_order_id", lineItemExternalIds);

    const existingIds = new Set((existingSales ?? []).map((s) => s.external_order_id));

    let imported = 0;
    let skipped = 0;

    for (const order of orders) {
      const soldAt = new Date(order.creationDate).toISOString();
      const saleDate = soldAt.split("T")[0];

      for (const lineItem of order.lineItems) {
        const externalId = `${order.orderId}-${lineItem.lineItemId}`;

        if (existingIds.has(externalId)) {
          skipped++;
          continue;
        }

        const salePriceCents = dollarStringToCents(lineItem.lineItemCost?.value);
        const platformFeesCents = Math.round(salePriceCents * feeRate);
        const netPayoutCents = salePriceCents - platformFeesCents;

        const inventoryMatch = lineItem.legacyItemId
          ? inventoryMap.get(lineItem.legacyItemId)
          : null;
        const cogsCents = inventoryMatch?.cost_basis_total_cents ?? 0;
        const profitCents = netPayoutCents - cogsCents;

        const insertData: Record<string, unknown> = {
          user_id: user.id,
          business_id: user.id,
          channel: "ebay",
          sold_at: soldAt,
          sale_date: saleDate,
          sold_price_cents: salePriceCents,
          sale_price_cents: salePriceCents,
          platform_fees_cents: platformFeesCents,
          shipping_charged_cents: 0,
          shipping_paid_cents: 0,
          other_costs_cents: 0,
          net_payout_cents: netPayoutCents,
          net_proceeds_cents: netPayoutCents,
          cogs_cents: cogsCents,
          profit_cents: profitCents,
          external_order_id: externalId,
          notes: lineItem.title,
          is_deleted: false,
          ...(inventoryMatch ? { inventory_item_id: inventoryMatch.id } : {}),
        };

        const { error: insertError } = await supabase
          .from("business_sales")
          .insert(insertData);

        if (insertError) {
          console.error("Failed to insert eBay sale:", insertError);
          continue;
        }

        // Mark matched inventory item as sold
        if (inventoryMatch) {
          await supabase
            .from("collection_items")
            .update({ status: "sold" })
            .eq("id", inventoryMatch.id)
            .eq("user_id", user.id);
        }

        imported++;
      }
    }

    await supabase
      .from("users")
      .update({ ebay_last_sales_sync: syncedAt })
      .eq("id", user.id);

    return NextResponse.json({
      imported,
      skipped,
      total: orders.length,
      synced_at: syncedAt,
    });
  } catch (err) {
    console.error("eBay sales sync error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
