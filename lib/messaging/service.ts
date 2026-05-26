/**
 * Messaging service — business logic layer.
 *
 * Fetches real eBay messages via the eBay adapter.
 * If the user has no connected eBay account, returns empty results.
 *
 * Platform-specific logic lives in lib/messaging/adapters/.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
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
import {
  getCardzcheckThreads,
  getCardzcheckThread,
  getCardzcheckMessages,
  sendCardzcheckMessage,
  isCardzcheckThreadId,
} from "./adapters/cardzcheck";
import type { MessagePlatform } from "./types";

export type PlatformFilter = MessagePlatform | "all";
import { computeNegotiationAnalysis } from "./mock-data";
import {
  buildFallbackMarketplaceReply,
  createMarketplaceReplyContext,
  formatCurrencyFromCents,
  parseMarketplaceOfferAmount,
  recommendMarketplaceReplyAction,
  type MarketplaceReplyAction,
  type MarketplaceReplyDraftResult,
} from "./reply-drafts";

type EbayListingLookupRow = {
  ebay_listing_id: string;
  inventory_source_id: string | null;
  listed_price_cents: number | null;
  title: string | null;
};

type InventoryLookupRow = {
  id: string;
  title: string | null;
  cost_basis_total_cents: number | null;
  list_price_cents: number | null;
  ebay_item_id?: string | null;
};

type ThreadListingContext = {
  inventoryItemId: string | null;
  listingPriceCents: number | null;
  costBasisCents: number | null;
  title: string | null;
};

const DEFAULT_EBAY_FEE_PERCENT = 13.25;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function roundCounterCents(value: number): number {
  return Math.max(0, Math.round(value / 500) * 500);
}

function deriveSuggestedCounter(
  offerAmountCents: number,
  listingPriceCents: number
): { suggestedAction: MessageThread["suggested_action"]; suggestedCounterCents: number | null } {
  const offerRatio = offerAmountCents / listingPriceCents;

  if (offerRatio >= 0.94) {
    return {
      suggestedAction: "hold_firm",
      suggestedCounterCents: listingPriceCents,
    };
  }

  if (offerRatio <= 0.65) {
    return {
      suggestedAction: "decline",
      suggestedCounterCents: null,
    };
  }

  const gap = listingPriceCents - offerAmountCents;
  const suggestedCounterCents = roundCounterCents(
    Math.min(listingPriceCents, offerAmountCents + gap * 0.6)
  );

  return {
    suggestedAction: "counter",
    suggestedCounterCents,
  };
}

function enrichThreadWithDerivedContext(
  thread: MessageThread,
  listingContext: ThreadListingContext | null,
  lastInboundOfferCents: number | null
): MessageThread {
  const offerAmountCents = thread.offer_amount_cents ?? lastInboundOfferCents;
  const listingPriceCents =
    thread.listing_price_cents ??
    listingContext?.listingPriceCents ??
    null;
  const costBasisCents =
    thread.cost_basis_cents ??
    listingContext?.costBasisCents ??
    null;
  const feePercent =
    thread.fee_percent ??
    (thread.platform === "ebay" && (listingPriceCents !== null || offerAmountCents !== null)
      ? DEFAULT_EBAY_FEE_PERCENT
      : null);

  let next: MessageThread = {
    ...thread,
    category: offerAmountCents !== null ? "offer" : thread.category,
    inventory_item_id: thread.inventory_item_id ?? listingContext?.inventoryItemId ?? null,
    item_title: thread.item_title ?? listingContext?.title ?? null,
    offer_amount_cents: offerAmountCents,
    listing_price_cents: listingPriceCents,
    cost_basis_cents: costBasisCents,
    fee_percent: feePercent,
  };

  const negotiation = computeNegotiationAnalysis(next);
  if (negotiation) {
    return {
      ...next,
      suggested_action: negotiation.recommended_action,
      estimated_net_cents: negotiation.estimated_net_cents,
      estimated_profit_cents: negotiation.estimated_profit_cents,
      suggested_counter_cents: negotiation.suggested_counter_cents,
    };
  }

  if (offerAmountCents !== null && listingPriceCents !== null) {
    const derived = deriveSuggestedCounter(offerAmountCents, listingPriceCents);
    next = {
      ...next,
      suggested_action: thread.suggested_action ?? derived.suggestedAction,
      suggested_counter_cents:
        thread.suggested_counter_cents ?? derived.suggestedCounterCents,
    };
  }

  return next;
}

async function loadThreadListingContextMap(
  userId: string,
  threads: MessageThread[]
): Promise<Map<string, ThreadListingContext>> {
  const listingIds = Array.from(
    new Set(
      threads
        .map((thread) => thread.listing_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (listingIds.length === 0) {
    return new Map();
  }

  try {
    const supabase = await createClient();
    const { data: listingRows, error: listingError } = await supabase
      .from("ebay_listings")
      .select("ebay_listing_id, inventory_source_id, listed_price_cents, title")
      .eq("user_id", userId)
      .in("ebay_listing_id", listingIds);

    if (listingError) {
      console.warn("[messaging] Failed to load ebay listing context:", listingError);
      return new Map();
    }

    const inventoryIds = Array.from(
      new Set(
        ((listingRows ?? []) as EbayListingLookupRow[])
          .map((row: EbayListingLookupRow) => row.inventory_source_id)
          .filter(
            (value: string | null): value is string =>
              typeof value === "string" && UUID_REGEX.test(value)
          )
      )
    );

    const inventoryById = new Map<string, InventoryLookupRow>();
    if (inventoryIds.length > 0) {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from("business_inventory_items")
        .select("id, title, cost_basis_total_cents, list_price_cents")
        .eq("user_id", userId)
        .in("id", inventoryIds);

      if (inventoryError) {
        console.warn("[messaging] Failed to load inventory pricing context:", inventoryError);
      } else {
        for (const row of (inventoryRows ?? []) as InventoryLookupRow[]) {
          inventoryById.set(row.id, row);
        }
      }
    }

    const missingListingIds = listingIds.filter(
      (listingId) =>
        !((listingRows ?? []) as EbayListingLookupRow[]).some(
          (row: EbayListingLookupRow) => row.ebay_listing_id === listingId
        )
    );

    const inventoryByListingId = new Map<string, InventoryLookupRow>();
    if (missingListingIds.length > 0) {
      const { data: inventoryRowsByListingId, error: inventoryByListingError } = await supabase
        .from("business_inventory_items")
        .select("id, title, cost_basis_total_cents, list_price_cents, ebay_item_id")
        .eq("user_id", userId)
        .in("ebay_item_id", missingListingIds);

      if (inventoryByListingError) {
        console.warn(
          "[messaging] Failed to load inventory context by eBay item id:",
          inventoryByListingError
        );
      } else {
        for (const row of (inventoryRowsByListingId ?? []) as InventoryLookupRow[]) {
          if (row.ebay_item_id) {
            inventoryByListingId.set(row.ebay_item_id, row);
          }
        }
      }
    }

    const lookup = new Map<string, ThreadListingContext>();

    for (const row of (listingRows ?? []) as EbayListingLookupRow[]) {
      const inventory = row.inventory_source_id
        ? inventoryById.get(row.inventory_source_id)
        : undefined;
      lookup.set(row.ebay_listing_id, {
        inventoryItemId: row.inventory_source_id ?? inventory?.id ?? null,
        listingPriceCents: inventory?.list_price_cents ?? row.listed_price_cents ?? null,
        costBasisCents: inventory?.cost_basis_total_cents ?? null,
        title: inventory?.title ?? row.title ?? null,
      });
    }

    for (const listingId of missingListingIds) {
      const inventory = inventoryByListingId.get(listingId);
      if (!inventory) continue;
      lookup.set(listingId, {
        inventoryItemId: inventory.id,
        listingPriceCents: inventory.list_price_cents ?? null,
        costBasisCents: inventory.cost_basis_total_cents ?? null,
        title: inventory.title ?? null,
      });
    }

    return lookup;
  } catch (error) {
    console.warn("[messaging] Pricing context enrichment failed:", error);
    return new Map();
  }
}

async function enrichThreads(
  userId: string,
  threads: MessageThread[]
): Promise<MessageThread[]> {
  if (threads.length === 0) return [];
  const listingContextById = await loadThreadListingContextMap(userId, threads);

  return threads.map((thread) => {
    const listingContext = thread.listing_id
      ? listingContextById.get(thread.listing_id) ?? null
      : null;
    const previewOfferCents = parseMarketplaceOfferAmount(thread.last_message_preview);
    return enrichThreadWithDerivedContext(thread, listingContext, previewOfferCents);
  });
}

// ─── Thread queries ──────────────────────────────────────────────────────────

async function loadThreadsForPlatform(
  userId: string,
  platform: PlatformFilter
): Promise<MessageThread[]> {
  if (platform === "ebay") return await getEbayThreads(userId);
  if (platform === "cardzcheck") return await getCardzcheckThreads(userId);
  // "all" or any unknown — fan out to both
  const [ebay, cc] = await Promise.all([
    getEbayThreads(userId).catch(() => []),
    getCardzcheckThreads(userId).catch(() => []),
  ]);
  return [...ebay, ...cc];
}

export async function getMessagingStats(
  userId: string,
  platform: PlatformFilter = "all"
): Promise<MessagingStats> {
  try {
    const threads = await enrichThreads(
      userId,
      await loadThreadsForPlatform(userId, platform)
    );
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
  filter: ThreadFilter = "all",
  platform: PlatformFilter = "all"
): Promise<MessageThread[]> {
  try {
    const threads = await enrichThreads(
      userId,
      await loadThreadsForPlatform(userId, platform)
    );
    return applyThreadFilter(threads, filter);
  } catch {
    return [];
  }
}

export async function getMessagingOverview(
  userId: string,
  filter: ThreadFilter = "all",
  platform: PlatformFilter = "all"
): Promise<{ stats: MessagingStats; threads: MessageThread[] }> {
  try {
    const allThreads = await enrichThreads(
      userId,
      await loadThreadsForPlatform(userId, platform)
    );
    const stats = buildStatsFromThreads(allThreads);
    const threads = applyThreadFilter(allThreads, filter);
    return { stats, threads };
  } catch {
    const stats = buildStatsFromThreads([]);
    return { stats, threads: [] };
  }
}

async function loadBaseThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  if (isCardzcheckThreadId(threadId)) {
    return await getCardzcheckThread(userId, threadId);
  }
  return await getEbayThread(userId, threadId);
}

export async function getThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  try {
    const thread = await loadBaseThread(userId, threadId);
    if (!thread) return null;

    const listingContextById = await loadThreadListingContextMap(userId, [thread]);
    const listingContext = thread.listing_id
      ? listingContextById.get(thread.listing_id) ?? null
      : null;
    return enrichThreadWithDerivedContext(thread, listingContext, null);
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
    if (isCardzcheckThreadId(threadId)) {
      return await getCardzcheckMessages(userId, threadId);
    }
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
  if (isCardzcheckThreadId(threadId)) {
    return sendCardzcheckMessage(userId, threadId, body);
  }
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

const ACTION_INSTRUCTIONS: Record<MarketplaceReplyAction, string> = {
  smart_reply:
    "Write the best next reply for this thread. If the recommendation clearly suggests a move, lean into it naturally.",
  counteroffer:
    "Write a clean counteroffer. Use the suggested counter if one is provided. Lead with the number and keep the door open.",
  hold_firm:
    "Write a short, confident message that holds the current price without sounding stiff or defensive.",
  decline:
    "Write a polite decline. Keep it brief, avoid overexplaining, and leave room for the buyer to come back stronger if appropriate.",
  accept_close:
    "Write a reply that accepts the deal and moves the buyer toward immediate payment or checkout.",
  ask_payment:
    "Write a direct nudge that asks the buyer to send payment now and locks the deal in.",
  ask_time:
    "Write a reply that asks for a little more time. Keep it confident and give a clear expectation if possible.",
  reengage:
    "Write a short follow-up to wake up a stale buyer and give them a clear path to close now.",
  clarify:
    "Write a precise reply that clears up condition, shipping, or price questions without sounding like customer support.",
};

export async function generateAIReply(
  userId: string,
  threadId: string,
  action: MarketplaceReplyAction,
  sellerNote?: string
): Promise<MarketplaceReplyDraftResult> {
  const messages = await getMessages(userId, threadId);
  const baseThread = await loadBaseThread(userId, threadId);

  if (!baseThread) {
    return {
      reply: "Unable to generate a draft right now.",
      source: "fallback",
      action,
      stage: "new_inquiry",
      recommendation: {
        action: "smart_reply",
        headline: "Best move: send a clean reply",
        reason: "Thread context could not be loaded.",
      },
    };
  }

  const listingContextById = await loadThreadListingContextMap(userId, [baseThread]);
  const listingContext = baseThread.listing_id
    ? listingContextById.get(baseThread.listing_id) ?? null
    : null;
  const lastInboundOfferCents = parseMarketplaceOfferAmount(
    [...messages]
      .reverse()
      .find((message) => message.direction === "inbound")?.body ??
      baseThread.last_message_preview
  );
  const thread = enrichThreadWithDerivedContext(
    baseThread,
    listingContext,
    lastInboundOfferCents
  );
  const negotiation = getNegotiationAnalysisForThread(thread);
  const context = createMarketplaceReplyContext({
    thread,
    messages,
    negotiation,
  });
  const recommendation = recommendMarketplaceReplyAction(context);

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      reply: buildFallbackMarketplaceReply({ context, action, sellerNote }),
      source: "fallback",
      action,
      stage: context.stage,
      recommendation,
    };
  }

  try {
    const client = new Anthropic();
    const transcript = messages
      .slice(-15)
      .map((message) =>
        `${message.direction === "outbound" ? "Seller" : `Buyer (${message.sender_username})`}: ${message.body}`
      )
      .join("\n\n");

    const priceContext = [
      context.deal.askingPriceCents !== null
        ? `Ask: ${formatCurrencyFromCents(context.deal.askingPriceCents)}`
        : null,
      context.deal.latestOfferCents !== null
        ? `Latest buyer offer: ${formatCurrencyFromCents(context.deal.latestOfferCents)}`
        : null,
      context.deal.suggestedCounterCents !== null
        ? `Suggested counter: ${formatCurrencyFromCents(context.deal.suggestedCounterCents)}`
        : null,
      context.deal.estimatedProfitCents !== null
        ? `Estimated profit after fees: ${formatCurrencyFromCents(context.deal.estimatedProfitCents)}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const systemPrompt = `You draft seller messages for a premium sports card marketplace inbox.

The seller reviews and sends every message. You are not pretending to be an AI agent, support rep, or assistant.

Rules:
- Output only the message draft. No bullets, no labels, no subject line, no sign-off.
- Sound like a real seller in a marketplace thread.
- Be concise. Usually 1-3 short sentences, under 65 words unless the issue genuinely needs more detail.
- Lead with the decision when negotiating (counter, hold firm, decline, accept).
- Use direct numbers when pricing context is available.
- Avoid corporate or support phrasing like "Thank you for your interest", "Based on market trends", "Please feel free", or "I apologize for any inconvenience".
- Avoid obvious AI rhythm, fake urgency, or excessive punctuation.
- Never mention AI, automation, internal policy, margin, fees, cost basis, or hidden reasoning.
- Do not invent facts that are not in the context.
- If the seller note gives a concrete shipping, timing, or pricing detail, work it in naturally.`;

    const userPrompt = `${ACTION_INSTRUCTIONS[action]}

Thread stage: ${context.stage}
Recommended move: ${recommendation.headline}
Why: ${recommendation.reason}
Marketplace: ${thread.platform}
Listing: ${thread.item_title ?? "Unknown item"}
Buyer: ${thread.buyer_display_name ?? thread.buyer_username}
Thread status: ${thread.status}
Thread category: ${thread.category}
${priceContext ? `Pricing context: ${priceContext}` : ""}
${context.latestBuyerMessage ? `Latest buyer message: "${context.latestBuyerMessage.body}"` : ""}
${sellerNote ? `Seller note to include if it fits: "${sellerNote.trim()}"` : ""}

Conversation history:
${transcript || "(No prior messages)"}

Write the message draft now.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .join("\n")
      .trim();

    if (text) {
      return {
        reply: text,
        source: "ai",
        action,
        stage: context.stage,
        recommendation,
      };
    }
  } catch (err) {
    console.warn("[messaging] AI reply generation failed, falling back:", err);
  }

  return {
    reply: buildFallbackMarketplaceReply({ context, action, sellerNote }),
    source: "fallback",
    action,
    stage: context.stage,
    recommendation,
  };
}
