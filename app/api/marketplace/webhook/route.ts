/**
 * POST /api/marketplace/webhook
 *
 * Stripe webhook for the marketplace exchange. Two event types matter:
 *
 *  - checkout.session.completed : a buyer paid. We record the `transactions`
 *    row (with the captured shipping address + payout math), mark the listing
 *    sold, and reflect the sale on the seller's ledger inventory item. All
 *    money math is derived from Stripe-authoritative values (amount_total and
 *    the charge's application_fee_amount), never from client/session metadata.
 *
 *  - account.updated : a Connect Express account's capabilities changed. We
 *    sync charges_enabled / payouts_enabled into seller_payout_accounts so the
 *    checkout gate stays accurate.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveLiveFee } from "@/lib/marketplace/fee-resolver";
import { syncAccountStatus } from "@/lib/marketplace/connect";
import type { ShippingAddress } from "@/lib/marketplace/shipping";

export const runtime = "nodejs";

/** Map a Stripe address payload into our ShippingAddress shape (or null). */
function extractShipTo(
  session: Stripe.Checkout.Session
): ShippingAddress | null {
  // Field location moved across API versions; check the new and legacy spots.
  const anySession = session as unknown as {
    collected_information?: {
      shipping_details?: {
        name?: string | null;
        phone?: string | null;
        address?: Stripe.Address | null;
      } | null;
    } | null;
    shipping_details?: {
      name?: string | null;
      phone?: string | null;
      address?: Stripe.Address | null;
    } | null;
  };

  const sd =
    anySession.collected_information?.shipping_details ??
    anySession.shipping_details ??
    null;
  const addr = sd?.address;
  const name = sd?.name ?? session.customer_details?.name ?? null;
  const phone = sd?.phone ?? session.customer_details?.phone ?? null;
  const email = session.customer_details?.email ?? null;

  if (!addr?.line1 || !addr.city || !addr.state || !addr.postal_code) {
    return null;
  }

  return {
    name: name ?? "Buyer",
    phone,
    street1: addr.line1,
    street2: addr.line2 ?? null,
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code,
    country: addr.country ?? "US",
    email,
  };
}

/**
 * Trade Center cash-on-top leg. The paying side completed a Stripe Checkout for
 * the cash balance; mark the trade paid + confirmed and capture the
 * Stripe-authoritative payment ids. Money math (the platform fee) was set as the
 * application_fee on the destination charge — we just record it here.
 */
