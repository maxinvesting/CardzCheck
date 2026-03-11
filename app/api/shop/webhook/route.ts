import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_STOCK_UPDATE_RETRIES = 3;

type ShopListingRow = {
  id: string;
  player_name: string;
  year: number;
  set_brand: string;
  grade: string;
  price: number | string;
  shipping_cost: number | string | null;
  quantity: number | null;
  quantity_sold: number | null;
};

type ShopOrderItem = {
  listing_id: string;
  quantity: number;
  player_name: string;
  year: number;
  set_brand: string;
  grade: string;
  price: number;
  shipping_cost: number;
};

function isUniqueViolation(error: { code?: string | null } | null): boolean {
  return String(error?.code || "") === "23505";
}

async function reserveListingQuantity(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  listingId: string,
  requestedQty: number
): Promise<ShopOrderItem | null> {
  for (let attempt = 1; attempt <= MAX_STOCK_UPDATE_RETRIES; attempt++) {
    const { data: listing, error: fetchErr } = await supabase
      .from("shop_listings")
      .select("id,player_name,year,set_brand,grade,price,shipping_cost,quantity,quantity_sold")
      .eq("id", listingId)
      .maybeSingle<ShopListingRow>();

    if (fetchErr || !listing) {
      if (fetchErr) {
        console.error("Shop webhook: listing lookup failed", listingId, fetchErr);
      } else {
        console.error("Shop webhook: listing not found", listingId);
      }
      return null;
    }

    const quantity = Number(listing.quantity ?? 0);
    const quantitySold = Number(listing.quantity_sold ?? 0);
    const available = Math.max(0, quantity - quantitySold);
    const toSell = Math.min(requestedQty, available);

    if (toSell <= 0) {
      return null;
    }

    const newQuantitySold = quantitySold + toSell;
    const newStatus = newQuantitySold >= quantity ? "sold" : "active";

    const { data: updated, error: updateErr } = await supabase
      .from("shop_listings")
      .update({
        quantity_sold: newQuantitySold,
        status: newStatus,
      })
      .eq("id", listingId)
      .eq("quantity_sold", quantitySold)
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("Shop webhook: failed to update listing", listingId, updateErr);
      return null;
    }

    // Optimistic-lock miss due to concurrent update; retry with fresh state.
    if (!updated) {
      continue;
    }

    return {
      listing_id: listing.id,
      quantity: toSell,
      player_name: String(listing.player_name),
      year: Number(listing.year),
      set_brand: String(listing.set_brand),
      grade: String(listing.grade),
      price: Number(listing.price),
      shipping_cost: Number(listing.shipping_cost ?? 4),
    };
  }

  console.warn("Shop webhook: stock update contention exceeded retries", listingId);
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_SHOP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_SHOP_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripeClient = stripe();
    event = stripeClient.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Shop webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const listingIdsJson = session.metadata?.listingIds;
  const quantitiesJson = session.metadata?.quantities;

  if (!listingIdsJson || !quantitiesJson) {
    console.error("Shop webhook: missing listingIds or quantities in metadata");
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 }
    );
  }

  let listingIds: string[];
  let quantities: number[];

  try {
    listingIds = JSON.parse(listingIdsJson) as string[];
    quantities = JSON.parse(quantitiesJson) as number[];
  } catch {
    console.error("Shop webhook: invalid JSON in metadata");
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 }
    );
  }

  if (listingIds.length !== quantities.length) {
    console.error("Shop webhook: listingIds and quantities length mismatch");
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(listingIds) ||
    !Array.isArray(quantities) ||
    listingIds.some((id) => typeof id !== "string" || !id.trim()) ||
    quantities.some((qty) => !Number.isInteger(qty) || qty < 1)
  ) {
    console.error("Shop webhook: metadata types are invalid");
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();

  // Fetch full session with line items for buyer info
  const stripeClient = stripe();
  const fullSession = await stripeClient.checkout.sessions.retrieve(
    session.id,
    { expand: ["customer_details"] }
  );

  const customerDetails = fullSession.customer_details;
  const buyerEmail = customerDetails?.email ?? "unknown@example.com";
  const buyerName =
    customerDetails?.name ??
    "Unknown";
  const shippingAddress = (customerDetails?.address ?? {}) as Record<
    string,
    unknown
  >;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Claim this checkout session before any inventory mutation.
  // Requires unique index on stripe_checkout_session_id for strict idempotency.
  const { error: claimErr } = await supabase.from("shop_orders").insert({
    buyer_email: buyerEmail,
    buyer_name: buyerName,
    shipping_address: shippingAddress,
    items: [],
    subtotal: 0,
    shipping_total: 0,
    total: 0,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    payment_status: "pending",
    fulfillment_status: "unfulfilled",
  });

  if (claimErr) {
    if (isUniqueViolation(claimErr)) {
      return NextResponse.json({ received: true, idempotent: true });
    }

    console.error("Shop webhook: failed to claim order session", claimErr);
    return NextResponse.json(
      { error: "Failed to claim order session" },
      { status: 500 }
    );
  }

  // Build order items
  const orderItems: ShopOrderItem[] = [];

  let subtotal = 0;
  let shippingTotal = 0;

  for (let i = 0; i < listingIds.length; i++) {
    const listingId = listingIds[i];
    const qty = quantities[i] ?? 0;
    const item = await reserveListingQuantity(supabase, listingId, qty);

    if (!item) {
      console.warn(`Shop webhook: insufficient stock for ${listingId}, skipping`);
      continue;
    }

    orderItems.push(item);
    subtotal += item.price * item.quantity;
    shippingTotal += item.shipping_cost * item.quantity;
  }

  const total = subtotal + shippingTotal;

  const { data: finalizedOrder, error: finalizeErr } = await supabase
    .from("shop_orders")
    .update({
      items: orderItems,
      subtotal,
      shipping_total: shippingTotal,
      total,
      payment_status: "paid",
    })
    .eq("stripe_checkout_session_id", session.id)
    .select("id")
    .maybeSingle();

  if (finalizeErr || !finalizedOrder) {
    console.error("Shop webhook: failed to finalize order", finalizeErr);
    return NextResponse.json(
      { error: "Failed to finalize order" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
