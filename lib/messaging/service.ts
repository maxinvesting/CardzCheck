/**
 * Messaging service — business logic layer.
 *
 * Tries real eBay data first via the Trading API adapter.
 * Falls back to mock data when eBay is not connected (demo mode).
 *
 * Platform-specific logic lives in dedicated adapter files.
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
import {
  hasEbayMessagingAccess,
  fetchEbayMessages,
  ebayMessagesToThreads,
  ebayMessagesToMessages,
  sendEbayReply,
} from "./adapters/ebay";

// ─── Internal: check eBay connection ─────────────────────────────────────────

async function getEbayConnection(userId: string) {
  try {
    return await hasEbayMessagingAccess(userId);
  } catch {
    return { connected: false, username: null };
  }
}

// ─── Thread queries ──────────────────────────────────────────────────────────

export async function getMessagingStats(
  userId: string
): Promise<MessagingStats & { isDemo: boolean }> {
  const ebay = await getEbayConnection(userId);

  if (ebay.connected) {
    const result = await fetchEbayMessages(userId);
    if (result) {
      const threads = ebayMessagesToThreads(userId, result.messages);
      return {
        total_threads: threads.length,
        unread_count: threads.reduce((s, t) => s + t.unread_count, 0),
        needs_response: threads.filter((t) => t.status === "needs_response").length,
        open_offers: threads.filter(
          (t) => t.category === "offer" && t.status !== "resolved" && t.status !== "archived"
        ).length,
        avg_response_time_hours: null,
        isDemo: false,
      };
    }
  }

  return { ...getMockStats(), isDemo: true };
}

export async function getThreads(
  userId: string,
  filter: ThreadFilter = "all"
): Promise<{ threads: MessageThread[]; isDemo: boolean }> {
  const ebay = await getEbayConnection(userId);

  if (ebay.connected) {
    const result = await fetchEbayMessages(userId);
    if (result) {
      let threads = ebayMessagesToThreads(userId, result.messages);
      threads = applyFilter(threads, filter);
      return { threads, isDemo: false };
    }
  }

  let threads = getMockThreads();
  threads = applyFilter(threads, filter);
  return { threads, isDemo: true };
}

export async function getThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  const ebay = await getEbayConnection(userId);

  if (ebay.connected) {
    const result = await fetchEbayMessages(userId);
    if (result) {
      const threads = ebayMessagesToThreads(userId, result.messages);
      return threads.find((t) => t.id === threadId) ?? null;
    }
  }

  return getMockThread(threadId);
}

// ─── Message queries ─────────────────────────────────────────────────────────

export async function getMessages(
  userId: string,
  threadId: string
): Promise<Message[]> {
  const ebay = await getEbayConnection(userId);

  if (ebay.connected && ebay.username) {
    const result = await fetchEbayMessages(userId);
    if (result) {
      // Find all messages that belong to this thread's sender+item combo
      const threads = ebayMessagesToThreads(userId, result.messages);
      const thread = threads.find((t) => t.id === threadId);
      if (thread) {
        const threadMsgs = result.messages.filter((m) => {
          const key = `${m.senderId}::${m.itemId ?? "general"}`;
          return `ebay-${key.replace(/::/g, "-")}` === threadId;
        });
        return ebayMessagesToMessages(threadId, ebay.username, threadMsgs);
      }
    }
  }

  return getMockMessages(threadId);
}

// ─── Send reply ──────────────────────────────────────────────────────────────

export async function sendReply(
  userId: string,
  threadId: string,
  body: string
): Promise<{ success: boolean; error?: string; isDemo: boolean }> {
  const ebay = await getEbayConnection(userId);

  if (ebay.connected) {
    // Look up thread to get recipient and item ID
    const thread = await getThread(userId, threadId);
    if (!thread) return { success: false, error: "Thread not found", isDemo: false };
    if (!thread.listing_id) {
      return { success: false, error: "No item ID linked to this thread", isDemo: false };
    }

    const result = await sendEbayReply(
      userId,
      thread.buyer_username,
      thread.listing_id,
      body,
      thread.external_thread_id ?? undefined
    );

    return { ...result, isDemo: false };
  }

  // Demo mode — just acknowledge
  return { success: true, isDemo: true };
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
  userId: string,
  threadId: string,
  tone: AIReplyTone
): Promise<string> {
  const thread = await getThread(userId, threadId);
  if (!thread) return "Unable to generate reply — thread not found.";
  return TONE_TEMPLATES[tone](thread);
}

// ─── Filter helper ───────────────────────────────────────────────────────────

function applyFilter(threads: MessageThread[], filter: ThreadFilter): MessageThread[] {
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
