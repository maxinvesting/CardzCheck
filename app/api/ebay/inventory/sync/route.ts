import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidUserAccessToken, withEbayBackoff } from "@/lib/ebay/user-oauth";
import { requireBusinessAccess } from "@/lib/business/actions";

const EBAY_SELL_INVENTORY_BASE = "https://api.ebay.com/sell/inventory/v1";

interface EbayOffer {
  offerId: string;
  sku: string;
  marketplaceId: string;
  format: string;
  availableQuantity: number;
  pricingSummary?: {
    price?: { value: string; currency: string };
  };
  listing?: {
    listingId: string;
    listingStatus: string;
    soldQuantity: number;
  };
}

interface EbayOffersResponse {
  offers?: EbayOffer[];
  total?: number;
  href?: string;
  next?: string;
}

interface EbayInventoryItem {
  sku: string;
  title?: string;
  description?: string;
  condition?: string;
  product?: {
    title?: string;
    imageUrls?: string[];
  };
}

async function fetchAllPublishedOffers(accessToken: string): Promise<EbayOffer[]> {
  const allOffers: EbayOffer[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const url = `${EBAY_SELL_INVENTORY_BASE}/offer?status=PUBLISHED&limit=${limit}&offset=${offset}`;
    const res = await withEbayBackoff(() =>
      fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      })
    );

    if (res.status === 404 || res.status === 204) break; // no offers
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eBay offers fetch failed (${res.status}): ${text}`);
    }

    const data: EbayOffersResponse = await res.json();
    const offers = data.offers ?? [];
    allOffers.push(...offers);

    if (offers.length < limit) break; // last page
    offset += limit;
  }

  return allOffers;
}

async function fetchInventoryItem(
  accessToken: string,
  sku: string
): Promise<EbayInventoryItem | null> {
  try {
    const res = await withEbayBackoff(() =>
      fetch(`${EBAY_SELL_INVENTORY_BASE}/inventory_item/${encodeURIComponent(sku)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
    );
    if (!res.ok) return null;
    return res.json() as Promise<EbayInventoryItem>;
  } catch {
    return null;
  }
}

function dollarStringToCents(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * POST /api/ebay/inventory/sync
 *
 * Fetches all active (PUBLISHED) eBay listings and upserts them into
 * collection_items with item_kind='inventory'.
 *
 * Rules:
 * - Match by ebay_item_id (listing ID). Never overwrite cost_basis_total_cents.
 * - New items get cost_basis_total_cents=0 (user must fill in).
 * - Updates: title, list_price_cents, status='listed', channel='ebay', ebay_listing_url, ebay_image_url.
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

    const context = await requireBusinessAccess(user.id);

    const accessToken = await getValidUserAccessToken(supabase, user.id);
    if (!accessToken) {
      return NextResponse.json(
        { error: "eBay account not connected. Connect your eBay account in Settings." },
        { status: 400 }
      );
    }

    // 1. Fetch all published offers
    const offers = await fetchAllPublishedOffers(accessToken);

    if (offers.length === 0) {
      // Update sync timestamp even on empty result
      await supabase
        .from("users")
        .update({ ebay_last_inventory_sync: new Date().toISOString() })
        .eq("id", user.id);

      return NextResponse.json({
        added: 0,
        updated: 0,
        total: 0,
        message: "No active eBay listings found. If you have active listings, make sure they are managed through the eBay Inventory API.",
        synced_at: new Date().toISOString(),
      });
    }

    // 2. Filter to offers with a valid listing ID
    const listableOffers = offers.filter(
      (o) => o.listing?.listingId && o.listing.listingStatus === "ACTIVE"
    );

    // 3. Fetch existing items in one query to determine add vs. update
    const listingIds = listableOffers.map((o) => o.listing!.listingId);
    const { data: existingItems } = await supabase
      .from("collection_items")
      .select("id, ebay_item_id, cost_basis_total_cents")
      .eq("user_id", user.id)
      .in("ebay_item_id", listingIds);

    const existingMap = new Map<string, { id: string; cost_basis_total_cents: number | null }>();
    for (const item of existingItems ?? []) {
      if (item.ebay_item_id) existingMap.set(item.ebay_item_id, item);
    }

    let added = 0;
    let updated = 0;

    // 4. Process each offer
    for (const offer of listableOffers) {
      const listingId = offer.listing!.listingId;
      const priceCents = dollarStringToCents(offer.pricingSummary?.price?.value);
      const listingUrl = `https://www.ebay.com/itm/${listingId}`;

      // Fetch inventory item details for this SKU
      const inventoryItem = await fetchInventoryItem(accessToken, offer.sku);
      const title =
        inventoryItem?.product?.title ||
        inventoryItem?.title ||
        `eBay Listing ${listingId}`;
      const imageUrl =
        inventoryItem?.product?.imageUrls?.[0] ?? null;

      const existing = existingMap.get(listingId);

      if (existing) {
        // Update existing item — never touch cost_basis_total_cents
        await supabase
          .from("collection_items")
          .update({
            business_account_id: context.businessAccountId,
            title,
            list_price_cents: priceCents,
            status: "listed",
            channel: "ebay",
            ebay_listing_url: listingUrl,
            ...(imageUrl ? { ebay_image_url: imageUrl } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("user_id", user.id);

        updated++;
      } else {
        // Insert new item
        await supabase.from("collection_items").insert({
          user_id: user.id,
          business_account_id: context.businessAccountId,
          item_kind: "inventory",
          title,
          player_name: title, // best we can do from eBay data
          quantity: offer.availableQuantity || 1,
          acquisition_type: "other",
          cost_basis_total_cents: 0, // user must fill in cost
          tax_cents: 0,
          shipping_cents: 0,
          fees_paid_cents: 0,
          condition_status: "raw",
          channel: "ebay",
          status: "listed",
          list_price_cents: priceCents,
          ebay_item_id: listingId,
          ebay_listing_url: listingUrl,
          ...(imageUrl ? { ebay_image_url: imageUrl } : {}),
        });

        added++;
      }
    }

    // 5. Update last sync timestamp
    const syncedAt = new Date().toISOString();
    await supabase
      .from("users")
      .update({ ebay_last_inventory_sync: syncedAt })
      .eq("id", user.id);

    return NextResponse.json({
      added,
      updated,
      total: added + updated,
      synced_at: syncedAt,
    });
  } catch (err) {
    console.error("eBay inventory sync error:", err);
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
