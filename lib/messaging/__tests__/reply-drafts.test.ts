import { describe, expect, it } from "vitest";
import type { Message, MessageThread } from "@/lib/messaging/types";
import {
  buildFallbackMarketplaceReply,
  createMarketplaceReplyContext,
  parseMarketplaceOfferAmount,
  recommendMarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function makeThread(overrides: Partial<MessageThread> = {}): MessageThread {
  return {
    id: "thread-1",
    user_id: "user-1",
    platform: "ebay",
    external_thread_id: "ext-1",
    buyer_username: "dailyth",
    buyer_display_name: "dailyth",
    business_customer_id: null,
    listing_id: "listing-1",
    inventory_item_id: null,
    item_title: "One Piece Monkey D. Luffy Promo",
    item_image_url: null,
    status: "needs_response",
    category: "question",
    unread_count: 1,
    last_message_at: hoursAgo(1),
    last_message_preview: "can you do 210",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: 24000,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: 22500,
    created_at: hoursAgo(8),
    updated_at: hoursAgo(1),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    thread_id: "thread-1",
    direction: "inbound",
    sender_username: "dailyth",
    body: "can you do 210",
    is_read: false,
    external_message_id: null,
    created_at: hoursAgo(1),
    ...overrides,
  };
}

describe("reply draft helpers", () => {
  it("parses marketplace-style offer amounts", () => {
    expect(parseMarketplaceOfferAmount("can you do 210 shipped?")).toBe(21000);
    expect(parseMarketplaceOfferAmount("best price")).toBeNull();
  });

  it("infers negotiation context from buyer offer language", () => {
    const context = createMarketplaceReplyContext({
      thread: makeThread(),
      messages: [makeMessage()],
      negotiation: null,
    });

    expect(context.stage).toBe("negotiating");
    expect(context.hasOfferSignals).toBe(true);
    expect(context.thread.category).toBe("offer");
    expect(context.deal.latestOfferCents).toBe(21000);
  });

  it("recommends a counter when a suggested counter exists without profit data", () => {
    const context = createMarketplaceReplyContext({
      thread: makeThread({
        suggested_action: "counter",
        suggested_counter_cents: 22500,
      }),
      messages: [makeMessage()],
      negotiation: null,
    });

    const recommendation = recommendMarketplaceReplyAction(context);
    expect(recommendation.action).toBe("counteroffer");
    expect(recommendation.headline).toContain("$225");
  });

  it("builds concise counter fallback drafts and appends the seller note", () => {
    const context = createMarketplaceReplyContext({
      thread: makeThread({
        suggested_action: "counter",
        suggested_counter_cents: 22500,
      }),
      messages: [makeMessage()],
      negotiation: null,
    });

    const draft = buildFallbackMarketplaceReply({
      context,
      action: "counteroffer",
      sellerNote: "Can ship tomorrow morning.",
    });

    expect(draft).toContain("$225");
    expect(draft).toContain("Can ship tomorrow morning.");
  });
});
