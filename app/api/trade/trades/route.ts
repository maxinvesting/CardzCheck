import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchOwnedCards, listMyTrades } from "@/lib/trade/queries";
import {
  TRADE_MAX_CASH_CENTS,
  tradePlatformFeeCents,
} from "@/lib/trade/config";
import { getTierGates } from "@/lib/access";
import type { TradeSide, TradeableCard } from "@/lib/trade/types";

export const runtime = "nodejs";

/**
 * GET  /api/trade/trades       → the caller's trades (newest first)
 * POST /api/trade/trades       → create + propose a trade
 *
 * A proposal auto-approves the initiator (they made the offer); the recipient
 * must approve. Every card placed in a trade must be flagged "Available for
 * Trade" by its owner.
 */

const createSchema = z
  .object({
    recipient_id: z.string().uuid(),
    initiator_item_ids: z.array(z.string().uuid()).default([]),
    recipient_item_ids: z.array(z.string().uuid()).default([]),
    cash_from: z.enum(["initiator", "recipient"]).nullable().optional(),
    cash_cents: z.number().int().min(0).max(TRADE_MAX_CASH_CENTS).optional(),
    use_middleman: z.boolean().optional().default(false),
    note: z.string().max(2000).optional(),
  })
  .refine((b) => b.initiator_item_ids.length + b.recipient_item_ids.length > 0, {
    message: "A trade needs at least one card.",
    path: ["initiator_item_ids"],
  })
  .refine((b) => !b.cash_cents || b.cash_cents === 0 || !!b.cash_from, {
    message: "cash_from is required when cash_cents > 0.",
    path: ["cash_from"],
  });

function snapshotRows(
  cards: TradeableCard[],
  tradeId: string,
  ownerId: string,
  side: TradeSide
) {
  return cards.map((c) => ({
    trade_id: tradeId,
    owner_id: ownerId,
    side,
    collection_item_id: c.id,
    title: c.title,
    player: c.player,
    year: c.year,
    grade: c.grade,
    grading_company: c.grading_company,
    image_url: c.image_url,
    estimated_value_cents: c.estimated_value_cents,
  }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const trades = await listMyTrades(user.id);
  return NextResponse.json({ trades });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  if (input.recipient_id === user.id) {
    return NextResponse.json({ error: "cannot_trade_with_self" }, { status: 400 });
  }

  // Validate both sides' cards (ownership + tradeable + available).
  const [initiatorCards, recipientCards] = await Promise.all([
    fetchOwnedCards(user.id, input.initiator_item_ids),
    fetchOwnedCards(input.recipient_id, input.recipient_item_ids),
  ]);
  if (initiatorCards.length !== input.initiator_item_ids.length) {
    return NextResponse.json(
      { error: "invalid_initiator_cards", message: "Some of your cards aren't available to trade." },
      { status: 422 }
    );
  }
  if (recipientCards.length !== input.recipient_item_ids.length) {
    return NextResponse.json(
      { error: "invalid_recipient_cards", message: "Some requested cards aren't available for trade." },
      { status: 422 }
    );
  }

  const cashCents = input.cash_cents ?? 0;

  // ── Settlement method + fee ────────────────────────────────────────────────
  // Direct (ship-to-ship) trades are free but reserved for subscribers. Anyone
  // can use the middleman, which costs 3% of the total trade value.
  const useMiddleman = input.use_middleman ?? false;
  if (!useMiddleman) {
    const gates = await getTierGates(user.id);
    if (gates.tier === "free") {
      return NextResponse.json(
        {
          error: "subscription_required",
          message:
            "Free direct trades require a CardzCheck membership. Subscribe to trade for free, or use the middleman (3% of total trade value).",
        },
        { status: 402 }
      );
    }
  }

  const totalValueCents =
    initiatorCards.reduce((s, c) => s + (c.estimated_value_cents || 0), 0) +
    recipientCards.reduce((s, c) => s + (c.estimated_value_cents || 0), 0) +
    cashCents;
  const platformFeeCents = tradePlatformFeeCents({
    useMiddleman,
    totalValueCents,
    cashCents,
  });

  const service = await createServiceClient();

  const { data: trade, error: tradeErr } = await service
    .from("trades")
    .insert({
      initiator_id: user.id,
      recipient_id: input.recipient_id,
      status: "proposed",
      cash_from: cashCents > 0 ? input.cash_from ?? null : null,
      cash_cents: cashCents,
      cash_status: "none",
      use_middleman: useMiddleman,
      platform_fee_cents: platformFeeCents,
      note: input.note ?? null,
      last_actor_id: user.id,
      initiator_approved: true,
      recipient_approved: false,
    })
    .select("id")
    .single();

  if (tradeErr || !trade) {
    console.error("[trade/create] insert failed", tradeErr);
    return NextResponse.json(
      { error: "trade_insert_failed", message: tradeErr?.message },
      { status: 500 }
    );
  }

  const rows = [
    ...snapshotRows(initiatorCards, trade.id, user.id, "initiator"),
    ...snapshotRows(recipientCards, trade.id, input.recipient_id, "recipient"),
  ];
  const { error: itemsErr } = await service.from("trade_items").insert(rows);
  if (itemsErr) {
    console.error("[trade/create] items insert failed", itemsErr);
    await service.from("trades").delete().eq("id", trade.id);
    return NextResponse.json(
      { error: "trade_items_failed", message: itemsErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ trade_id: trade.id });
}
