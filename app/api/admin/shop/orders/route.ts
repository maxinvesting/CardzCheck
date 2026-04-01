import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function GET() {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("shop_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin shop orders fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const body = await request.json();
  const id = typeof body?.id === "string" ? body.id.trim() : null;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // --- Cancel order: issue Stripe refund and mark cancelled ---
  if (body?.action === "cancel") {
    const { data: order, error: fetchErr } = await supabase
      .from("shop_orders")
      .select("id,payment_status,stripe_payment_intent_id,items")
      .eq("id", id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.payment_status === "cancelled") {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 400 });
    }

    if (order.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Only paid orders can be cancelled" },
        { status: 400 }
      );
    }

    const paymentIntentId = order.stripe_payment_intent_id as string | null;
    if (paymentIntentId) {
      try {
        const stripeClient = stripe();
        await stripeClient.refunds.create({ payment_intent: paymentIntentId });
      } catch (err) {
        console.error("Stripe refund failed:", err);
        return NextResponse.json(
          { error: "Stripe refund failed. Check Stripe dashboard." },
          { status: 502 }
        );
      }
    }

    // Restore inventory for each item in the order
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

    const { data: updated, error: updateErr } = await supabase
      .from("shop_orders")
      .update({ payment_status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("Failed to update order status:", updateErr);
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    return NextResponse.json({ order: updated });
  }

  // --- General field updates (fulfillment_status, tracking, notes) ---
  const allowed = ["fulfillment_status", "tracking_number", "tracking_carrier", "notes"];
  const updates: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key] ?? null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  const validFulfillment = ["unfulfilled", "shipped", "delivered"];
  if (
    updates.fulfillment_status !== undefined &&
    !validFulfillment.includes(updates.fulfillment_status as string)
  ) {
    return NextResponse.json({ error: "Invalid fulfillment_status" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("shop_orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    console.error("Admin shop orders update error:", updateErr);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }

  return NextResponse.json({ order: updated });
}
