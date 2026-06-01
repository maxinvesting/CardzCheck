import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";

export const dynamic = "force-dynamic";

// DELETE /api/business/trades/[tradeId]
// Undoes a trade: soft-deletes the trade row, restores outgoing inventory
// items to 'unlisted', and removes any incoming items created by the trade.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> }
): Promise<NextResponse> {
  try {
    const { tradeId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await requireBusinessAccess(user.id);

    const { data: trade, error: tradeErr } = await supabase
      .from("business_trades")
      .select("id, business_account_id, user_id, is_deleted")
      .eq("id", tradeId)
      .maybeSingle();

    if (tradeErr) throw tradeErr;
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    if (
      trade.business_account_id !== context.businessAccountId &&
      trade.user_id !== user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (trade.is_deleted) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const { data: tradeItems, error: itemsErr } = await supabase
      .from("business_trade_items")
      .select("collection_item_id, direction")
      .eq("trade_id", tradeId);
    if (itemsErr) throw itemsErr;

    const outgoingIds: string[] = [];
    const incomingIds: string[] = [];
    for (const it of tradeItems ?? []) {
      const row = it as { collection_item_id: string; direction: string };
      if (row.direction === "out") outgoingIds.push(row.collection_item_id);
      else if (row.direction === "in") incomingIds.push(row.collection_item_id);
    }

    if (outgoingIds.length > 0) {
      const { error: restoreErr } = await supabase
        .from("collection_items")
        .update({ status: "unlisted", updated_at: new Date().toISOString() })
        .in("id", outgoingIds);
      if (restoreErr) throw restoreErr;
    }

    if (incomingIds.length > 0) {
      const { error: delIncomingErr } = await supabase
        .from("collection_items")
        .delete()
        .in("id", incomingIds);
      if (delIncomingErr) throw delIncomingErr;
    }

    const { error: softDelErr } = await supabase
      .from("business_trades")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", tradeId);
    if (softDelErr) throw softDelErr;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to undo trade";
    return NextResponse.json({ error: message }, { status });
  }
}
