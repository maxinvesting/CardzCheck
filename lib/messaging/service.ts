/**
 * Messaging service — business logic layer.
 *
 * Fetches real eBay messages via the eBay adapter.
 * If the user has no connected eBay account, returns empty results.
 *
 * Platform-specific logic lives in lib/messaging/adapters/.
 */

import type {
  MessageThread,
  Message,
  MessagingStats,
  ThreadFilter,
  NegotiationAnalysis,
} from "./types";
import {
  getEbayThreads,
  getEbayThread,
  getEbayMessages,
  getEbayMessagingStats,
} from "./adapters/ebay";
import { computeNegotiationAnalysis } from "./mock-data";

// ─── Thread queries ──────────────────────────────────────────────────────────

export async function getMessagingStats(
  userId: string
): Promise<MessagingStats> {
  try {
    return await getEbayMessagingStats(userId);
  } catch {
    return {
      total_threads: 0,
      unread_count: 0,
      needs_response: 0,
      open_offers: 0,
      avg_response_time_hours: null,
    };
  }
}

export async function getThreads(
  userId: string,
  filter: ThreadFilter = "all"
): Promise<MessageThread[]> {
  let threads: MessageThread[];
  try {
    threads = await getEbayThreads(userId);
  } catch {
    threads = [];
  }

  switch (filter) {
    case "unread":
      return threads.filter((t) => t.unread_count > 0);
    case "needs_response":
      return threads.filter((t) => t.status === "needs_response");
    case "offers":
      return threads.filter((t) => t.category === "offer");
    case "resolved":
      return threads.filter((t) => t.status === "resolved");
    case "archived":
      return threads.filter((t) => t.status === "archived");
    default:
      return threads;
  }
}

export async function getThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  try {
    return await getEbayThread(userId, threadId);
  } catch {
    return null;
  }
}

// ─── Message queries ─────────────────────────────────────────────────────────

export async function getMessages(
  userId: string,
  threadId: string
): Promise<Message[]> {
  try {
    return await getEbayMessages(userId, threadId);
  } catch {
    return [];
  }
}

// ─── Negotiation ─────────────────────────────────────────────────────────────

export async function getNegotiationAnalysis(
  userId: string,
  threadId: string
): Promise<NegotiationAnalysis | null> {
  const thread = await getThread(userId, threadId);
  if (!thread) return null;
  return computeNegotiationAnalysis(thread);
}

// ─── AI reply generation ─────────────────────────────────────────────────────

export type AIReplyTone =
  | "professional"
  | "friendly"
  | "firm"
  | "negotiate"
  | "decline"
  | "accept"
  | "ask_details";

const TONE_TEMPLATES: Record<AIReplyTone, (thread: MessageThread) => string> = {
  professional: (t) =>
    `Thank you for your message regarding ${t.item_title ?? "this item"}. I'll look into this and get back to you shortly.`,
  friendly: (t) =>
    `Hey ${t.buyer_display_name ?? t.buyer_username}! Thanks for reaching out about ${t.item_title ?? "this item"}. Happy to help — let me know what you need!`,
  firm: (t) =>
    t.listing_price_cents
      ? `I appreciate the interest, but I'm firm at $${(t.listing_price_cents / 100).toFixed(2)} on this one. The price reflects current market value and the card's condition.`
      : `I appreciate the interest, but I'm holding firm on the listed price. It reflects current market value.`,
  negotiate: (t) => {
    if (t.suggested_counter_cents) {
      return `Thanks for the offer. I can meet you at $${(t.suggested_counter_cents / 100).toFixed(2)} — that's the best I can do on this one. Let me know if that works.`;
    }
    return `Thanks for the offer. I have some room to negotiate — what price works for you?`;
  },
  decline: (t) =>
    `I appreciate the offer on ${t.item_title ?? "this item"}, but I can't go that low. I'm going to hold at the current price for now. Thanks for understanding!`,
  accept: (t) =>
    `You've got a deal! Go ahead and purchase at the agreed price, and I'll ship it out right away. Thanks, ${t.buyer_display_name ?? t.buyer_username}!`,
  ask_details: (t) =>
    `Thanks for reaching out about ${t.item_title ?? "this item"}. Could you give me a bit more detail on what you're looking for? Happy to help!`,
};

export async function generateAIReply(
  userId: string,
  threadId: string,
  tone: AIReplyTone
): Promise<string> {
  const thread = await getThread(userId, threadId);
  if (!thread) return "Unable to generate reply — thread not found.";
  return TONE_TEMPLATES[tone](thread);
}
