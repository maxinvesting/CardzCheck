import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

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
      "id, status, list_price_cents, seller_id, pipeline, fee_tier, negotiated_fee_cents, marketplace_cards!inner(title, player, year, grade)"
    )
    .eq("id", listing_id)
    .single<{
      id: string;
      status: string;
      list_price_cents: number;
      seller_id: string;
      pipeline: "standard" | "elite" | "grails";
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
    return NextResponse.json(
      { error: "elite_fee_not_set" },
      { status: 409 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const card = listing.marketplace_cards;

  const stripeClient = stripe();
  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: listing.list_price_cents,
          product_data: {
            name: card.title || `${card.year} ${card.player}`,
            description: `${card.grade} graded card`,
          },
        },
      },
    ],
    mode: "payment",
    success_url: `${appUrl}/marketplace/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/marketplace/listing/${listing.id}`,
    metadata: {
      marketplace: "true",
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      // Snapshot the price the buyer agreed to. Webhook ignores this and
      // uses session.amount_total (Stripe-authoritative) as the sale price.
      sale_price_cents: String(listing.list_price_cents),
      ...(listing.negotiated_fee_cents != null && {
        negotiated_fee_cents: String(listing.negotiated_fee_cents),
      }),
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "stripe_session_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: session.url });
}
