/**
 * POST /api/marketplace/webhook
 * Stripe webhook for the marketplace exchange. Writes the `transactions` row
 * with server-resolved fee tier and fee amount. Fee math NEVER comes from
 * client/session metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLiveFee } from "@/lib/marketplace/fee-resolver";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[marketplace/webhook] STRIPE_MARKETPLACE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[marketplace/webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Only process sessions that originated from this marketplace.
  if (session.metadata?.marketplace !== "true") {
    return NextResponse.json({ received: true, skipped: "not_marketplace" });
  }

  const listingId = session.metadata?.listing_id;
  const buyerId = session.metadata?.buyer_id;
  const sellerId = session.metadata?.seller_id;

  if (!listingId || !buyerId || !sellerId) {
    console.error("[marketplace/webhook] missing required metadata", session.id);
    return NextResponse.json({ error: "invalid_metadata" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Idempotency: if a transaction already exists for this session, no-op.
  const { data: existing } = await service
    .from("transactions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // Re-fetch live listing — never trust session metadata for price.
  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, status, list_price_cents, seller_id, mode, fulfilled_by")
    .eq("id", listingId)
    .single();

  if (listingErr || !listing) {
    console.error("[marketplace/webhook] listing not found", listingId);
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  // Use Stripe's authoritative amount_total — it can't be tampered with.
  const salePriceCents =
    typeof session.amount_total === "number"
      ? session.amount_total
      : listing.list_price_cents;

  const negotiatedFeeFromMeta = session.metadata?.negotiated_fee_cents;
  const negotiatedFeeCents =
    negotiatedFeeFromMeta != null
      ? Number(negotiatedFeeFromMeta)
      : undefined;

  let feeTier;
  let feeAmountCents;
  try {
    const fee = await resolveLiveFee(
      listingId,
      salePriceCents,
      negotiatedFeeCents
    );
    feeTier = fee.fee_tier;
    feeAmountCents = fee.fee_amount_cents;
  } catch (err) {
    console.error("[marketplace/webhook] fee resolution failed", err);
    return NextResponse.json({ error: "fee_resolution_failed" }, { status: 500 });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const { error: insertErr } = await service.from("transactions").insert({
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    sale_price_cents: salePriceCents,
    fee_amount_cents: feeAmountCents,
    fee_tier: feeTier,
    fulfilled_by: listing.fulfilled_by,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
  });

  if (insertErr) {
    console.error("[marketplace/webhook] transaction insert failed", insertErr);
    return NextResponse.json(
      { error: "transaction_insert_failed", message: insertErr.message },
      { status: 500 }
    );
  }

  const { error: updateErr } = await service
    .from("listings")
    .update({ status: "sold" })
    .eq("id", listingId);

  if (updateErr) {
    console.error("[marketplace/webhook] listing status update failed", updateErr);
  }

  return NextResponse.json({ received: true });
}
