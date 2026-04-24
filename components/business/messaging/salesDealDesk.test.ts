import { describe, expect, it } from "vitest";
import type { MessageThread } from "@/lib/messaging/types";
import {
  buildSalesDealDeskSnapshot,
  isStaleSalesThread,
  matchesThreadFilter,
} from "./salesDealDesk";

function buildThread(
  overrides: Partial<MessageThread> & Pick<MessageThread, "id">
): MessageThread {
  return {
    id: overrides.id,
    user_id: "user-1",
    platform: "ebay",
    external_thread_id: null,
    buyer_username: "buyer-one",
    buyer_display_name: "Buyer One",
    business_customer_id: null,
    listing_id: null,
    inventory_item_id: null,
    item_title: "Randy Moss Downtown",
    item_image_url: null,
    status: "open",
    category: "other",
    unread_count: 0,
    last_message_at: "2026-04-22T20:00:00.000Z",
    last_message_preview: "still interested",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: null,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: "2026-04-20T20:00:00.000Z",
    updated_at: "2026-04-22T20:00:00.000Z",
    ...overrides,
  };
}

describe("sales deal desk helpers", () => {
  it("builds offer, stale, and needs-action queues from thread state", () => {
    const now = new Date("2026-04-23T20:00:00.000Z").getTime();
    const threads = [
      buildThread({
        id: "offer-1",
        category: "offer",
        offer_amount_cents: 25000,
        listing_price_cents: 30000,
        status: "awaiting_buyer",
        last_message_at: "2026-04-21T10:00:00.000Z",
      }),
      buildThread({
        id: "needs-reply",
        status: "needs_response",
        unread_count: 2,
        last_message_at: "2026-04-23T18:00:00.000Z",
      }),
      buildThread({
        id: "offer-2",
        category: "offer",
        offer_amount_cents: 18000,
        status: "open",
        last_message_at: "2026-04-23T12:00:00.000Z",
      }),
      buildThread({
        id: "closed",
        category: "offer",
        offer_amount_cents: 9900,
        status: "resolved",
      }),
    ];

    const snapshot = buildSalesDealDeskSnapshot(threads, now);

    expect(snapshot.activeOfferThreads.map((thread) => thread.id)).toEqual([
      "offer-1",
      "offer-2",
    ]);
    expect(snapshot.needsReplyThreads.map((thread) => thread.id)).toEqual([
      "needs-reply",
    ]);
    expect(snapshot.staleThreads.map((thread) => thread.id)).toEqual(["offer-1"]);
    expect(snapshot.openDealCount).toBe(3);
    expect(snapshot.pipelineOfferValueCents).toBe(43000);
    expect(snapshot.awaitingBuyerCount).toBe(1);
  });

  it("applies stale thresholds and thread filters consistently", () => {
    const now = new Date("2026-04-23T20:00:00.000Z").getTime();
    const awaitingBuyer = buildThread({
      id: "awaiting",
      status: "awaiting_buyer",
      last_message_at: "2026-04-22T06:00:00.000Z",
    });
    const openThread = buildThread({
      id: "open",
      status: "open",
      unread_count: 1,
      category: "offer",
      last_message_at: "2026-04-20T08:00:00.000Z",
    });

    expect(isStaleSalesThread(awaitingBuyer, now)).toBe(true);
    expect(isStaleSalesThread(openThread, now)).toBe(true);
    expect(matchesThreadFilter(openThread, "unread")).toBe(true);
    expect(matchesThreadFilter(openThread, "offers")).toBe(true);
    expect(matchesThreadFilter(openThread, "needs_response")).toBe(false);
  });
});
