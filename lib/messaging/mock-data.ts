/**
 * Realistic mock data for the messaging feature.
 *
 * This file is clearly separated from production logic.
 * When eBay messaging API is wired, replace calls to getMock*()
 * with real data fetches.
 */

import type {
  MessageThread,
  Message,
  MessagingStats,
  NegotiationAnalysis,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

// ─── Mock threads ────────────────────────────────────────────────────────────

const MOCK_THREADS: MessageThread[] = [
  {
    id: "t1",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-001",
    buyer_username: "cardcollector92",
    buyer_display_name: "Mike R.",
    business_customer_id: null,
    listing_id: "ebay-listing-4821",
    inventory_item_id: "inv-001",
    item_title: "2023 Topps Chrome Elly De La Cruz RC PSA 10",
    item_image_url: null,
    status: "needs_response",
    category: "offer",
    unread_count: 2,
    last_message_at: hoursAgo(1),
    last_message_preview: "Would you take $85 for this? I can pay right now.",
    ai_suggested_reply: "Thanks for the offer! I can meet you at $95 — that's my best price on this one. Let me know if that works.",
    suggested_action: "counter",
    offer_amount_cents: 8500,
    listing_price_cents: 11000,
    cost_basis_cents: 4200,
    fee_percent: 13.25,
    estimated_net_cents: 7375,
    estimated_profit_cents: 3175,
    suggested_counter_cents: 9500,
    created_at: daysAgo(2),
    updated_at: hoursAgo(1),
  },
  {
    id: "t2",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-002",
    buyer_username: "sportsfan_TX",
    buyer_display_name: "David K.",
    business_customer_id: null,
    listing_id: "ebay-listing-4799",
    inventory_item_id: "inv-002",
    item_title: "2024 Bowman 1st Ethan Salas Auto /99 BGS 9.5",
    item_image_url: null,
    status: "needs_response",
    category: "question",
    unread_count: 1,
    last_message_at: hoursAgo(3),
    last_message_preview: "Is this the refractor version? Hard to tell from the photos.",
    ai_suggested_reply: "Great question! This is the base chrome version, not the refractor. Happy to take additional photos if that helps. Let me know!",
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: 32500,
    cost_basis_cents: 18000,
    fee_percent: 13.25,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: daysAgo(1),
    updated_at: hoursAgo(3),
  },
  {
    id: "t3",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-003",
    buyer_username: "psa_hunter",
    buyer_display_name: null,
    business_customer_id: null,
    listing_id: "ebay-listing-4810",
    inventory_item_id: "inv-003",
    item_title: "2022 Panini Prizm Justin Jefferson Silver PSA 9",
    item_image_url: null,
    status: "open",
    category: "shipping",
    unread_count: 0,
    last_message_at: hoursAgo(8),
    last_message_preview: "Tracking shows delivered, thanks for the fast shipping!",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: 4500,
    cost_basis_cents: 2200,
    fee_percent: 13.25,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: daysAgo(5),
    updated_at: hoursAgo(8),
  },
  {
    id: "t4",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-004",
    buyer_username: "vintagewax_joe",
    buyer_display_name: "Joe M.",
    business_customer_id: null,
    listing_id: "ebay-listing-4788",
    inventory_item_id: "inv-004",
    item_title: "1986 Fleer Michael Jordan RC PSA 7",
    item_image_url: null,
    status: "needs_response",
    category: "offer",
    unread_count: 1,
    last_message_at: hoursAgo(5),
    last_message_preview: "Best I can do is $2,800. Sold comps are around $3k for PSA 7s.",
    ai_suggested_reply: "I appreciate the offer. Recent PSA 7 sales have actually been in the $3,200-$3,400 range. I could come down to $3,150 — solid value for a clean holder.",
    suggested_action: "counter",
    offer_amount_cents: 280000,
    listing_price_cents: 350000,
    cost_basis_cents: 220000,
    fee_percent: 12.35,
    estimated_net_cents: 245420,
    estimated_profit_cents: 25420,
    suggested_counter_cents: 315000,
    created_at: daysAgo(3),
    updated_at: hoursAgo(5),
  },
  {
    id: "t5",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-005",
    buyer_username: "breaks4life",
    buyer_display_name: "Sarah L.",
    business_customer_id: null,
    listing_id: "ebay-listing-4815",
    inventory_item_id: "inv-005",
    item_title: "2023 Topps Chrome Update Corbin Carroll Gold /50",
    item_image_url: null,
    status: "open",
    category: "question",
    unread_count: 0,
    last_message_at: daysAgo(1),
    last_message_preview: "Can you combine shipping if I buy two cards?",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: 7500,
    cost_basis_cents: 3500,
    fee_percent: 13.25,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(1),
  },
  {
    id: "t6",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-006",
    buyer_username: "rookie_investor",
    buyer_display_name: "Chris W.",
    business_customer_id: null,
    listing_id: "ebay-listing-4803",
    inventory_item_id: "inv-006",
    item_title: "2024 Topps Series 1 Jackson Holliday RC #1",
    item_image_url: null,
    status: "resolved",
    category: "offer",
    unread_count: 0,
    last_message_at: daysAgo(4),
    last_message_preview: "Deal! Buying now. Thanks for working with me.",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: 2800,
    listing_price_cents: 3500,
    cost_basis_cents: 1200,
    fee_percent: 13.25,
    estimated_net_cents: 2429,
    estimated_profit_cents: 1229,
    suggested_counter_cents: null,
    created_at: daysAgo(6),
    updated_at: daysAgo(4),
  },
  {
    id: "t7",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-007",
    buyer_username: "gradedgems88",
    buyer_display_name: "Amy T.",
    business_customer_id: null,
    listing_id: null,
    inventory_item_id: null,
    item_title: null,
    item_image_url: null,
    status: "open",
    category: "complaint",
    unread_count: 1,
    last_message_at: hoursAgo(12),
    last_message_preview: "The card arrived with a small dent in the top-loader. Can we work something out?",
    ai_suggested_reply: "I'm sorry to hear that. Could you send me a photo of the damage? I want to make sure we get this resolved for you quickly.",
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: null,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: daysAgo(7),
    updated_at: hoursAgo(12),
  },
  {
    id: "t8",
    user_id: "mock-user",
    platform: "ebay",
    external_thread_id: "ebay-msg-008",
    buyer_username: "flipkingz",
    buyer_display_name: null,
    business_customer_id: null,
    listing_id: "ebay-listing-4790",
    inventory_item_id: "inv-007",
    item_title: "2023 Panini Prizm Victor Wembanyama RC Silver PSA 10",
    item_image_url: null,
    status: "archived",
    category: "return_refund",
    unread_count: 0,
    last_message_at: daysAgo(10),
    last_message_preview: "Refund received. Thanks for handling it.",
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: 15000,
    cost_basis_cents: 8500,
    fee_percent: 13.25,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: daysAgo(14),
    updated_at: daysAgo(10),
  },
];

// ─── Mock messages per thread ────────────────────────────────────────────────

const MOCK_MESSAGES: Record<string, Message[]> = {
  t1: [
    {
      id: "m1-1",
      thread_id: "t1",
      direction: "inbound",
      sender_username: "cardcollector92",
      body: "Hi, I'm interested in the Elly De La Cruz PSA 10. Would you consider $80?",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(2),
    },
    {
      id: "m1-2",
      thread_id: "t1",
      direction: "outbound",
      sender_username: "seller",
      body: "Thanks for reaching out! I'm firm at $110 on this one — it's a clean holder and comps are strong.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(1.5),
    },
    {
      id: "m1-3",
      thread_id: "t1",
      direction: "inbound",
      sender_username: "cardcollector92",
      body: "I understand. Would you take $85 for this? I can pay right now.",
      is_read: false,
      external_message_id: null,
      created_at: hoursAgo(1),
    },
  ],
  t2: [
    {
      id: "m2-1",
      thread_id: "t2",
      direction: "inbound",
      sender_username: "sportsfan_TX",
      body: "Is this the refractor version? Hard to tell from the photos.",
      is_read: false,
      external_message_id: null,
      created_at: hoursAgo(3),
    },
  ],
  t3: [
    {
      id: "m3-1",
      thread_id: "t3",
      direction: "inbound",
      sender_username: "psa_hunter",
      body: "Hey, when do you plan to ship this? Just want to make sure I'm home.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(4),
    },
    {
      id: "m3-2",
      thread_id: "t3",
      direction: "outbound",
      sender_username: "seller",
      body: "Shipping out tomorrow morning. You should have tracking by end of day.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(3.5),
    },
    {
      id: "m3-3",
      thread_id: "t3",
      direction: "inbound",
      sender_username: "psa_hunter",
      body: "Tracking shows delivered, thanks for the fast shipping!",
      is_read: true,
      external_message_id: null,
      created_at: hoursAgo(8),
    },
  ],
  t4: [
    {
      id: "m4-1",
      thread_id: "t4",
      direction: "inbound",
      sender_username: "vintagewax_joe",
      body: "Love this card. Any flexibility on the price? I'm seeing PSA 7s around $3k on recent sales.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(2),
    },
    {
      id: "m4-2",
      thread_id: "t4",
      direction: "outbound",
      sender_username: "seller",
      body: "Thanks for the interest! This is a strong PSA 7 with great centering. I could do $3,300.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(1.5),
    },
    {
      id: "m4-3",
      thread_id: "t4",
      direction: "inbound",
      sender_username: "vintagewax_joe",
      body: "Best I can do is $2,800. Sold comps are around $3k for PSA 7s.",
      is_read: false,
      external_message_id: null,
      created_at: hoursAgo(5),
    },
  ],
  t5: [
    {
      id: "m5-1",
      thread_id: "t5",
      direction: "inbound",
      sender_username: "breaks4life",
      body: "Can you combine shipping if I buy two cards?",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(1),
    },
  ],
  t6: [
    {
      id: "m6-1",
      thread_id: "t6",
      direction: "inbound",
      sender_username: "rookie_investor",
      body: "Would you take $25 for the Holliday RC?",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(6),
    },
    {
      id: "m6-2",
      thread_id: "t6",
      direction: "outbound",
      sender_username: "seller",
      body: "I can do $28 — that's about as low as I can go after fees.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(5),
    },
    {
      id: "m6-3",
      thread_id: "t6",
      direction: "inbound",
      sender_username: "rookie_investor",
      body: "Deal! Buying now. Thanks for working with me.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(4),
    },
  ],
  t7: [
    {
      id: "m7-1",
      thread_id: "t7",
      direction: "inbound",
      sender_username: "gradedgems88",
      body: "The card arrived with a small dent in the top-loader. Can we work something out?",
      is_read: false,
      external_message_id: null,
      created_at: hoursAgo(12),
    },
  ],
  t8: [
    {
      id: "m8-1",
      thread_id: "t8",
      direction: "inbound",
      sender_username: "flipkingz",
      body: "I'd like to return this card. The grade on the label doesn't match what I expected from the photos.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(13),
    },
    {
      id: "m8-2",
      thread_id: "t8",
      direction: "outbound",
      sender_username: "seller",
      body: "I'm sorry about that. I've initiated a return — you'll get a prepaid label shortly. Full refund once the card is back.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(12),
    },
    {
      id: "m8-3",
      thread_id: "t8",
      direction: "inbound",
      sender_username: "flipkingz",
      body: "Refund received. Thanks for handling it.",
      is_read: true,
      external_message_id: null,
      created_at: daysAgo(10),
    },
  ],
};

// ─── Public API (swap these with real fetches later) ─────────────────────────

export function getMockStats(): MessagingStats {
  const threads = MOCK_THREADS;
  return {
    total_threads: threads.length,
    unread_count: threads.reduce((s, t) => s + t.unread_count, 0),
    needs_response: threads.filter((t) => t.status === "needs_response").length,
    open_offers: threads.filter((t) => t.category === "offer" && t.status !== "resolved" && t.status !== "archived").length,
    avg_response_time_hours: 2.4,
  };
}

export function getMockThreads(): MessageThread[] {
  return [...MOCK_THREADS].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

export function getMockThread(threadId: string): MessageThread | null {
  return MOCK_THREADS.find((t) => t.id === threadId) ?? null;
}

export function getMockMessages(threadId: string): Message[] {
  return MOCK_MESSAGES[threadId] ?? [];
}

export function computeNegotiationAnalysis(thread: MessageThread): NegotiationAnalysis | null {
  if (
    thread.offer_amount_cents == null ||
    thread.listing_price_cents == null ||
    thread.cost_basis_cents == null ||
    thread.fee_percent == null
  ) {
    return null;
  }

  const feeRate = thread.fee_percent / 100;
  const netAfterFees = Math.round(thread.offer_amount_cents * (1 - feeRate));
  const profit = netAfterFees - thread.cost_basis_cents;
  const marginPct = thread.offer_amount_cents > 0 ? (profit / thread.offer_amount_cents) * 100 : 0;

  // Decision logic
  let recommended_action: NegotiationAnalysis["recommended_action"];
  let suggested_counter_cents: number | null = null;
  let reasoning: string;

  if (profit <= 0) {
    recommended_action = "decline";
    reasoning = `This offer results in a loss of $${Math.abs(profit / 100).toFixed(2)} after fees. Declining is recommended unless you need to move this card quickly.`;
  } else if (marginPct < 10) {
    // Thin margin — counter higher
    const targetProfit = thread.cost_basis_cents * 0.25; // 25% ROI target
    const targetGross = Math.round((thread.cost_basis_cents + targetProfit) / (1 - feeRate));
    suggested_counter_cents = Math.min(targetGross, thread.listing_price_cents);
    recommended_action = "counter";
    reasoning = `Margin is thin at ${marginPct.toFixed(1)}%. Counter at $${(suggested_counter_cents / 100).toFixed(2)} to protect a reasonable return.`;
  } else if (marginPct < 20) {
    // OK margin — could counter or accept
    const midpoint = Math.round((thread.offer_amount_cents + thread.listing_price_cents) / 2);
    suggested_counter_cents = midpoint;
    recommended_action = "counter";
    reasoning = `Decent margin at ${marginPct.toFixed(1)}%, but you can likely get more. Try meeting in the middle at $${(midpoint / 100).toFixed(2)}.`;
  } else if (marginPct < 35) {
    recommended_action = "accept";
    reasoning = `Good margin at ${marginPct.toFixed(1)}% with $${(profit / 100).toFixed(2)} profit. This is a solid deal.`;
  } else {
    recommended_action = "accept";
    reasoning = `Strong margin at ${marginPct.toFixed(1)}%. Take the deal.`;
  }

  return {
    offer_amount_cents: thread.offer_amount_cents,
    listing_price_cents: thread.listing_price_cents,
    cost_basis_cents: thread.cost_basis_cents,
    fee_percent: thread.fee_percent,
    estimated_net_cents: netAfterFees,
    estimated_profit_cents: profit,
    recommended_action,
    suggested_counter_cents: suggested_counter_cents ?? thread.suggested_counter_cents,
    reasoning,
  };
}
