/**
 * eBay event handlers — the single integration point between eBay events
 * and CardzCheck's existing business logic.
 *
 * Design guarantees:
 *   1. Never calls Supabase directly for inventory status changes —
 *      always goes through InventoryProvider.updateStatus()
 *   2. Never reimplements profit math — always calls createSale() from
 *      lib/business/actions.ts, which calls computeNetPayout + computeProfit
 *   3. Both the webhook route and the sync poller call these same functions —
 *      no duplicate logic between push and pull paths
 *   4. Idempotent: external_order_id uniqueness is enforced by the DB constraint;
 *      duplicate calls silently succeed (23505 is caught and swallowed)
 */

import { createClient } from "@/lib/supabase/server";
import { createSale } from "@/lib/business/actions";
import { calculateEbayFees } from "./fee-calculator";
import type { InventoryProvider } from "@/lib/inventory/provider";
import type { EbayOrder } from "./types";

/**
 * Resolve the CardzCheck inventory item linked to an eBay order.
 * Looks up ebay_listings by the eBay item ID from the order's line item,
 * then fetches the full item context via the provider.
 *
 * Returns null if no linked inventory item is found (e.g. item was listed
 * directly on eBay without going through CardzCheck).
 */
async function resolveInventoryForOrder(
  userId: string,
  order: EbayOrder,
  provider: InventoryProvider
): Promise<{ id: string } | null> {
  const ebayItemId = order.lineItems[0]?.ebayItemId;
  if (!ebayItemId) return null;

  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("ebay_listings")
    .select("inventory_source_id, status")
    .eq("user_id", userId)
    .eq("ebay_listing_id", ebayItemId)
    .maybeSingle();

  if (!listing) return null;

  const item = await provider.getItem(userId, listing.inventory_source_id.toString());
  if (!item) return null;

  return { id: item.id };
}

async function getTopRatedStatus(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("ebay_accounts")
      .select("top_rated_seller")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.top_rated_seller ?? false;
  } catch {
    return false;
  }
}

/**
 * Handle an eBay order that has been paid and is ready to fulfill.
 * Called from: webhook handler + sync poller.
 *
 * Creates a business_sales record (idempotent via external_order_id constraint)
 * and marks the linked inventory item as sold.
 */
