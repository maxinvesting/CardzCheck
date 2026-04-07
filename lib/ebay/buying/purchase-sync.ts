/**
 * eBay Purchase Sync
 *
 * Fetches orders the user made as a buyer on eBay and imports them
 * as inventory items (item_kind='inventory', channel='ebay', acquisition_type='buy').
 *
 * Deduplication: skips any line item whose (ebay_purchase_order_id, ebay_purchase_line_item_id)
 * already exists in collection_items for this user.
 *
 * Cost breakdown: captures item price, shipping, and tax separately
 * so cost_basis_total_cents reflects the true all-in purchase cost.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getBuyerOrders, type NormalizedPurchaseOrder, type NormalizedPurchaseLineItem } from "./orders-api";

// ─── Title parsing ───────────────────────────────────────────────────────────

const YEAR_RE = /\b(19|20)\d{2}\b/;
const GRADE_RE = /\b(PSA|BGS|SGC|CGC|HGA|CSG|AGS)\s*(\d+(?:\.\d+)?)\b/i;

/**
 * Lightly parse a raw eBay listing title into card identity fields.
 * Stores the full title as `title` regardless; parsed fields are best-effort.
 */
function parseTitle(raw: string): {
  title: string;
  year: string | null;
  grade: string | null;
  gradingCompany: string | null;
  playerName: string;
} {
  const yearMatch = raw.match(YEAR_RE);
  const year = yearMatch ? yearMatch[0] : null;

  const gradeMatch = raw.match(GRADE_RE);
  const gradingCompany = gradeMatch ? gradeMatch[1].toUpperCase() : null;
  const gradeNumber = gradeMatch ? gradeMatch[2] : null;
  const grade = gradingCompany && gradeNumber ? `${gradingCompany} ${gradeNumber}` : null;

  // Derive a best-effort player name by stripping year, grade, and common set keywords
  let remainder = raw;
  if (year) remainder = remainder.replace(year, "");
  if (gradeMatch) remainder = remainder.replace(gradeMatch[0], "");
  // Strip common filler words and punctuation
  remainder = remainder
    .replace(/\b(PSA|BGS|SGC|CGC|HGA|CSG|AGS|Prizm|Optic|Select|Mosaic|Donruss|Panini|Topps|Bowman|Upper Deck|SP|RC|Rookie|Card|#\d+|\/\d+)\b/gi, "")
    .replace(/[|#\/\\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Take first 2-3 words as player name (rough heuristic for "Firstname Lastname")
  const words = remainder.split(" ").filter(Boolean);
  const playerName = words.slice(0, 3).join(" ") || raw.slice(0, 50);

  return {
    title: raw,
    year,
    grade,
    gradingCompany,
    playerName,
  };
}

// ─── Sync result ─────────────────────────────────────────────────────────────

export interface PurchaseSyncResult {
  imported: number;
  skipped: number;
  errors: number;
}

// ─── Main sync function ───────────────────────────────────────────────────────

/**
 * Sync eBay purchases for a single user.
 * Safe to call repeatedly — already-imported items are skipped via dedup columns.
 */
export async function syncEbayPurchases(userId: string): Promise<PurchaseSyncResult> {
  const supabase = await createServiceClient();
  const result: PurchaseSyncResult = { imported: 0, skipped: 0, errors: 0 };

  // Look up last sync time for incremental fetch
  const { data: account } = await supabase
    .from("ebay_accounts")
    .select("purchases_last_synced_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!account) return result;

  // Determine how far back to look
  const after = account.purchases_last_synced_at
    ? new Date(account.purchases_last_synced_at)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days on first sync

  const orders = await getBuyerOrders(userId, after);

  if (orders.length === 0) {
    // Still update timestamp so next sync window advances
    await supabase
      .from("ebay_accounts")
      .update({ purchases_last_synced_at: new Date().toISOString() })
      .eq("user_id", userId);
    return result;
  }

  // Collect all order+line IDs from this batch for dedup check
  const orderLineKeys = orders.flatMap((o) =>
    o.lineItems.map((li) => ({
      orderId: o.purchaseOrderId,
      lineItemId: li.lineItemId,
    }))
  );

  // Fetch already-imported keys in one query
  const existingSet = new Set<string>();
  if (orderLineKeys.length > 0) {
    const { data: existing } = await supabase
      .from("collection_items")
      .select("ebay_purchase_order_id, ebay_purchase_line_item_id")
      .eq("user_id", userId)
      .in(
        "ebay_purchase_order_id",
        orderLineKeys.map((k) => k.orderId)
      );

    for (const row of existing ?? []) {
      if (row.ebay_purchase_order_id && row.ebay_purchase_line_item_id) {
        existingSet.add(`${row.ebay_purchase_order_id}::${row.ebay_purchase_line_item_id}`);
      }
    }
  }

  // Import each new line item
  for (const order of orders) {
    for (const li of order.lineItems) {
      const key = `${order.purchaseOrderId}::${li.lineItemId}`;
      if (existingSet.has(key)) {
        result.skipped++;
        continue;
      }

      try {
        await importLineItem(supabase, userId, order, li);
        result.imported++;
      } catch (err) {
        console.error("[ebay/purchase-sync] Failed to import line item", key, err);
        result.errors++;
      }
    }
  }

  // Advance the sync cursor
  await supabase
    .from("ebay_accounts")
    .update({ purchases_last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return result;
}

// ─── Single line item import ──────────────────────────────────────────────────

async function importLineItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  order: NormalizedPurchaseOrder,
  li: NormalizedPurchaseLineItem
): Promise<void> {
  const { title, year, grade, gradingCompany, playerName } = parseTitle(li.title);

  const itemPriceCents = Math.round(li.unitPriceDollars * 100);
  const shippingCents = li.shippingCents;
  const taxCents = li.taxCents;
  const costBasisTotalCents = itemPriceCents + shippingCents + taxCents;
  const purchasePriceDollars = li.unitPriceDollars;

  const purchaseDate = order.createdAt
    ? order.createdAt.slice(0, 10) // YYYY-MM-DD
    : new Date().toISOString().slice(0, 10);

  const payload = {
    user_id: userId,
    item_kind: "inventory",
    acquisition_type: "buy",
    channel: "ebay",
    status: "unlisted",
    condition_status: grade ? "graded" : "raw",
    title,
    player_name: playerName,
    year,
    grade,
    grading_company: gradingCompany,
    purchase_price: purchasePriceDollars,
    purchase_date: purchaseDate,
    acquisition_date: purchaseDate,
    cost_basis_total_cents: costBasisTotalCents,
    shipping_cents: shippingCents,
    tax_cents: taxCents,
    fees_paid_cents: 0,
    quantity: li.quantity,
    ebay_purchase_order_id: order.purchaseOrderId,
    ebay_purchase_line_item_id: li.lineItemId,
  };

  const { error } = await supabase.from("collection_items").insert(payload);
  if (error) throw error;
}
