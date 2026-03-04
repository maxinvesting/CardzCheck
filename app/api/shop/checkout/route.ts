import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  createShopCheckoutSession,
  type ShopCheckoutItem,
} from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body?.items as Array<{ listingId: string; quantity: number }>;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Invalid items: expected non-empty array" },
        { status: 400 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      console.error("Shop checkout: STRIPE_SECRET_KEY not set");
      return NextResponse.json(
        { error: "Checkout is not configured" },
        { status: 503 }
      );
    }

    const supabase = await createServiceClient();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const listingIds = items.map((i) => i.listingId);
    const { data: listings, error: fetchError } = await supabase
      .from("shop_listings")
      .select("id,price,shipping_cost,quantity,quantity_sold,status,publish_state,player_name,year,set_brand,grade")
      .in("id", listingIds);

    if (fetchError) {
      console.error("Shop checkout: fetch error", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch listings" },
        { status: 500 }
      );
    }

    const listingMap = new Map(
      (listings ?? []).map((l) => [l.id, l])
    );

    const checkoutItems: ShopCheckoutItem[] = [];

    for (const { listingId, quantity } of items) {
      const listing = listingMap.get(listingId);
      if (!listing) {
        return NextResponse.json(
          { error: `Listing not found: ${listingId}` },
          { status: 400 }
        );
      }
      if (listing.status !== "active") {
        return NextResponse.json(
          { error: `Listing ${listingId} is not available` },
          { status: 400 }
        );
      }
      if (listing.publish_state !== "published") {
        return NextResponse.json(
          { error: `Listing ${listingId} is not available` },
          { status: 400 }
        );
      }
      const available = Math.max(0, (listing.quantity ?? 0) - (listing.quantity_sold ?? 0));
      if (quantity > available || quantity < 1) {
        return NextResponse.json(
          { error: `Insufficient stock for listing ${listingId}` },
          { status: 400 }
        );
      }
      checkoutItems.push({
        listingId: listing.id,
        quantity,
        price: Number(listing.price),
        shippingCost: Number(listing.shipping_cost ?? 4),
        playerName: String(listing.player_name),
        year: Number(listing.year),
        setBrand: String(listing.set_brand),
        grade: String(listing.grade),
      });
    }

    const session = await createShopCheckoutSession(
      checkoutItems,
      `${appUrl}/shop/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      `${appUrl}/shop`
    );

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Shop checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