export async function handleEbayOrderSold(
  userId: string,
  order: EbayOrder,
  provider: InventoryProvider
): Promise<{ created: boolean; saleId: string | null }> {
  // 1. Resolve the inventory item (null is fine — manual/external listings)
  const inventoryItem = await resolveInventoryForOrder(userId, order, provider);

  // 2. Calculate eBay fees
  const firstLine = order.lineItems[0];
  const soldPriceCents = firstLine?.soldPriceCents ?? 0;
  const isTopRated = await getTopRatedStatus(userId);
  const fees = calculateEbayFees(soldPriceCents, isTopRated);

  // 3. Create the sale via existing actions.ts createSale()
  //    - computeNetPayout + computeProfit happen inside createSale()
  //    - inventory status is marked 'sold' inside createSale()
  //    - ensureCollectionItemMirrorForSale handles the FK bridge
  //    - 23505 duplicate external_order_id → caught below → idempotent
  try {
    const sale = await createSale(userId, {
      inventory_item_id: inventoryItem?.id ?? null,
      channel: "ebay",
      sold_at: order.createdAt,
      sold_price_cents: soldPriceCents,
      shipping_charged_cents: order.shippingChargedCents,
      platform_fees_cents: fees.platform_fees_cents,
      shipping_cost_cents: order.shippingCostCents,
      tax_cents: order.taxCents,
      external_order_id: order.orderId,
      notes: order.buyerUsername ? `eBay buyer: ${order.buyerUsername}` : null,
    });

    // 4. Mark the ebay_listings row as sold
    if (firstLine?.ebayItemId) {
      const supabase = await createClient();
      await supabase
        .from("ebay_listings")
        .update({ status: "sold", last_synced_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("ebay_listing_id", firstLine.ebayItemId);
    }

    return { created: true, saleId: sale.id };
  } catch (err) {
    // Duplicate external_order_id — already processed, swallow silently
    const code = (err as any)?.code ?? "";
    const message = String((err as any)?.message ?? "");
    const isDuplicate =
      code === "23505" ||
      /external_order_id|already used/i.test(message);

    if (isDuplicate) {
      return { created: false, saleId: null };
    }

    throw err;
  }
}

/**
 * Handle a new eBay listing being pushed from CardzCheck inventory.
 * Updates inventory status to 'listed' and creates the ebay_listings record.
 */
export async function handleEbayListingCreated(
  userId: string,
  inventoryItemId: string,
  listingData: {
    ebay_listing_id: string;
    ebay_sku: string | null;
    title: string;
    listed_price_cents: number;
    ebay_category_id: string | null;
    listing_url: string | null;
    inventory_source?: "business_inventory_items" | "collection_items";
  },
  provider: InventoryProvider
): Promise<void> {
  // Mark inventory as listed via provider (never direct DB call)
  await provider.updateStatus(userId, inventoryItemId, "listed");

  const supabase = await createClient();

  // Upsert ebay_listings record
  await supabase.from("ebay_listings").upsert(
    {
      user_id: userId,
      inventory_source: listingData.inventory_source ?? provider.source,
      inventory_source_id: inventoryItemId,
      ebay_listing_id: listingData.ebay_listing_id,
      ebay_sku: listingData.ebay_sku,
      title: listingData.title,
      status: "active",
      listed_price_cents: listingData.listed_price_cents,
      ebay_category_id: listingData.ebay_category_id,
      listing_url: listingData.listing_url,
      last_synced_at: new Date().toISOString(),
      error_message: null,
    },
    { onConflict: "user_id,ebay_listing_id" }
  );

  // Update denormalized ebay_item_id on the inventory item for quick badge lookups
  await supabase
    .from("business_inventory_items")
    .update({ ebay_item_id: listingData.ebay_listing_id })
    .eq("id", inventoryItemId)
    .eq("user_id", userId);
}

/**
 * Handle an eBay listing being ended (delisted or sold through eBay directly).
 * Sets inventory status back to 'unlisted' and marks the ebay_listings row.
 */
export async function handleEbayListingEnded(
  userId: string,
  ebayListingId: string,
  provider: InventoryProvider
): Promise<void> {
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("ebay_listings")
    .select("inventory_source_id, status")
    .eq("user_id", userId)
    .eq("ebay_listing_id", ebayListingId)
    .maybeSingle();

  if (listing && listing.status !== "sold") {
    await provider.updateStatus(userId, listing.inventory_source_id.toString(), "unlisted");
  }

  await supabase
    .from("ebay_listings")
    .update({ status: "ended", last_synced_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("ebay_listing_id", ebayListingId);

  // Clear denormalized ebay_item_id
  if (listing) {
    await supabase
      .from("business_inventory_items")
      .update({ ebay_item_id: null })
      .eq("id", listing.inventory_source_id)
      .eq("user_id", userId);
  }
}

/**
 * Handle MARKETPLACE_ACCOUNT_DELETION notification (GDPR compliance).
 * eBay requires this endpoint to be implemented by all partner apps.
 */
export async function handleMarketplaceAccountDeletion(
  ebayUserId: string
): Promise<void> {
  const supabase = await createClient();

  // Soft-deactivate rather than hard delete to preserve sales history
  await supabase
    .from("ebay_accounts")
    .update({
      is_active: false,
      access_token: "",
      refresh_token: "",
      ebay_user_id: null,
      ebay_username: `[deleted:${ebayUserId}]`,
      updated_at: new Date().toISOString(),
    })
    .eq("ebay_user_id", ebayUserId);
}