async function handleTradeCashCompleted(session: Stripe.Checkout.Session) {
  const tradeId = session.metadata?.trade_id;
  if (!tradeId) {
    console.error("[marketplace/webhook] trade cash missing trade_id", session.id);
    return NextResponse.json({ error: "invalid_metadata" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Idempotency: already settled this session → no-op.
  const { data: existing } = await service
    .from("trades")
    .select("id, cash_status, initiator_approved, recipient_approved")
    .eq("id", tradeId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "trade_not_found" }, { status: 404 });
  }
  if ((existing as { cash_status: string }).cash_status === "paid") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // Pull the charge for the authoritative fee + transfer ids.
  let applicationFeeCents = 0;
  let stripeTransferId: string | null = null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (paymentIntentId) {
    try {
      const pi = await stripe().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (charge) {
        applicationFeeCents =
          typeof charge.application_fee_amount === "number"
            ? charge.application_fee_amount
            : 0;
        stripeTransferId =
          typeof charge.transfer === "string"
            ? charge.transfer
            : charge.transfer?.id ?? null;
      }
    } catch (err) {
      console.error("[marketplace/webhook] trade charge retrieve failed", err);
    }
  }

  const now = new Date().toISOString();
  const bothApproved =
    (existing as { initiator_approved: boolean }).initiator_approved &&
    (existing as { recipient_approved: boolean }).recipient_approved;

  const { error: updateErr } = await service
    .from("trades")
    .update({
      cash_status: "paid",
      status: bothApproved ? "confirmed" : "accepted",
      confirmed_at: bothApproved ? now : null,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_transfer_id: stripeTransferId,
      platform_fee_cents: applicationFeeCents,
    })
    .eq("id", tradeId);
  if (updateErr) {
    console.error("[marketplace/webhook] trade cash update failed", updateErr);
    return NextResponse.json(
      { error: "trade_update_failed", message: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Trade Center cash legs are tagged with metadata.trade.
  if (session.metadata?.trade === "true") {
    return handleTradeCashCompleted(session);
  }
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

  // Idempotency: a transaction already exists for this session → no-op.
  const { data: existing } = await service
    .from("transactions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // Re-fetch the live listing — never trust session metadata for price.
  const { data: listing, error: listingErr } = await service
    .from("listings")
    .select("id, status, list_price_cents, seller_id, mode, fulfilled_by, source_inventory_item_id")
    .eq("id", listingId)
    .single();
  if (listingErr || !listing) {
    console.error("[marketplace/webhook] listing not found", listingId);
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  const amountTotal =
    typeof session.amount_total === "number"
      ? session.amount_total
      : listing.list_price_cents;
  const salePriceCents = listing.list_price_cents;
  const shippingCents = Math.max(0, amountTotal - salePriceCents);
  const platformFulfills = listing.fulfilled_by === "platform";

  // Pull the charge to read Stripe's authoritative application fee + transfer.
  let applicationFeeCents = 0;
  let stripeChargeId: string | null = null;
  let stripeTransferId: string | null = null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (paymentIntentId) {
    try {
      const pi = await stripe().paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (charge) {
        stripeChargeId = charge.id;
        applicationFeeCents =
          typeof charge.application_fee_amount === "number"
            ? charge.application_fee_amount
            : 0;
        stripeTransferId =
          typeof charge.transfer === "string"
            ? charge.transfer
            : charge.transfer?.id ?? null;
      }
    } catch (err) {
      console.error("[marketplace/webhook] charge retrieve failed", err);
    }
  }

  // Resolve the fee tier label (and a fallback commission if we couldn't read
  // the application fee from the charge).
  const negotiatedFeeFromMeta = session.metadata?.negotiated_fee_cents;
  const negotiatedFeeCents =
    negotiatedFeeFromMeta != null ? Number(negotiatedFeeFromMeta) : undefined;

  let feeTier = "one_pct";
  let resolvedFeeCents = 0;
  try {
    const fee = await resolveLiveFee(listingId, salePriceCents, negotiatedFeeCents);
    feeTier = fee.fee_tier;
    resolvedFeeCents = fee.fee_amount_cents;
  } catch (err) {
    console.error("[marketplace/webhook] fee resolution failed", err);
  }

  // Commission = platform's cut, excluding any shipping the platform kept.
  const commissionCents =
    applicationFeeCents > 0
      ? Math.max(0, applicationFeeCents - (platformFulfills ? shippingCents : 0))
      : resolvedFeeCents;

  const sellerPayoutCents =
    applicationFeeCents > 0
      ? amountTotal - applicationFeeCents
      : amountTotal - commissionCents - (platformFulfills ? shippingCents : 0);

  const shipTo = extractShipTo(session);

  const { error: insertErr } = await service.from("transactions").insert({
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    sale_price_cents: salePriceCents,
    shipping_cents: shippingCents,
    fee_amount_cents: commissionCents,
    fee_tier: feeTier,
    fulfilled_by: listing.fulfilled_by,
    seller_payout_cents: sellerPayoutCents,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: stripeChargeId,
    stripe_transfer_id: stripeTransferId,
    fulfillment_status: "paid",
    ship_to: shipTo,
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

  // Close the loop on the seller's ledger: the listed inventory item is now
  // sold. This keeps the marketplace seamlessly in sync with the ledger.
  if (listing.source_inventory_item_id) {
    const { error: ledgerErr } = await service
      .from("collection_items")
      .update({ status: "sold" })
      .eq("id", listing.source_inventory_item_id)
      .eq("user_id", sellerId);
    if (ledgerErr) {
      console.error("[marketplace/webhook] ledger sync failed", ledgerErr);
    }
  }

  return NextResponse.json({ received: true });
}

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

  if (event.type === "checkout.session.completed") {
    return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    try {
      await syncAccountStatus(account.id);
    } catch (err) {
      console.error("[marketplace/webhook] account sync failed", err);
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
