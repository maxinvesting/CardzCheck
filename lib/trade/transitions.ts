/**
 * Trade Center status machine + settlement.
 *
 * The pure helpers decide the next status after an approval; settleTrade()
 * performs the actual card swap once a trade completes. Settlement uses the
 * service role because it intentionally writes across BOTH users' inventories.
 */

import { createServiceClient } from "@/lib/supabase/server";
import type { Trade, TradeItem, TradeStatus } from "./types";

export function bothApproved(t: {
  initiator_approved: boolean;
  recipient_approved: boolean;
}): boolean {
  return t.initiator_approved && t.recipient_approved;
}

/**
 * Given a trade whose approval flags were just updated, decide the status it
 * should move to. Card-only trades jump straight to `confirmed`; trades with
 * cash sit at `accepted` until the cash leg is paid.
 */
export function statusAfterApproval(t: Trade): TradeStatus {
  if (!bothApproved(t)) {
    // Still negotiating — preserve countered vs proposed.
    return t.status === "countered" ? "countered" : "proposed";
  }
  if (t.cash_cents > 0 && t.cash_status !== "paid") {
    return "accepted"; // awaiting cash payment
  }
  return "confirmed";
}

/** Whether the trade is fully agreed and (if applicable) cash-settled. */
export function isConfirmed(t: Trade): boolean {
  return bothApproved(t) && (t.cash_cents === 0 || t.cash_status === "paid");
}

/**
 * Finalize a completed trade: each offered card leaves the giver's inventory
 * (status='traded', no longer tradeable) and an incoming copy is created in the
 * receiver's collection (acquisition_type='trade'). Best-effort and tolerant of
 * partial failures — logs and continues so one bad row can't strand the swap.
 *
 * NOTE: deeper business-ledger accounting (business_trades rows with cost-basis
 * allocation) is deferred; the 'traded' status already flows through ledger /
 * financials views.
 */
export async function settleTrade(trade: Trade, items: TradeItem[]): Promise<void> {
  const service = await createServiceClient();

  for (const item of items) {
    const giverId = item.owner_id;
    const receiverId =
      item.side === "initiator" ? trade.recipient_id : trade.initiator_id;
    const valueCents = item.estimated_value_cents || null;

    // 1) Retire the giver's source card.
    if (item.collection_item_id) {
      const { error } = await service
        .from("collection_items")
        .update({ status: "traded", is_tradeable: false })
        .eq("id", item.collection_item_id)
        .eq("user_id", giverId);
      if (error) {
        console.error("[trade/settle] retire source failed", item.id, error.message);
      }
    }

    // 2) Mint the receiver's incoming copy.
    const { error: insErr } = await service.from("collection_items").insert({
      user_id: receiverId,
      player_name: item.player || item.title || "Card",
      title: item.title,
      year: item.year,
      grade: item.grade,
      grading_company: item.grading_company,
      image_url: item.image_url,
      user_image_url: item.image_url,
      acquisition_type: "trade",
      status: "unlisted",
      item_kind: "owned",
      current_market_value_cents: valueCents,
      cost_basis_total_cents: valueCents,
    });
    if (insErr) {
      console.error("[trade/settle] mint incoming failed", item.id, insErr.message);
    }
  }
}
