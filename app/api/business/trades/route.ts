import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess, createInventoryItem } from "@/lib/business/actions";

export const dynamic = "force-dynamic";

const outgoingItemSchema = z.object({
  inventory_item_id: z.string().uuid(),
  fair_value_cents: z.number().int().positive(),
});

const incomingItemSchema = z.object({
  card_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  player_name: z.string().trim().max(160).nullable().optional(),
  year: z.string().trim().max(8).nullable().optional(),
  set_name: z.string().trim().max(160).nullable().optional(),
  parallel_type: z.string().trim().max(160).nullable().optional(),
  card_number: z.string().trim().max(40).nullable().optional(),
  grade: z.string().trim().max(40).nullable().optional(),
  grading_company: z.string().trim().max(40).nullable().optional(),
  fair_value_cents: z.number().int().min(0),
  allocated_cost_basis_cents: z.number().int().min(0),
  image_url: z.string().trim().max(2048).nullable().optional(),
});

const createTradeSchema = z
  .object({
    // Multi-card preferred shape
    outgoing: z.array(outgoingItemSchema).optional(),
    incoming: z.array(incomingItemSchema).optional(),
    // Legacy single-card shape
    inventory_item_id: z.string().uuid().optional(),
    fair_value_cents: z.number().int().positive().optional(),
    traded_at: z.string().trim().min(1).optional(),
    partner_name: z.string().trim().max(160).optional().nullable(),
    cash_paid_cents: z.number().int().min(0).optional().default(0),
    cash_received_cents: z.number().int().min(0).optional().default(0),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (data) =>
      (data.outgoing && data.outgoing.length > 0) ||
      (data.inventory_item_id && data.fair_value_cents),
    { message: "At least one outgoing card is required" }
  );

function isMissingTradeSchema(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("business_trades") ||
    message.includes("business_trade_items") ||
    message.includes("collection_items_status_check") ||
    message.includes("traded")
  );
}

function normalizeTradeDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00.000Z`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const context = await requireBusinessAccess(user.id);

    const { data: trades, error } = await supabase
      .from("business_trades")
      .select(
        "id, partner_name, traded_at, cash_paid_cents, cash_received_cents, outgoing_basis_cents, incoming_basis_cents, realized_gain_cents, notes, created_at"
      )
      .eq("business_account_id", context.businessAccountId)
      .eq("is_deleted", false)
      .order("traded_at", { ascending: false })
      .limit(500);

    if (error) {
      if (isMissingTradeSchema(error)) {
        return NextResponse.json({ trades: [] });
      }
      throw error;
    }

    type TradeRow = {
      id: string;
      partner_name: string | null;
      traded_at: string;
      cash_paid_cents: number;
      cash_received_cents: number;
      outgoing_basis_cents: number;
      incoming_basis_cents: number;
      realized_gain_cents: number;
      notes: string | null;
      created_at: string;
    };
    const typedTrades = (trades ?? []) as TradeRow[];
    const tradeIds = typedTrades.map((t) => t.id);
    let itemsByTrade: Record<string, Array<{
      direction: "in" | "out";
      collection_item_id: string;
      fair_value_cents: number | null;
      allocated_cost_basis_cents: number | null;
      title: string | null;
    }>> = {};

    if (tradeIds.length > 0) {
      const { data: tradeItems, error: itemsError } = await supabase
        .from("business_trade_items")
        .select(
          "trade_id, direction, collection_item_id, fair_value_cents, allocated_cost_basis_cents"
        )
        .in("trade_id", tradeIds);

      if (itemsError && !isMissingTradeSchema(itemsError)) throw itemsError;

      type TradeItemRow = {
        trade_id: string;
        direction: string;
        collection_item_id: string;
        fair_value_cents: number | null;
        allocated_cost_basis_cents: number | null;
      };
      const typedItems = (tradeItems ?? []) as TradeItemRow[];
      const collectionIds = Array.from(
        new Set(typedItems.map((it) => it.collection_item_id))
      );
      const titlesById: Record<string, string | null> = {};
      if (collectionIds.length > 0) {
        const { data: ciRows } = await supabase
          .from("collection_items")
          .select("id, title")
          .in("id", collectionIds);
        for (const row of ciRows ?? []) {
          titlesById[row.id as string] = (row as { title: string | null }).title ?? null;
        }
      }

      for (const it of typedItems) {
        const list = itemsByTrade[it.trade_id] ?? [];
        list.push({
          direction: it.direction as "in" | "out",
          collection_item_id: it.collection_item_id,
          fair_value_cents: it.fair_value_cents ?? null,
          allocated_cost_basis_cents: it.allocated_cost_basis_cents ?? null,
          title: titlesById[it.collection_item_id] ?? null,
        });
        itemsByTrade[it.trade_id] = list;
      }
    }

    return NextResponse.json({
      trades: typedTrades.map((t) => ({
        ...t,
        items: itemsByTrade[t.id] ?? [],
      })),
    });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to load trades";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await requireBusinessAccess(user.id);
    const parsed = createTradeSchema.parse(await request.json());

    // Resolve outgoing list — prefer the multi-card shape, fall back to legacy single.
    const outgoingInputs =
      parsed.outgoing && parsed.outgoing.length > 0
        ? parsed.outgoing
        : parsed.inventory_item_id && parsed.fair_value_cents
        ? [
            {
              inventory_item_id: parsed.inventory_item_id,
              fair_value_cents: parsed.fair_value_cents,
            },
          ]
        : [];

    if (outgoingInputs.length === 0) {
      return NextResponse.json(
        { error: "At least one outgoing card is required" },
        { status: 400 }
      );
    }

    // Load each outgoing item, validate ownership/closed status, sum basis.
    type Loaded = {
      id: string;
      cost_basis_total_cents: number;
      business_account_id: string | null;
      fair_value_cents: number;
    };
    const loadedOutgoing: Loaded[] = [];
    let outgoingBasisCents = 0;
    let outgoingFairCents = 0;

    for (const o of outgoingInputs) {
      const { data: scoped, error: scopedErr } = await supabase
        .from("collection_items")
        .select("id, status, cost_basis_total_cents, business_account_id, user_id")
        .eq("id", o.inventory_item_id)
        .eq("item_kind", "inventory")
        .eq("business_account_id", context.businessAccountId)
        .maybeSingle();

      if (scopedErr && !isMissingTradeSchema(scopedErr)) throw scopedErr;

      let item = scoped;
      if (!item) {
        const { data: fallback, error: fbErr } = await supabase
          .from("collection_items")
          .select("id, status, cost_basis_total_cents, business_account_id, user_id")
          .eq("id", o.inventory_item_id)
          .eq("item_kind", "inventory")
          .eq("user_id", user.id)
          .maybeSingle();
        if (fbErr) throw fbErr;
        item = fallback;
      }
      if (!item) {
        return NextResponse.json(
          { error: `Inventory item ${o.inventory_item_id} not found` },
          { status: 404 }
        );
      }
      if (item.status === "sold" || item.status === "returned" || item.status === "traded") {
        return NextResponse.json(
          { error: "One of the selected inventory items is already closed" },
          { status: 400 }
        );
      }

      const basis = Math.max(0, Number(item.cost_basis_total_cents ?? 0));
      outgoingBasisCents += basis;
      outgoingFairCents += o.fair_value_cents;
      loadedOutgoing.push({
        id: item.id as string,
        cost_basis_total_cents: basis,
        business_account_id: (item.business_account_id as string | null) ?? null,
        fair_value_cents: o.fair_value_cents,
      });
    }

    const incomingItems = parsed.incoming ?? [];
    const incomingBasisCents = incomingItems.reduce(
      (acc, it) => acc + (it.allocated_cost_basis_cents ?? 0),
      0
    );

    const cashPaid = parsed.cash_paid_cents ?? 0;
    const cashReceived = parsed.cash_received_cents ?? 0;
    const realizedGainCents =
      outgoingFairCents + cashReceived - cashPaid - outgoingBasisCents;
    const tradedAtIso = normalizeTradeDate(parsed.traded_at);
    const tradedAtDate = tradedAtIso.slice(0, 10);

    const { data: trade, error: tradeError } = await supabase
      .from("business_trades")
      .insert({
        user_id: user.id,
        business_account_id: context.businessAccountId,
        partner_name: parsed.partner_name?.trim() || null,
        traded_at: tradedAtIso,
        cash_paid_cents: cashPaid,
        cash_received_cents: cashReceived,
        outgoing_basis_cents: outgoingBasisCents,
        incoming_basis_cents: incomingBasisCents,
        realized_gain_cents: realizedGainCents,
        notes: parsed.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (tradeError) {
      if (isMissingTradeSchema(tradeError)) {
        return NextResponse.json(
          { error: "Trade ledger migration required", needs_migration: true },
          { status: 503 }
        );
      }
      throw tradeError;
    }

    // Outgoing trade items + flip status to traded.
    for (const out of loadedOutgoing) {
      const { error: tiErr } = await supabase.from("business_trade_items").insert({
        trade_id: trade.id,
        collection_item_id: out.id,
        direction: "out",
        fair_value_cents: out.fair_value_cents,
        allocated_cost_basis_cents: out.cost_basis_total_cents,
      });
      if (tiErr) {
        if (isMissingTradeSchema(tiErr)) {
          return NextResponse.json(
            { error: "Trade ledger migration required", needs_migration: true },
            { status: 503 }
          );
        }
        throw tiErr;
      }

      const updateBuilder = supabase
        .from("collection_items")
        .update({ status: "traded", updated_at: new Date().toISOString() })
        .eq("id", out.id)
        .eq("item_kind", "inventory");

      const { error: upErr } =
        out.business_account_id === context.businessAccountId
          ? await updateBuilder.eq("business_account_id", context.businessAccountId)
          : await updateBuilder.eq("user_id", user.id);

      if (upErr) {
        if (isMissingTradeSchema(upErr)) {
          return NextResponse.json(
            { error: "Trade ledger migration required", needs_migration: true },
            { status: 503 }
          );
        }
        throw upErr;
      }
    }

    // Incoming items: create new inventory rows + insert trade_item links.
    for (const inc of incomingItems) {
      const created = await createInventoryItem(user.id, {
        title: inc.title,
        card_id: inc.card_id ?? null,
        player_name: inc.player_name ?? null,
        year: inc.year ?? null,
        set_name: inc.set_name ?? null,
        parallel_type: inc.parallel_type ?? null,
        card_number: inc.card_number ?? null,
        grade: inc.grade ?? null,
        grading_company: inc.grading_company ?? null,
        condition_status: inc.grade ? "graded" : "raw",
        quantity: 1,
        status: "unlisted",
        channel: "other",
        acquisition_type: "trade",
        acquisition_date: tradedAtDate,
        cost_basis_total_cents: inc.allocated_cost_basis_cents,
        tax_cents: 0,
        shipping_cents: 0,
        fees_paid_cents: 0,
        list_price_cents: null,
        current_market_value_cents: inc.fair_value_cents || null,
        notes: parsed.notes?.trim() || null,
        image_url: inc.image_url ?? null,
      } as never);

      const { error: tiErr } = await supabase.from("business_trade_items").insert({
        trade_id: trade.id,
        collection_item_id: created.id,
        direction: "in",
        fair_value_cents: inc.fair_value_cents,
        allocated_cost_basis_cents: inc.allocated_cost_basis_cents,
      });
      if (tiErr) {
        if (isMissingTradeSchema(tiErr)) {
          return NextResponse.json(
            { error: "Trade ledger migration required", needs_migration: true },
            { status: 503 }
          );
        }
        throw tiErr;
      }
    }

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid trade payload" },
        { status: 400 }
      );
    }

    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to record trade";
    return NextResponse.json({ error: message }, { status });
  }
}
