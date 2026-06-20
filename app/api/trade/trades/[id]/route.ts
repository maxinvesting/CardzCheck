import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchOwnedCards, getTrade } from "@/lib/trade/queries";
import { settleTrade, statusAfterApproval } from "@/lib/trade/transitions";
import { TRADE_MAX_CASH_CENTS } from "@/lib/trade/config";
import { isTerminal, sideForUser } from "@/lib/trade/types";
import type { Trade, TradeItem, TradeSide, TradeableCard } from "@/lib/trade/types";

export const runtime = "nodejs";

/**
 * GET   /api/trade/trades/[id]  → full trade detail (participant only)
 * PATCH /api/trade/trades/[id]  → action dispatch:
 *   approve | decline | cancel | revise | mark_shipped
 */

const reviseSchema = z.object({
  action: z.literal("revise"),
  initiator_item_ids: z.array(z.string().uuid()).default([]),
  recipient_item_ids: z.array(z.string().uuid()).default([]),
  cash_from: z.enum(["initiator", "recipient"]).nullable().optional(),
  cash_cents: z.number().int().min(0).max(TRADE_MAX_CASH_CENTS).optional(),
  note: z.string().max(2000).optional(),
});

const shipSchema = z.object({
  action: z.literal("mark_shipped"),
  carrier: z.string().max(64).optional(),
  tracking_number: z.string().max(128).optional(),
  tracking_url: z.string().url().max(512).optional(),
});

const simpleSchema = z.object({
  action: z.enum(["approve", "decline", "cancel"]),
});

const bodySchema = z.discriminatedUnion("action", [
  simpleSchema,
  reviseSchema,
  shipSchema,
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const trade = await getTrade(id, user.id);
  if (!trade) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ trade });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

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

  const action = parsed.data.action;

  // ── decline / cancel ──────────────────────────────────────────────────────
  if (action === "decline" || action === "cancel") {
    if (isTerminal(trade.status) || trade.status === "completed") {
      return NextResponse.json({ error: "trade_closed" }, { status: 409 });
    }
    const nextStatus = action === "cancel" ? "canceled" : "declined";
    await service
      .from("trades")
      .update({ status: nextStatus, last_actor_id: user.id })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  // ── approve ───────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!["draft", "proposed", "countered"].includes(trade.status)) {
      return NextResponse.json({ error: "not_approvable" }, { status: 409 });
    }
    const updated: Trade = {
      ...trade,
      initiator_approved:
        side === "initiator" ? true : trade.initiator_approved,
      recipient_approved:
        side === "recipient" ? true : trade.recipient_approved,
    };
    const nextStatus = statusAfterApproval(updated);
    const patch: Record<string, unknown> = {
      initiator_approved: updated.initiator_approved,
      recipient_approved: updated.recipient_approved,
      status: nextStatus,
      last_actor_id: user.id,
    };
    if (nextStatus === "accepted") patch.accepted_at = new Date().toISOString();
    if (nextStatus === "confirmed") {
      patch.accepted_at = trade.accepted_at ?? new Date().toISOString();
      patch.confirmed_at = new Date().toISOString();
    }
    await service.from("trades").update(patch).eq("id", id);
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  // ── revise (counter-offer) ────────────────────────────────────────────────
  if (action === "revise") {
    if (!["draft", "proposed", "countered"].includes(trade.status)) {
      return NextResponse.json({ error: "not_revisable" }, { status: 409 });
    }
    const input = parsed.data;
    if (input.initiator_item_ids.length + input.recipient_item_ids.length === 0) {
      return NextResponse.json(
        { error: "empty_trade", message: "A trade needs at least one card." },
        { status: 422 }
      );
    }
    const [initiatorCards, recipientCards] = await Promise.all([
      fetchOwnedCards(trade.initiator_id, input.initiator_item_ids),
      fetchOwnedCards(trade.recipient_id, input.recipient_item_ids),
    ]);
    if (initiatorCards.length !== input.initiator_item_ids.length) {
      return NextResponse.json({ error: "invalid_initiator_cards" }, { status: 422 });
    }
    if (recipientCards.length !== input.recipient_item_ids.length) {
      return NextResponse.json({ error: "invalid_recipient_cards" }, { status: 422 });
    }
    const cashCents = input.cash_cents ?? 0;
    if (cashCents > 0 && !input.cash_from) {
      return NextResponse.json(
        { error: "cash_from_required" },
        { status: 422 }
      );
    }

    // Replace items wholesale, reset approvals — the reviser approves their own
    // counter; the other party must now re-approve.
    await service.from("trade_items").delete().eq("trade_id", id);
    const buildRows = (cards: TradeableCard[], ownerId: string, s: TradeSide) =>
      cards.map((c) => ({
        trade_id: id,
        owner_id: ownerId,
        side: s,
        collection_item_id: c.id,
        title: c.title,
        player: c.player,
        year: c.year,
        grade: c.grade,
        grading_company: c.grading_company,
        image_url: c.image_url,
        estimated_value_cents: c.estimated_value_cents,
      }));
    await service.from("trade_items").insert([
      ...buildRows(initiatorCards, trade.initiator_id, "initiator"),
      ...buildRows(recipientCards, trade.recipient_id, "recipient"),
    ]);

    await service
      .from("trades")
      .update({
        status: "countered",
        cash_from: cashCents > 0 ? input.cash_from ?? null : null,
        cash_cents: cashCents,
        cash_status: "none",
        note: input.note ?? trade.note,
        initiator_approved: side === "initiator",
        recipient_approved: side === "recipient",
        last_actor_id: user.id,
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "countered" });
  }

  // ── mark_shipped ──────────────────────────────────────────────────────────
  if (action === "mark_shipped") {
    if (!["confirmed", "shipped"].includes(trade.status)) {
      return NextResponse.json({ error: "not_shippable" }, { status: 409 });
    }
    const input = parsed.data;
    const now = new Date().toISOString();
    const { error: shipErr } = await service
      .from("trade_shipments")
      .upsert(
        {
          trade_id: id,
          shipper_id: user.id,
          carrier: input.carrier ?? null,
          tracking_number: input.tracking_number ?? null,
          tracking_url: input.tracking_url ?? null,
          shipped_at: now,
        },
        { onConflict: "trade_id,shipper_id" }
      );
    if (shipErr) {
      console.error("[trade/ship] upsert failed", shipErr);
      return NextResponse.json({ error: "ship_failed", message: shipErr.message }, { status: 500 });
    }

    // Both sides shipped? → complete the swap.
    const { data: shipments } = await service
      .from("trade_shipments")
      .select("shipper_id, shipped_at")
      .eq("trade_id", id);
    const shippedIds = new Set(
      (shipments ?? [])
        .filter((s) => (s as { shipped_at: string | null }).shipped_at)
        .map((s) => (s as { shipper_id: string }).shipper_id)
    );
    const bothShipped =
      shippedIds.has(trade.initiator_id) && shippedIds.has(trade.recipient_id);

    if (bothShipped) {
      const { data: items } = await service
        .from("trade_items")
        .select("*")
        .eq("trade_id", id);
      await settleTrade(trade, (items ?? []) as TradeItem[]);
      await service
        .from("trades")
        .update({ status: "completed", completed_at: now, last_actor_id: user.id })
        .eq("id", id);
      return NextResponse.json({ ok: true, status: "completed" });
    }

    await service
      .from("trades")
      .update({ status: "shipped", last_actor_id: user.id })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "shipped" });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
