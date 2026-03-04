/**
 * eBay bulk import service
 *
 * importListings() — pages through the seller's active eBay listings and
 *   creates corresponding CardzCheck inventory items + ebay_listings records.
 *   Designed for high-volume sellers: processes 200 listings per eBay API page,
 *   upserts in batches, and updates ebay_import_jobs.processed_count for live
 *   progress bar feedback in the UI.
 *
 * importSales() — pages through past eBay orders and creates business_sales
 *   records. Delegates to handleEbayOrderSold() for all profit math and status
 *   transitions — zero duplication with the webhook/sync paths.
 */

import { createClient } from "@/lib/supabase/server";
import { ebayRequest } from "./client";
import { handleEbayOrderSold } from "./event-handlers";
import { businessInventoryProvider } from "@/lib/inventory/business-inventory-provider";
import type { EbayListing } from "./types";

const SELL_API_BASE = "/sell";
const PAGE_SIZE = 200;

// ─────────────────────────────────────────────────────────
// Listings Import
// ─────────────────────────────────────────────────────────

type EbayApiOffer = {
  offerId?: string;
  sku?: string;
  listingId?: string;
  status?: string;
  pricingSummary?: { price?: { value?: string } };
  categoryId?: string;
  listingDescription?: string;
  availableQuantity?: number;
  quantitySoldOnCurrentListing?: number;
};

type EbayApiInventoryItem = {
  sku?: string;
  product?: {
    title?: string;
    imageUrls?: string[];
    description?: string;
  };
  condition?: string;
  availability?: { shipToLocationAvailability?: { quantity?: number } };
};

async function fetchOffers(userId: string, offset: number): Promise<{
  offers: EbayApiOffer[];
  total: number;
}> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  const data = await ebayRequest<{ offers?: EbayApiOffer[]; total?: number }>(
    userId,
    `${SELL_API_BASE}/inventory/v1/offer?${params.toString()}`
  );
  return { offers: data.offers ?? [], total: data.total ?? 0 };
}

