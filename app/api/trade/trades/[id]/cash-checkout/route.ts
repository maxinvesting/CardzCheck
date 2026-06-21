import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { getPayoutAccount, isPayoutReady } from "@/lib/marketplace/connect";
import { sideForUser } from "@/lib/trade/types";
import type { Trade } from "@/lib/trade/types";

export const runtime = "nodejs";

/**
 * POST /api/trade/trades/[id]/cash-checkout
 *
 * Settles the cash-on-top leg of a trade. Mirrors the marketplace checkout: the
 * paying side is charged on the platform account, the platform keeps a small
 * fee as `application_fee_amount`, and the remainder transfers to the cash
 * receiver's Stripe Connect account via a destination charge. The webhook flips
 * the trade to `confirmed` once payment completes.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: "checkout_not_configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = await createServiceClient();
  const { data: tradeRow } = await service
    .from("trades")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!tradeRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const trade = tradeRow as Trade;

  const side = sideForUser(trade, user.id);
  if (!side) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (trade.cash_cents <= 0 || !trade.cash_from) {
    return NextResponse.json({ error: "no_cash_due" }, { status: 400 });
  }
  if (trade.cash_status === "paid") {
    return NextResponse.json({ error: "already_paid" }, { status: 409 });
  }
  if (trade.status !== "accepted" && trade.status !== "cash_pending") {
    return NextResponse.json({ error: "not_ready_for_cash" }, { status: 409 });
  }
  if (trade.cash_from !== side) {
    return NextResponse.json({ error: "not_payer" }, { status: 403 });
  }

  const receiverId =
    trade.cash_from === "initiator" ? trade.recipient_id : trade.initiator_id;

  // The cash receiver must be payout-ready, or the money has nowhere to go.
  const payout = await getPayoutAccount(receiverId);
  if (!isPayoutReady(payout) || !payout?.stripe_account_id) {
    return NextResponse.json(
      { error: "receiver_not_accepting_payments" },
      { status: 409 }
    );
  }

  // Platform fee on this cash leg:
  //   • Direct trade  → free (subscriber perk); nothing is taken from the cash.
  //   • Middleman      → the 3%-of-total-value fee computed at trade time, but a
  //                      Stripe application_fee can't exceed the charged amount,
  //                      so it's capped at the cash leg. When the fee exceeds the
  //                      cash on top (card-heavy middleman trades) the remainder
  //                      isn't collectible through this rail — a dedicated fee
  //                      charge is the follow-up. We never take more than the cash.
  const feeCents = trade.use_middleman
    ? Math.min(trade.platform_fee_cents || 0, trade.cash_cents - 1)
    : 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe().checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: user.email ?? undefined,
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: trade.cash_cents,
          product_data: {
            name: "Trade cash balance",
            description: "Cash on top to balance a CardzCheck trade",
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: feeCents,
      transfer_data: { destination: payout.stripe_account_id },
      metadata: {
        trade: "true",
        trade_id: trade.id,
        payer_id: user.id,
        receiver_id: receiverId,
      },
    },
    success_url: `${appUrl}/trade/${trade.id}?cash=success`,
    cancel_url: `${appUrl}/trade/${trade.id}?cash=canceled`,
    metadata: {
      trade: "true",
      trade_id: trade.id,
      payer_id: user.id,
      receiver_id: receiverId,
      cash_cents: String(trade.cash_cents),
      platform_fee_cents: String(feeCents),
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "stripe_session_failed" }, { status: 500 });
  }

  // Reflect that a cash checkout is in flight.
  await service
    .from("trades")
    .update({
      status: "cash_pending",
      cash_status: "pending",
      stripe_session_id: session.id,
      // Keep the trade's stored platform_fee_cents (the true 3%-of-total-value
      // middleman fee) intact — `feeCents` here is only what's collectible on
      // this cash leg, which may be capped below the full fee.
      last_actor_id: user.id,
    })
    .eq("id", trade.id);

  return NextResponse.json({ url: session.url });
}
