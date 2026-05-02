/**
 * GET  /api/business/ebay/listings  — List all eBay listings for the user
 * POST /api/business/ebay/listings  — Push a single inventory item to eBay
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { createListing } from "@/lib/ebay/selling/inventory-api";
import { handleEbayListingCreated } from "@/lib/ebay/selling/event-handlers";
import { businessInventoryProvider } from "@/lib/inventory/business-inventory-provider";
import { getEbayListingCategoryId } from "@/lib/cards/market-category";

export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessOwnerContext(user.id);

    const { data, error } = await supabase
      .from("ebay_listings")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ listings: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch listings";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessOwnerContext(user.id);

    const body = await req.json();
    const {
      inventory_item_id,
      title,
      description,
      condition = "LIKE_NEW",
      category_id,
      price_cents,
      quantity = 1,
      image_urls = [],
      fulfillment_policy_id,
      payment_policy_id,
      return_policy_id,
      merchant_location_key,
      game,
      sport,
      set_name,
      player_name,
      keywords,
    } = body;

    if (!inventory_item_id || !title || !price_cents) {
      return NextResponse.json(
        { error: "inventory_item_id, title, and price_cents are required" },
        { status: 400 }
      );
    }

    // Verify the item belongs to this user
    const inventoryItem = await businessInventoryProvider.getItem(user.id, inventory_item_id);
    if (!inventoryItem) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    if (
      inventoryItem.status === "sold" ||
      inventoryItem.status === "returned" ||
      inventoryItem.status === "traded"
    ) {
      return NextResponse.json({ error: "Cannot list a closed item on eBay" }, { status: 400 });
    }

    const resolvedCategoryId =
      typeof category_id === "string" && category_id.trim().length > 0
        ? category_id.trim()
        : getEbayListingCategoryId({
            game: typeof game === "string" ? game : null,
            sport: typeof sport === "string" ? sport : null,
            title: title,
            set: typeof set_name === "string" ? set_name : null,
            player: typeof player_name === "string" ? player_name : null,
            keywords: Array.isArray(keywords)
              ? keywords.filter((value: unknown): value is string => typeof value === "string")
              : null,
          });

    // Push to eBay
    const result = await createListing(user.id, {
      inventoryItemId: inventory_item_id,
      title,
      description: description ?? title,
      condition,
      categoryId: resolvedCategoryId,
      priceCents: price_cents,
      quantity,
      imageUrls: image_urls,
      fulfillmentPolicyId: fulfillment_policy_id,
      paymentPolicyId: payment_policy_id,
      returnPolicyId: return_policy_id,
      merchantLocationKey: merchant_location_key,
    });

    // Update inventory status, create ebay_listings record, set ebay_item_id
    await handleEbayListingCreated(
      user.id,
      inventory_item_id,
      {
        ebay_listing_id: result.listingId,
        ebay_sku: result.sku,
        title,
        listed_price_cents: price_cents,
        ebay_category_id: resolvedCategoryId,
        listing_url: result.listingUrl,
      },
      businessInventoryProvider
    );

    return NextResponse.json({
      listing_id: result.listingId,
      listing_url: result.listingUrl,
      offer_id: result.offerId,
    }, { status: 201 });
  } catch (err) {
    console.error("[ebay/listings] POST error:", err);
    const message = err instanceof Error ? err.message : "Failed to create listing";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
