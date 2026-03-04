/**
 * PATCH  /api/business/ebay/listings/[ebayItemId]  — Update price
 * DELETE /api/business/ebay/listings/[ebayItemId]  — End/delist
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import { updateOfferPrice, endListing } from "@/lib/ebay/selling/inventory-api";
import { handleEbayListingEnded } from "@/lib/ebay/selling/event-handlers";
import { businessInventoryProvider } from "@/lib/inventory/business-inventory-provider";

export const dynamic = "force-dynamic";

type RouteContext = { params: { ebayItemId: string } };

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessAccess(user.id);

    const { ebayItemId } = params;
    const body = await req.json();
    const { price_cents, offer_id } = body;

    if (!price_cents || !offer_id) {
      return NextResponse.json(
        { error: "price_cents and offer_id are required" },
        { status: 400 }
      );
    }

    // Verify listing belongs to this user
    const { data: listing } = await supabase
      .from("ebay_listings")
      .select("id, listed_price_cents")
      .eq("user_id", user.id)
      .eq("ebay_listing_id", ebayItemId)
      .maybeSingle();

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // Update price on eBay
    await updateOfferPrice(user.id, offer_id, price_cents);

    // Update local record
    await supabase
      .from("ebay_listings")
      .update({
        listed_price_cents: price_cents,
        last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("ebay_listing_id", ebayItemId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update listing";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessAccess(user.id);

    const { ebayItemId } = params;

    // Verify listing belongs to this user and get inventory item ID
    const { data: listing } = await supabase
      .from("ebay_listings")
      .select("inventory_source_id")
      .eq("user_id", user.id)
      .eq("ebay_listing_id", ebayItemId)
      .maybeSingle();

    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

    // End listing on eBay
    await endListing(user.id, listing.inventory_source_id.toString());

    // Update local state via event handler (resets inventory to unlisted)
    await handleEbayListingEnded(user.id, ebayItemId, businessInventoryProvider);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to end listing";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
