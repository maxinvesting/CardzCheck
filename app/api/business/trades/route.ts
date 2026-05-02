import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";

export const dynamic = "force-dynamic";

const createTradeSchema = z.object({
  inventory_item_id: z.string().uuid(),
  traded_at: z.string().trim().min(1).optional(),
  partner_name: z.string().trim().max(160).optional().nullable(),
  fair_value_cents: z.number().int().positive(),
  cash_paid_cents: z.number().int().min(0).optional().default(0),
  cash_received_cents: z.number().int().min(0).optional().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
});

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

    const { data: scopedItem, error: scopedItemError } = await supabase
      .from("collection_items")
      .select("id, title, status, cost_basis_total_cents, business_account_id, user_id")
      .eq("id", parsed.inventory_item_id)
      .eq("item_kind", "inventory")
      .eq("business_account_id", context.businessAccountId)
      .maybeSingle();

    if (scopedItemError && !isMissingTradeSchema(scopedItemError)) {
      throw scopedItemError;
    }

    let item = scopedItem;
    if (!item) {
      const { data: fallbackItem, error: fallbackError } = await supabase
        .from("collection_items")
        .select("id, title, status, cost_basis_total_cents, business_account_id, user_id")
        .eq("id", parsed.inventory_item_id)
        .eq("item_kind", "inventory")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fallbackError) throw fallbackError;
      item = fallbackItem;
    }

    if (!item) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }

    if (item.status === "sold" || item.status === "returned" || item.status === "traded") {
      return NextResponse.json(
        { error: "This inventory item is already closed" },
        { status: 400 }
      );
    }

    const outgoingBasisCents = Math.max(0, Number(item.cost_basis_total_cents ?? 0));
    const incomingBasisCents = Math.max(
      0,
      parsed.fair_value_cents + parsed.cash_paid_cents - parsed.cash_received_cents
    );
    const realizedGainCents =
      parsed.fair_value_cents +
      parsed.cash_received_cents -
      parsed.cash_paid_cents -
      outgoingBasisCents;

    const { data: trade, error: tradeError } = await supabase
      .from("business_trades")
      .insert({
        user_id: user.id,
        business_account_id: context.businessAccountId,
        partner_name: parsed.partner_name?.trim() || null,
        traded_at: normalizeTradeDate(parsed.traded_at),
        cash_paid_cents: parsed.cash_paid_cents,
        cash_received_cents: parsed.cash_received_cents,
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

    const { error: tradeItemError } = await supabase.from("business_trade_items").insert({
      trade_id: trade.id,
      collection_item_id: item.id,
      direction: "out",
      fair_value_cents: parsed.fair_value_cents,
      allocated_cost_basis_cents: outgoingBasisCents,
    });

    if (tradeItemError) {
      if (isMissingTradeSchema(tradeItemError)) {
        return NextResponse.json(
          { error: "Trade ledger migration required", needs_migration: true },
          { status: 503 }
        );
      }
      throw tradeItemError;
    }

    const updateQuery = supabase
      .from("collection_items")
      .update({ status: "traded", updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("item_kind", "inventory");

    const { data: updatedItem, error: updateError } =
      item.business_account_id === context.businessAccountId
        ? await updateQuery.eq("business_account_id", context.businessAccountId).select("*").single()
        : await updateQuery.eq("user_id", user.id).select("*").single();

    if (updateError) {
      if (isMissingTradeSchema(updateError)) {
        return NextResponse.json(
          { error: "Trade ledger migration required", needs_migration: true },
          { status: 503 }
        );
      }
      throw updateError;
    }

    return NextResponse.json({ trade, item: updatedItem }, { status: 201 });
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
