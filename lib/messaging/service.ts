/**
 * Messaging service — business logic layer.
 *
 * Currently backed by mock data. When eBay messaging API is integrated,
 * swap the data source in each function without changing the interface.
 *
 * Platform-specific logic (eBay, Whatnot, etc.) should live in
 * dedicated adapter files (e.g., lib/messaging/adapters/ebay.ts).
 */

import type {
  MessageThread,
  Message,
  MessagingStats,
  ThreadFilter,
  NegotiationAnalysis,
} from "./types";
import {
  getMockStats,
  getMockThreads,
  getMockThread,
  getMockMessages,
  computeNegotiationAnalysis,
} from "./mock-data";

// ─── Thread queries ──────────────────────────────────────────────────────────

export async function getMessagingStats(
  _userId: string
): Promise<MessagingStats> {
  return getMockStats();
}

export async function getThreads(
  _userId: string,
  filter: ThreadFilter = "all"
): Promise<MessageThread[]> {
  let threads = getMockThreads();

  switch (filter) {
    case "unread":
      threads = threads.filter((t) => t.unread_count > 0);
      break;
    case "needs_response":
      threads = threads.filter((t) => t.status === "needs_response");
      break;
    case "offers":
      threads = threads.filter((t) => t.category === "offer");
      break;
    case "resolved":
      threads = threads.filter((t) => t.status === "resolved");
      break;
    case "archived":
      threads = threads.filter((t) => t.status === "archived");
      break;
    // "all" — no filter
  }

  return threads;
}

export async function getThread(
  _userId: string,
  threadId: string
): Promise<MessageThread | null> {
  return getMockThread(threadId);
}

// ─── Message queries ─────────────────────────────────────────────────────────

export async function getMessages(
  _userId: string,
  threadId: string
): Promise<Message[]> {
  return getMockMessages(threadId);
}

// ─── Negotiation ─────────────────────────────────────────────────────────────

export async function getNegotiationAnalysis(
  _userId: string,
  threadId: string
): Promise<NegotiationAnalysis | null> {
  const thread = getMockThread(threadId);
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
    t.ai_suggested_reply ??
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
  _userId: string,
  threadId: string,
  tone: AIReplyTone
): Promise<string> {
  const thread = getMockThread(threadId);
  if (!thread) return "Unable to generate reply — thread not found.";
  return TONE_TEMPLATES[tone](thread);
}