async function fetchInventoryItem(userId: string, sku: string): Promise<EbayApiInventoryItem | null> {
  try {
    return await ebayRequest<EbayApiInventoryItem>(
      userId,
      `${SELL_API_BASE}/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
    );
  } catch {
    return null;
  }
}

async function updateJobProgress(jobId: string, processed: number, total?: number): Promise<void> {
  const supabase = await createClient();
  const update: Record<string, unknown> = { processed_count: processed };
  if (total !== undefined) update.total_count = total;
  await supabase.from("ebay_import_jobs").update(update).eq("id", jobId);
}

async function finalizeJob(
  jobId: string,
  status: "completed" | "failed",
  error?: string
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ebay_import_jobs")
    .update({
      status,
      error_message: error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Import active eBay listings into CardzCheck inventory.
 * Creates inventory items for listings that don't already exist in ebay_listings.
 */
export async function importListings(userId: string, jobId: string): Promise<void> {
  const supabase = await createClient();

  try {
    await supabase
      .from("ebay_import_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    let offset = 0;
    let totalKnown: number | undefined;
    let processed = 0;

    while (true) {
      const { offers, total } = await fetchOffers(userId, offset);

      if (totalKnown === undefined) {
        totalKnown = total;
        await updateJobProgress(jobId, 0, total);
      }

      if (offers.length === 0) break;

      for (const offer of offers) {
        if (!offer.sku && !offer.listingId) {
          processed++;
          continue;
        }

        const ebayListingId = offer.listingId ?? offer.offerId ?? "";
        const sku = offer.sku ?? "";

        // Skip already-imported listings
        const { data: existing } = await supabase
          .from("ebay_listings")
          .select("id")
          .eq("user_id", userId)
          .eq("ebay_listing_id", ebayListingId)
          .maybeSingle();

        if (existing) {
          processed++;
          await updateJobProgress(jobId, processed);
          continue;
        }

        // Fetch inventory item detail for title/image
        const detail = sku ? await fetchInventoryItem(userId, sku) : null;
        const title = detail?.product?.title ?? `eBay Listing ${ebayListingId}`;
        const imageUrl = detail?.product?.imageUrls?.[0] ?? null;
        const priceStr = offer.pricingSummary?.price?.value ?? "0";
        const listedPriceCents = Math.round(parseFloat(priceStr) * 100);

        // Create inventory item via provider (uses businessInventoryProvider → actions.ts)
        try {
          const inventoryItem = await businessInventoryProvider.createFromEbayData(userId, {
            title,
            ebay_listing_id: ebayListingId,
            ebay_item_id: ebayListingId,
            listed_price_cents: listedPriceCents,
            condition_status: "raw",
            image_url: imageUrl,
          });

          // Create ebay_listings record
          await supabase.from("ebay_listings").upsert(
            {
              user_id: userId,
              inventory_source: businessInventoryProvider.source,
              inventory_source_id: inventoryItem.id,
              ebay_listing_id: ebayListingId,
              ebay_sku: sku || null,
              title,
              status: "active",
              listed_price_cents: listedPriceCents,
              ebay_category_id: offer.categoryId ?? null,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "user_id,ebay_listing_id" }
          );

          // Write denormalized ebay_item_id
          await supabase
            .from("business_inventory_items")
            .update({ ebay_item_id: ebayListingId })
            .eq("id", inventoryItem.id)
            .eq("user_id", userId);
        } catch (itemErr) {
          console.warn(`[ebay/import] failed to import listing ${ebayListingId}:`, itemErr);
        }

        processed++;
        await updateJobProgress(jobId, processed);
      }

      offset += PAGE_SIZE;
      if (offset >= (totalKnown ?? 0)) break;
    }

    await finalizeJob(jobId, "completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalizeJob(jobId, "failed", message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// Sales Import
// ─────────────────────────────────────────────────────────

/**
 * Import past eBay sales (completed orders) into business_sales.
 * Delegates to handleEbayOrderSold() — same path as webhook + sync.
 * external_order_id dedup prevents double-counting.
 */
export async function importSales(
  userId: string,
  jobId: string,
  options: { lookbackDays?: number } = {}
): Promise<void> {
  const supabase = await createClient();
  const lookbackMs = (options.lookbackDays ?? 90) * 24 * 60 * 60 * 1000;
  const after = new Date(Date.now() - lookbackMs);

  try {
    await supabase
      .from("ebay_import_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // Dynamically import getOrders to avoid circular deps at module load
    const { getOrders } = await import("./fulfillment-api");

    let offset = 0;
    let processed = 0;
    let totalKnown: number | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await getOrders(userId, { after, limit: PAGE_SIZE, offset, paymentStatus: "PAID" });

      if (totalKnown === undefined) {
        totalKnown = page.total;
        await updateJobProgress(jobId, 0, page.total);
      }

      for (const order of page.orders) {
        try {
          await handleEbayOrderSold(userId, order, businessInventoryProvider);
        } catch (err) {
          console.warn(`[ebay/import-sales] order ${order.orderId} error:`, err);
        }
        processed++;
        await updateJobProgress(jobId, processed);
      }

      hasMore = page.hasMore;
      offset += PAGE_SIZE;
    }

    await finalizeJob(jobId, "completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalizeJob(jobId, "failed", message);
    throw err;
  }
}

/**
 * Normalize an eBay offer into our EbayListing shape (used by listing routes).
 */
export function normalizeEbayListing(offer: EbayApiOffer, title: string): EbayListing {
  const priceStr = offer.pricingSummary?.price?.value ?? "0";
  return {
    listingId: offer.listingId ?? offer.offerId ?? "",
    offerId: offer.offerId ?? null,
    title,
    price: parseFloat(priceStr),
    currency: "USD",
    categoryId: offer.categoryId ?? null,
    status: (offer.status as EbayListing["status"]) ?? "ACTIVE",
    quantity: offer.availableQuantity ?? 1,
    quantitySold: offer.quantitySoldOnCurrentListing ?? 0,
    listingUrl: null,
    imageUrl: null,
    sku: offer.sku ?? null,
    startTime: null,
    endTime: null,
  };
}
