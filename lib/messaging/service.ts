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
  sendEbayMessage,
} from "./adapters/ebay";
import { computeNegotiationAnalysis } from "./mock-data";

// ─── Thread queries ──────────────────────────────────────────────────────────

export async function getMessagingStats(
  userId: string
): Promise<MessagingStats> {
  try {
    const threads = await getEbayThreads(userId);
    return buildStatsFromThreads(threads);
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

function buildStatsFromThreads(threads: MessageThread[]): MessagingStats {
  const unreadCount = threads.filter((t) => t.unread_count > 0).length;
  const needsResponse = threads.filter((t) => t.status === "needs_response").length;
  const openOffers = threads.filter((t) => t.category === "offer").length;
  return {
    total_threads: threads.length,
    unread_count: unreadCount,
    needs_response: needsResponse,
    open_offers: openOffers,
    avg_response_time_hours: null,
  };
}

export async function getMessagingOverview(
  userId: string,
  filter: ThreadFilter = "all"
): Promise<{ stats: MessagingStats; threads: MessageThread[] }> {
  try {
    const allThreads = await getEbayThreads(userId);
    const stats = buildStatsFromThreads(allThreads);
    const threads = applyThreadFilter(allThreads, filter);
    return { stats, threads };
  } catch {
    const stats = buildStatsFromThreads([]);
    return { stats, threads: [] };
  }
}

function applyThreadFilter(
  threads: MessageThread[],
  filter: ThreadFilter
): MessageThread[] {
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

export async function sendMessage(
  userId: string,
  threadId: string,
  body: string
): Promise<Message> {
  return sendEbayMessage(userId, threadId, body);
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

export function getNegotiationAnalysisForThread(
  thread: MessageThread | null
): NegotiationAnalysis | null {
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

const TONE_INSTRUCTIONS: Record<AIReplyTone, string> = {
  professional:
    "Write a professional, helpful reply that directly addresses the buyer's question or concern. Be clear and concise.",
  friendly:
    "Write a warm, enthusiastic reply that builds rapport. Be personable and upbeat while still being helpful.",
  firm:
    "Write a polite but firm reply that holds the listed price. Briefly justify the price (condition, market value) without being aggressive.",
  negotiate:
    "Write a reply that opens or continues a negotiation. If there's a suggested counter price, use it. Be flexible but protect your margin.",
  decline:
    "Write a polite decline. Acknowledge their interest, explain you can't meet their ask, and leave the door open.",
  accept:
    "Write a reply that accepts the deal and gives clear next steps for completing the purchase.",
  ask_details:
    "Write a reply that asks for more information needed to help them. Be specific about what you need.",
};

export type AIReplyResult = { text: string; source: "ai" | "fallback" };

export async function generateAIReply(
  userId: string,
  threadId: string,
  tone: AIReplyTone
): Promise<AIReplyResult> {
  const [thread, messages] = await Promise.all([
    getThread(userId, threadId),
    getMessages(userId, threadId),
  ]);
  if (!thread) return { text: "Unable to generate reply — thread not found.", source: "fallback" };

  // Check for API key before attempting
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[messaging] ANTHROPIC_API_KEY not set — using fallback template");
    return { text: buildFallback(tone, thread), source: "fallback" };
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();

    // Build conversation transcript (last 15 messages for context)
    const transcript = messages
      .slice(-15)
      .map((m) => `${m.direction === "outbound" ? "You (seller)" : `Buyer (${m.sender_username})`}: ${m.body}`)
      .join("\n\n");

    const priceContext = [
      thread.listing_price_cents && `Listed at $${(thread.listing_price_cents / 100).toFixed(2)}`,
      thread.offer_amount_cents && `Buyer offered $${(thread.offer_amount_cents / 100).toFixed(2)}`,
      thread.suggested_counter_cents && `Suggested counter: $${(thread.suggested_counter_cents / 100).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(" | ");

    // Find the last inbound (buyer) message to respond to specifically
    const lastBuyerMessage = [...messages]
      .reverse()
      .find((m) => m.direction === "inbound");

    const systemPrompt = `You are a professional sports card and collectibles seller on eBay. You're drafting a reply to a buyer on behalf of the seller.

Rules:
- Write ONLY the reply body — no subject line, no greeting like "Dear buyer", no sign-off
- Your reply MUST directly respond to the buyer's most recent message — do not write a generic intro
- If the buyer said "Just checking in" or is following up, acknowledge their follow-up and give them a status update or next step
- Keep it concise and natural (1-3 sentences unless more detail is clearly needed)
- NEVER repeat or echo back the item title verbatim in the reply`;

    const userPrompt = `${TONE_INSTRUCTIONS[tone]}

Item: ${thread.item_title ?? "this item"}
Buyer: ${thread.buyer_username}
${priceContext ? `Pricing context: ${priceContext}` : ""}
${thread.category === "complaint" ? "Situation: buyer has a complaint or issue with the item" : ""}
${thread.category === "shipping" ? "Situation: buyer has a shipping or delivery question/issue" : ""}
${thread.category === "return_refund" ? "Situation: buyer is requesting a return or refund" : ""}

${lastBuyerMessage ? `The buyer's most recent message (what you are replying to):\n"${lastBuyerMessage.body}"` : ""}

Full conversation history for context:
${transcript || "(No prior messages)"}

Write the reply now:`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    if (text) return { text, source: "ai" };
  } catch (err) {
    console.warn("[messaging] AI reply generation failed, falling back:", err);
  }

  return { text: buildFallback(tone, thread), source: "fallback" };
}

function buildFallback(tone: AIReplyTone, thread: Awaited<ReturnType<typeof getThread>>): string {
  if (!thread) return "Unable to generate reply.";
  const item = thread.item_title ?? "this item";
  const buyer = thread.buyer_display_name ?? thread.buyer_username;
  const fallbacks: Record<AIReplyTone, string> = {
    professional: `Thank you for your message about ${item}. I'll look into this and get back to you shortly.`,
    friendly: `Hey ${buyer}! Thanks for reaching out about ${item}. Happy to help!`,
    firm: thread.listing_price_cents
      ? `I appreciate the interest, but I'm firm at $${(thread.listing_price_cents / 100).toFixed(2)} on this one.`
      : `I appreciate the interest, but I'm holding firm on the listed price.`,
    negotiate: thread.suggested_counter_cents
      ? `Thanks for the offer. I can meet you at $${(thread.suggested_counter_cents / 100).toFixed(2)} — let me know if that works.`
      : `Thanks for the offer. I have some room to work with — what price were you thinking?`,
    decline: `I appreciate the offer, but I can't go that low on ${item}. I'm holding at the current price for now.`,
    accept: `You've got a deal! Go ahead and complete the purchase and I'll ship it right away. Thanks!`,
    ask_details: `Thanks for reaching out about ${item}. Could you give me a bit more detail so I can help you out?`,
  };
  return fallbacks[tone];
}
