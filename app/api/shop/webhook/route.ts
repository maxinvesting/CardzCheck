import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

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

  // Handle refunds: mark order as refunded and restore inventory
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;

    if (paymentIntentId) {
      const supabase = await createServiceClient();

      const { data: order } = await supabase
        .from("shop_orders")
        .select("id,payment_status,items")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .single();

      if (order && order.payment_status !== "cancelled") {
        const items = order.items as Array<{ listing_id: string; quantity: number }> | null;
        if (Array.isArray(items)) {
          for (const item of items) {
            if (!item.listing_id || !item.quantity) continue;
            const { data: listing } = await supabase
              .from("shop_listings")
              .select("quantity_sold, quantity, status")
              .eq("id", item.listing_id)
              .single();

            if (listing) {
              const newQuantitySold = Math.max(0, (listing.quantity_sold ?? 0) - item.quantity);
              const newStatus =
                listing.status === "sold" && newQuantitySold < (listing.quantity ?? 0)
                  ? "active"
                  : listing.status;

              await supabase
                .from("shop_listings")
                .update({ quantity_sold: newQuantitySold, status: newStatus })
                .eq("id", item.listing_id);
            }
          }
        }

        await supabase
          .from("shop_orders")
          .update({ payment_status: "refunded" })
          .eq("id", order.id);
      }
    }

    return NextResponse.json({ received: true });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const listingIdsJson = session.metadata?.listingIds;
  const quantitiesJson = session.metadata?.quantities;
  const businessFreeShipping = session.metadata?.businessFreeShipping === "true";

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

  // Build order items
  const orderItems: Array<{
    listing_id: string;
    quantity: number;
    player_name: string;
    year: number;
    set_brand: string;
    grade: string;
    price: number;
    shipping_cost: number;
  }> = [];

  let subtotal = 0;
  let shippingTotal = 0;

  for (let i = 0; i < listingIds.length; i++) {
    const listingId = listingIds[i];
    const qty = quantities[i] ?? 0;

    const { data: listing, error: fetchErr } = await supabase
      .from("shop_listings")
      .select("id,player_name,year,set_brand,grade,price,shipping_cost,quantity,quantity_sold")
      .eq("id", listingId)
      .single();

    if (fetchErr || !listing) {
      console.error("Shop webhook: listing not found", listingId);
      continue;
    }

    const available = Math.max(
      0,
      (listing.quantity ?? 0) - (listing.quantity_sold ?? 0)
    );
    const toSell = Math.min(qty, available);

    if (toSell <= 0) {
      console.warn(`Shop webhook: insufficient stock for ${listingId}, skipping`);
      continue;
    }

    const price = Number(listing.price);
    const shipCost = businessFreeShipping ? 0 : Number(listing.shipping_cost ?? 4);

    orderItems.push({
      listing_id: listing.id,
      quantity: toSell,
      player_name: String(listing.player_name),
      year: Number(listing.year),
      set_brand: String(listing.set_brand),
      grade: String(listing.grade),
      price,
      shipping_cost: shipCost,
    });

    subtotal += price * toSell;
    shippingTotal += shipCost * toSell;

    // Atomically increment quantity_sold and set status='sold' when sold out
    const newQuantitySold = (listing.quantity_sold ?? 0) + toSell;
    const newStatus =
      newQuantitySold >= (listing.quantity ?? 0) ? "sold" : "active";

    const { error: updateErr } = await supabase
      .from("shop_listings")
      .update({
        quantity_sold: newQuantitySold,
        status: newStatus,
      })
      .eq("id", listingId);

    if (updateErr) {
      console.error("Shop webhook: failed to update listing", listingId, updateErr);
    }
  }

  const total = subtotal + shippingTotal;

  const { error: insertErr } = await supabase.from("shop_orders").insert({
    buyer_email: buyerEmail,
    buyer_name: buyerName,
    shipping_address: shippingAddress,
    items: orderItems,
    subtotal,
    shipping_total: shippingTotal,
    total,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
  });

  if (insertErr) {
    console.error("Shop webhook: failed to insert order", insertErr);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
