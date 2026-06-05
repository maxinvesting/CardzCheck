import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { resolveLiveFee } from "@/lib/marketplace/fee-resolver";
import { getPayoutAccount, isPayoutReady } from "@/lib/marketplace/connect";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  listing_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: "checkout_not_configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { listing_id } = parsed.data;

  const service = await createServiceClient();
  const { data: listing, error } = await service
    .from("listings")
    .select(
      "id, status, list_price_cents, shipping_cents, seller_id, pipeline, mode, fulfilled_by, fee_tier, negotiated_fee_cents, marketplace_cards!inner(title, player, year, grade)"
    )
    .eq("id", listing_id)
    .single<{
      id: string;
      status: string;
      list_price_cents: number;
      shipping_cents: number | null;
      seller_id: string;
      pipeline: "standard" | "elite" | "grails";
      mode: "self_serve" | "full_service";
      fulfilled_by: "seller" | "platform";
      fee_tier: string;
      negotiated_fee_cents: number | null;
      marketplace_cards: {
        title: string;
        player: string;
        year: number;
        grade: string;
      };
    }>();

  if (error || !listing) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  if (!["active", "price_reduced"].includes(listing.status)) {
    return NextResponse.json({ error: "listing_not_for_sale" }, { status: 410 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: "cannot_buy_own_listing" }, { status: 400 });
  }
  if (listing.pipeline === "elite" && listing.negotiated_fee_cents == null) {
    return NextResponse.json({ error: "elite_fee_not_set" }, { status: 409 });
  }

  // The seller must have a payout-ready Stripe Connect account before anyone
  // can buy — otherwise the money would have nowhere to go.
  const payout = await getPayoutAccount(listing.seller_id);
  if (!isPayoutReady(payout) || !payout?.stripe_account_id) {
    return NextResponse.json(
      { error: "seller_not_accepting_payments" },
      { status: 409 }
    );
  }

  const shippingCents = Math.max(0, listing.shipping_cents ?? 0);

  // Platform fee (commission) on the sale price — resolved server-side, never
  // trusted from the client. This becomes the Stripe application_fee.
  let feeCents: number;
  try {
    const fee = await resolveLiveFee(
      listing.id,
      listing.list_price_cents,
      listing.negotiated_fee_cents ?? undefined
    );
    feeCents = fee.fee_amount_cents;
  } catch (err) {
    console.error("[marketplace/checkout] fee resolution failed", err);
    return NextResponse.json({ error: "fee_resolution_failed" }, { status: 500 });
  }

  // When the platform fulfils (full-service, ships from the vault) it keeps the
  // shipping the buyer paid to cover the label; the seller's payout is
  // price - fee. When the seller fulfils, the seller keeps shipping to buy the
  // label, so the platform only takes its commission.
  const platformFulfills = listing.fulfilled_by === "platform";
  const applicationFeeCents = feeCents + (platformFulfills ? shippingCents : 0);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const card = listing.marketplace_cards;
  const productName = card.title || `${card.year} ${card.player}`;

  const lineItems: Array<{
    quantity: number;
    price_data: {
      currency: string;
      unit_amount: number;
      product_data: { name: string; description?: string };
    };
  }> = [
    {
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: listing.list_price_cents,
        product_data: {
          name: productName,
          description: `${card.grade} graded card`,
        },
      },
    },
  ];

  if (shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: shippingCents,
        product_data: { name: "Shipping & tracked delivery" },
      },
    });
  }

  const stripeClient = stripe();
  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: user.email ?? undefined,
    line_items: lineItems,
    mode: "payment",
    // Collect a real shipping destination so a label can be generated later.
    shipping_address_collection: { allowed_countries: ["US"] },
    phone_number_collection: { enabled: true },
    payment_intent_data: {
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: payout.stripe_account_id },
      metadata: {
        marketplace: "true",
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
      },
    },
    success_url: `${appUrl}/marketplace/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/marketplace/listing/${listing.id}`,
    metadata: {
      marketplace: "true",
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      // Snapshots for the webhook. Price/fee are re-derived server-side there;
      // these are convenience values, never authoritative for money math.
      sale_price_cents: String(listing.list_price_cents),
      shipping_cents: String(shippingCents),
      platform_fee_cents: String(feeCents),
      fulfilled_by: listing.fulfilled_by,
      ...(listing.negotiated_fee_cents != null && {
        negotiated_fee_cents: String(listing.negotiated_fee_cents),
      }),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "stripe_session_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
