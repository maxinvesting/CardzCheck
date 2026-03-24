/**
 * eBay messaging adapter — fetches real buyer messages via eBay APIs.
 *
 * Uses two eBay APIs:
 * 1. Post Order API (/post-order/v2/inquiry) — post-sale buyer cases
 * 2. Trading API GetMemberMessages — pre-sale buyer questions (requires api_scope)
 *
 * Falls back gracefully if a scope is not granted on the current token.
 */

import { ebayFetch } from "@/lib/ebay/selling/client";
import type {
  MessageThread,
  Message,
  MessagingStats,
  MessageCategory,
  ThreadStatus,
} from "../types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const THREADS_TTL_MS = 30_000;
const MEMBER_EXCHANGES_TTL_MS = 20_000;
const memberExchangeCache = new Map<string, CacheEntry<ParsedMemberMessage[]>>();
const threadCache = new Map<string, CacheEntry<MessageThread[]>>();

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function invalidateUserMessagingCaches(userId: string) {
  memberExchangeCache.delete(userId);
  threadCache.delete(userId);
}

// ─── Post Order API types ─────────────────────────────────────────────────────

interface EbayInquiry {
  inquiryId: string;
  createDate: string;
  modifyDate: string;
  inquiryStatus: string; // OPEN, CS_CLOSED, etc.
  inquiryType: string;   // ITEM_NOT_RECEIVED, ITEM_NOT_AS_DESCRIBED, etc.
  buyerId: string;
  sellerId: string;
  itemId?: string;
  orderId?: string;
  itemTitle?: string;
  lastMessageText?: string;
  unreadMessageCount?: number;
}

interface EbayInquiryListResponse {
  inquiries?: EbayInquiry[];
  total?: number;
}

interface EbayInquiryMessage {
  sender: string;
  message: string;
  createDate: string;
  isRead?: boolean;
}

interface EbayInquiryMessageResponse {
  messages?: EbayInquiryMessage[];
}

// ─── Trading API types (GetMemberMessages) ────────────────────────────────────

interface EbayMemberMessage {
  MessageID: string;
  Sender: string;
  Subject?: string;
  Body: string;
  CreationDate: string;
  IsRead?: string;
  ItemID?: string;
  ItemTitle?: string;
}

interface EbayMemberMessagesResponse {
  MemberMessage?: {
    MemberMessageExchange?: Array<{
      Question?: EbayMemberMessage;
      Response?: EbayMemberMessage[];
      MessageStatus?: string;
      CreationDate?: string;
    }>;
  };
  Ack?: string;
}

interface ParsedMemberMessage {
  messageId: string;
  sender: string;
  body: string;
  creationDate: string;
  itemId: string | null;
  itemTitle: string | null;
  subject: string | null;
  isRead: boolean;
  status: string;
  responses: Array<{
    messageId: string;
    senderUsername: string;
    body: string;
    creationDate: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inquiryStatusToThreadStatus(status: string): ThreadStatus {
  switch (status) {
    case "OPEN":
    case "SELLER_RESPONDED":
      return "needs_response";
    case "AWAITING_SELLER_RESPONSE":
      return "needs_response";
    case "AWAITING_BUYER_RESPONSE":
      return "awaiting_buyer";
    case "CS_CLOSED":
    case "CLOSED":
      return "resolved";
    default:
      return "open";
  }
}

function inquiryTypeToCategory(type: string): MessageCategory {
  switch (type) {
    case "ITEM_NOT_RECEIVED":
      return "shipping";
    case "ITEM_NOT_AS_DESCRIBED":
      return "complaint";
    case "RETURN_REQUESTED":
      return "return_refund";
    default:
      return "question";
  }
}

function mapInquiryToThread(
  inquiry: EbayInquiry,
  userId: string
): MessageThread {
  const now = new Date().toISOString();
  return {
    id: `ebay-inquiry-${inquiry.inquiryId}`,
    user_id: userId,
    platform: "ebay",
    external_thread_id: inquiry.inquiryId,
    buyer_username: inquiry.buyerId,
    buyer_display_name: inquiry.buyerId,
    business_customer_id: null,
    listing_id: inquiry.itemId ?? null,
    inventory_item_id: null,
    item_title: inquiry.itemTitle ?? null,
    item_image_url: null,
    status: inquiryStatusToThreadStatus(inquiry.inquiryStatus),
    category: inquiryTypeToCategory(inquiry.inquiryType),
    unread_count: inquiry.unreadMessageCount ?? 0,
    last_message_at: inquiry.modifyDate,
    last_message_preview: inquiry.lastMessageText ?? null,
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: null,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: inquiry.createDate,
    updated_at: inquiry.modifyDate ?? now,
  };
}

function slugPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeSubject(subject: string | null): string | null {
  if (!subject) return null;
  const normalized = subject
    .toLowerCase()
    .replace(/^(re|fw|fwd)\s*:\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function memberThreadBaseId(
  sender: string,
  itemId: string | null,
  subject: string | null
): string {
  const senderKey = slugPart(sender || "unknown-buyer");
  if (itemId) {
    const itemKey = slugPart(itemId);
    return `ebay-msg-thread-${senderKey}-${itemKey}`;
  }
  const subjectKey = slugPart(normalizeSubject(subject) || "no-subject");
  return `ebay-msg-thread-${senderKey}-subject-${subjectKey}`;
}

function dayStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}${m}${day}`;
}

const MEMBER_THREAD_SPLIT_MS = 14 * 24 * 60 * 60 * 1000;

function buildMemberThreadBuckets(exchanges: ParsedMemberMessage[]) {
  const groupedByBase = new Map<string, ParsedMemberMessage[]>();
  for (const exchange of exchanges) {
    const base = memberThreadBaseId(exchange.sender, exchange.itemId, exchange.subject);
    const arr = groupedByBase.get(base) ?? [];
    arr.push(exchange);
    groupedByBase.set(base, arr);
  }

  const buckets = new Map<string, ParsedMemberMessage[]>();
  for (const [base, entries] of groupedByBase.entries()) {
    const sorted = [...entries].sort(
      (a, b) =>
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
    );
    let chunkIndex = 0;
    let chunk: ParsedMemberMessage[] = [];

    for (const message of sorted) {
      if (chunk.length === 0) {
        chunk = [message];
        continue;
      }
      const prev = chunk[chunk.length - 1];
      const gapMs =
        new Date(message.creationDate).getTime() -
        new Date(prev.creationDate).getTime();
      if (gapMs > MEMBER_THREAD_SPLIT_MS) {
        const first = chunk[0];
        buckets.set(`${base}-${dayStamp(first.creationDate)}-${chunkIndex}`, chunk);
        chunkIndex += 1;
        chunk = [message];
      } else {
        chunk.push(message);
      }
    }
    if (chunk.length > 0) {
      const first = chunk[0];
      buckets.set(`${base}-${dayStamp(first.creationDate)}-${chunkIndex}`, chunk);
    }
  }
  return buckets;
}

// ─── Post Order API calls ─────────────────────────────────────────────────────

async function fetchPostOrderInquiries(
  userId: string
): Promise<MessageThread[]> {
  const statuses = ["OPEN", "AWAITING_SELLER_RESPONSE", "CLOSED", "CS_CLOSED"];
  const merged = new Map<string, MessageThread>();

  for (const status of statuses) {
  try {
    const res = await ebayFetch(
      userId,
        `/post-order/v2/inquiry?status=${encodeURIComponent(status)}&limit=50`,
      { headers: { "X-EBAY-C-ENDUSERCTX": `userId=${userId}` } }
    );

    if (res.status === 403 || res.status === 401) {
      // Scope not granted — silently return empty
      console.info("[ebay/messaging] Post Order scope not granted, skipping inquiries");
      return [];
    }
      if (!res.ok) continue;

    const data = (await res.json()) as EbayInquiryListResponse;
      for (const inquiry of data.inquiries ?? []) {
        const mapped = mapInquiryToThread(inquiry, userId);
        merged.set(mapped.id, mapped);
      }
    } catch {
      continue;
    }
  }

  return Array.from(merged.values());
}

async function fetchInquiryMessages(
  userId: string,
  inquiryId: string
): Promise<Message[]> {
  try {
    const [res, sellerUsername] = await Promise.all([
      ebayFetch(userId, `/post-order/v2/inquiry/${inquiryId}/message`),
      getSellerEbayUsername(userId),
    ]);
    if (!res.ok) return [];

    const data = (await res.json()) as EbayInquiryMessageResponse;
    return (data.messages ?? []).map((m, i) => ({
      id: `${inquiryId}-msg-${i}`,
      thread_id: `ebay-inquiry-${inquiryId}`,
      direction: (sellerUsername && m.sender === sellerUsername) ? "outbound" : "inbound",
      sender_username: m.sender,
      body: m.message,
      is_read: m.isRead ?? false,
      external_message_id: null,
      created_at: m.createDate,
    }));
  } catch {
    return [];
  }
}

// ─── Trading API: GetMemberMessages ──────────────────────────────────────────

async function fetchMemberMessageExchanges(
  userId: string
): Promise<ParsedMemberMessage[]> {
  const cached = getCachedValue(memberExchangeCache, userId);
  if (cached) return cached;

  try {
    const token = await getValidTokenForUser(userId);
    if (!token) return [];

    const exchanges: ParsedMemberMessage[] = [];
    const pageSize = 50;
    const maxPages = 4;
    const startCreation = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const endCreation = new Date().toISOString();

    for (let page = 1; page <= maxPages; page++) {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <MailMessageType>All</MailMessageType>
  <StartCreationTime>${startCreation}</StartCreationTime>
  <EndCreationTime>${endCreation}</EndCreationTime>
  <Pagination>
    <EntriesPerPage>${pageSize}</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetMemberMessagesRequest>`;

      const res = await fetch("https://api.ebay.com/ws/api.dll", {
        method: "POST",
        headers: {
          "X-EBAY-API-SITEID": "0",
          "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
          "X-EBAY-API-CALL-NAME": "GetMemberMessages",
          "Content-Type": "text/xml",
        },
        body: xml,
      });

      if (!res.ok) break;

      // Parse XML response minimally — extract key fields
      const text = await res.text();

      // Check for Failure ack
      if (text.includes("<Ack>Failure</Ack>")) {
        console.info("[ebay/messaging] GetMemberMessages failed (scope likely not granted)");
        return [];
      }

      // Log first 1200 chars of first page for debugging
      if (page === 1) {
        console.log("[ebay/debug] GetMemberMessages raw (first 1200):", text.slice(0, 1200));
      }

      // Extract exchanges using simple regex (avoids XML parser dependency)
      // Note: use [^>]* to handle optional XML attributes on any tag
      const pageMessages: ParsedMemberMessage[] = [];
      const exchangeRegex = /<MemberMessageExchange[^>]*>([\s\S]*?)<\/MemberMessageExchange>/g;
      let match;

      while ((match = exchangeRegex.exec(text)) !== null) {
        const block = match[1];
        const getFrom = (src: string, tag: string) => {
          const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(src);
          return m?.[1]?.trim() ?? "";
        };
        const decodeBody = (s: string) =>
          s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

        // Prefer Question sub-block for buyer fields; fall back to block root
        const questionBlock = /<Question[^>]*>([\s\S]*?)<\/Question>/.exec(block)?.[1] ?? block;

        const msgId = getFrom(questionBlock, "MessageID") || getFrom(block, "MessageID");
        if (!msgId) continue;

        const creationDate = getFrom(questionBlock, "CreationDate") || getFrom(block, "CreationDate");
        const sender = getFrom(questionBlock, "SenderID") || getFrom(questionBlock, "Sender") || getFrom(block, "SenderID");
        const body = decodeBody(getFrom(questionBlock, "Body") || getFrom(block, "Body"));
        const itemId = getFrom(questionBlock, "ItemID") || getFrom(block, "ItemID");
        const subject = getFrom(questionBlock, "Subject") || getFrom(block, "Subject") || null;
        const itemTitle = subject;
        const isRead = getFrom(questionBlock, "Read") === "true";
        const status = getFrom(block, "MessageStatus");

        // Extract seller Response sub-blocks (handle optional attributes on <Response>)
        const responses: ParsedMemberMessage["responses"] = [];
        const responseRegex = /<Response[^>]*>([\s\S]*?)<\/Response>/g;
        let respMatch;
        while ((respMatch = responseRegex.exec(block)) !== null) {
          const rBlock = respMatch[1];
          const rMsgId = getFrom(rBlock, "MessageID");
          const rSender = getFrom(rBlock, "SenderID") || getFrom(rBlock, "Sender");
          const rBody = decodeBody(getFrom(rBlock, "Body"));
          const rDate = getFrom(rBlock, "CreationDate");
          if (rBody) {
            responses.push({
              messageId: rMsgId || `${msgId}-resp-${responses.length}`,
              senderUsername: rSender,
              body: rBody,
              creationDate: rDate || creationDate,
            });
          }
        }

        console.log(`[ebay/debug] exchange msgId=${msgId} sender=${sender} status=${status} responses=${responses.length}`);

        pageMessages.push({
          messageId: msgId,
          sender,
          body,
          creationDate,
          itemId: itemId || null,
          itemTitle,
          subject,
          isRead,
          status,
          responses,
        });
      }

      exchanges.push(...pageMessages);
      if (pageMessages.length < pageSize) break;
    }

    return setCachedValue(
      memberExchangeCache,
      userId,
      exchanges,
      MEMBER_EXCHANGES_TTL_MS
    );
  } catch (err) {
    console.warn("[ebay/messaging] GetMemberMessages error:", err);
    return [];
  }
}

async function fetchMemberMessages(userId: string): Promise<MessageThread[]> {
  const exchanges = await fetchMemberMessageExchanges(userId);
  const buckets = buildMemberThreadBuckets(exchanges);
  return Array.from(buckets.entries()).map(([threadId, items]) => {
    items.sort(
      (a, b) =>
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
    );
    const latest = items[items.length - 1];
    const unreadCount = items.filter((item) => !item.isRead).length;
    const hasUnanswered = items.some((item) => item.status === "Unanswered");

    return {
      id: threadId,
      user_id: userId,
      platform: "ebay",
      external_thread_id: latest.messageId,
      buyer_username: latest.sender,
      buyer_display_name: latest.sender,
      business_customer_id: null,
      listing_id: latest.itemId,
      inventory_item_id: null,
      item_title: latest.itemTitle,
      item_image_url: null,
      status: hasUnanswered ? "needs_response" : "awaiting_buyer",
      category: "question",
      unread_count: unreadCount,
      last_message_at: latest.creationDate,
      last_message_preview: latest.body.slice(0, 120) || null,
      ai_suggested_reply: null,
      suggested_action: null,
      offer_amount_cents: null,
      listing_price_cents: null,
      cost_basis_cents: null,
      fee_percent: null,
      estimated_net_cents: null,
      estimated_profit_cents: null,
      suggested_counter_cents: null,
      created_at: items[0].creationDate,
      updated_at: latest.creationDate,
    } satisfies MessageThread;
  });
}

// ─── Supabase outbound message persistence ────────────────────────────────────
// eBay's API does not return seller-sent messages, so we store them ourselves.

async function saveOutboundMessage(
  userId: string,
  threadId: string,
  body: string,
  sellerUsername: string
): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.from("cs_outbound_messages").insert({
      user_id: userId,
      ebay_thread_id: threadId,
      sender_username: sellerUsername,
      body,
    });
  } catch (err) {
    // Non-fatal — message still sent to eBay, just won't persist locally
    console.warn("[ebay/messaging] Failed to save outbound message:", err);
  }
}

async function loadOutboundMessages(
  userId: string,
  threadId: string
): Promise<Message[]> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("cs_outbound_messages")
      .select("id, sender_username, body, created_at")
      .eq("user_id", userId)
      .eq("ebay_thread_id", threadId)
      .order("created_at", { ascending: true });

    return (data ?? []).map((row: { id: string; sender_username: string; body: string; created_at: string }) => ({
      id: `cs-out-${row.id}`,
      thread_id: threadId,
      direction: "outbound" as const,
      sender_username: row.sender_username,
      body: row.body,
      is_read: true,
      external_message_id: null,
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}

// Helper: get seller's eBay username for direction detection
async function getSellerEbayUsername(userId: string): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("ebay_accounts")
      .select("ebay_username")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return data?.ebay_username ?? null;
  } catch {
    return null;
  }
}

// Helper: get raw access token for Trading API
async function getValidTokenForUser(userId: string): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("ebay_accounts")
      .select("access_token, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Returns true if the user has an active eBay account connected */
export async function isEbayConnected(userId: string): Promise<boolean> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("ebay_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// ─── Public adapter API ───────────────────────────────────────────────────────

export async function getEbayThreads(userId: string): Promise<MessageThread[]> {
  const cached = getCachedValue(threadCache, userId);
  if (cached) return cached;

  // Fetch from both APIs in parallel; combine results
  const [inquiries, memberMessages] = await Promise.all([
    fetchPostOrderInquiries(userId),
    fetchMemberMessages(userId),
  ]);

  // Deduplicate by id, sort newest first
  const all = [...memberMessages, ...inquiries];
  const sorted = all.sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
  return setCachedValue(threadCache, userId, sorted, THREADS_TTL_MS);
}

export async function getEbayThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  const threads = await getEbayThreads(userId);
  return threads.find((t) => t.id === threadId) ?? null;
}

export async function getEbayMessages(
  userId: string,
  threadId: string
): Promise<Message[]> {
  // Post Order inquiry messages
  if (threadId.startsWith("ebay-inquiry-")) {
    const inquiryId = threadId.replace("ebay-inquiry-", "");
    const [ebayMessages, savedOutbound] = await Promise.all([
      fetchInquiryMessages(userId, inquiryId),
      loadOutboundMessages(userId, threadId),
    ]);
    return mergeAndSort(ebayMessages, savedOutbound);
  }

  // Trading API messages — group by stable buyer/listing thread id
  if (threadId.startsWith("ebay-msg-")) {
    const [exchanges, sellerUsername, savedOutbound] = await Promise.all([
      fetchMemberMessageExchanges(userId),
      getSellerEbayUsername(userId),
      loadOutboundMessages(userId, threadId),
    ]);
    const buckets = buildMemberThreadBuckets(exchanges);
    const threadExchanges = [...(buckets.get(threadId) ?? [])].sort(
      (a, b) =>
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
    );

    const ebayMessages: Message[] = [];
    for (const exchange of threadExchanges) {
      // eBay API only returns buyer (inbound) messages — seller replies are not included
      // Direction: if sender matches seller username it's outbound, otherwise inbound
      const isSellerExchange = sellerUsername
        ? exchange.sender.toLowerCase() === sellerUsername.toLowerCase()
        : false;

      ebayMessages.push({
        id: `${threadId}-q-${exchange.messageId}`,
        thread_id: threadId,
        direction: isSellerExchange ? "outbound" : "inbound",
        sender_username: exchange.sender,
        body: exchange.body,
        is_read: exchange.isRead,
        external_message_id: exchange.messageId,
        created_at: exchange.creationDate,
      });
      // Nested Response blocks (present in some exchange formats)
      for (const response of exchange.responses) {
        const isSellerResponse = sellerUsername
          ? response.senderUsername.toLowerCase() === sellerUsername.toLowerCase()
          : true;
        ebayMessages.push({
          id: `${threadId}-r-${response.messageId}`,
          thread_id: threadId,
          direction: isSellerResponse ? "outbound" : "inbound",
          sender_username: response.senderUsername || "You",
          body: response.body,
          is_read: true,
          external_message_id: response.messageId,
          created_at: response.creationDate,
        });
      }
    }

    return mergeAndSort(ebayMessages, savedOutbound);
  }

  return [];
}

/** Merge eBay API messages with locally-saved outbound messages, dedup by body+date, sort chronologically */
function mergeAndSort(ebayMessages: Message[], savedOutbound: Message[]): Message[] {
  // Deduplicate: if a saved outbound message matches an eBay message by body, skip it
  const ebayOutboundBodies = new Set(
    ebayMessages.filter((m) => m.direction === "outbound").map((m) => m.body.trim())
  );
  const uniqueOutbound = savedOutbound.filter(
    (m) => !ebayOutboundBodies.has(m.body.trim())
  );
  const all = [...ebayMessages, ...uniqueOutbound];
  all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return all;
}

export async function sendEbayMessage(
  userId: string,
  threadId: string,
  body: string
): Promise<Message> {
  const content = body.trim();
  if (!content) {
    throw new Error("Message cannot be empty.");
  }

  // Post Order inquiry message
  if (threadId.startsWith("ebay-inquiry-")) {
    const inquiryId = threadId.replace("ebay-inquiry-", "");
    const res = await ebayFetch(
      userId,
      `/post-order/v2/inquiry/${inquiryId}/send_message`,
      {
        method: "POST",
        body: JSON.stringify({ message: { content } }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Unable to send message to eBay (${res.status}). ${errorBody}`.trim());
    }

    const sellerUsername = await getSellerEbayUsername(userId);
    const sentAt = new Date().toISOString();
    await saveOutboundMessage(userId, threadId, content, sellerUsername ?? "You");

    const sent: Message = {
      id: `${threadId}-${Date.now()}`,
      thread_id: threadId,
      direction: "outbound",
      sender_username: sellerUsername ?? "You",
      body: content,
      is_read: true,
      external_message_id: null,
      created_at: sentAt,
    };
    invalidateUserMessagingCaches(userId);
    return sent;
  }

  // Trading API member message reply
  if (threadId.startsWith("ebay-msg-")) {
    const thread = await getEbayThread(userId, threadId);
    const token = await getValidTokenForUser(userId);
    if (!thread || !thread.external_thread_id || !token) {
      throw new Error("Unable to resolve thread details for sending.");
    }
    if (!thread.listing_id) {
      throw new Error("This thread is missing listing context required for eBay reply.");
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageRTQRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <ItemID>${thread.listing_id}</ItemID>
  <MemberMessage>
    <Body>${content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</Body>
    <ParentMessageID>${thread.external_thread_id}</ParentMessageID>
    <RecipientID>${thread.buyer_username}</RecipientID>
  </MemberMessage>
</AddMemberMessageRTQRequest>`;

    const res = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-CALL-NAME": "AddMemberMessageRTQ",
        "Content-Type": "text/xml",
      },
      body: xml,
    });
    const text = await res.text();
    if (!res.ok || text.includes("<Ack>Failure</Ack>")) {
      // Extract eBay's error message if available
      const ebayError = /<LongMessage>([\s\S]*?)<\/LongMessage>/.exec(text)?.[1]
        ?? /<ShortMessage>([\s\S]*?)<\/ShortMessage>/.exec(text)?.[1]
        ?? "";
      throw new Error(
        ebayError
          ? `eBay: ${ebayError}`
          : "eBay rejected this reply. Please check eBay Messages to send directly."
      );
    }

    const sellerUsername2 = await getSellerEbayUsername(userId);
    const sentAt2 = new Date().toISOString();
    await saveOutboundMessage(userId, threadId, content, sellerUsername2 ?? "You");

    const sent: Message = {
      id: `${threadId}-${Date.now()}`,
      thread_id: threadId,
      direction: "outbound",
      sender_username: sellerUsername2 ?? "You",
      body: content,
      is_read: true,
      external_message_id: null,
      created_at: sentAt2,
    };
    invalidateUserMessagingCaches(userId);
    return sent;
  }

  throw new Error(
    "This conversation type does not support direct send from CardzCheck yet. Reply in eBay Messages."
  );
}

export async function getEbayMessagingStats(
  userId: string
): Promise<MessagingStats> {
  const threads = await getEbayThreads(userId);
  const unread = threads.filter((t) => t.unread_count > 0).length;
  const needsResponse = threads.filter((t) => t.status === "needs_response").length;
  const openOffers = threads.filter((t) => t.category === "offer").length;

  return {
    total_threads: threads.length,
    unread_count: unread,
    needs_response: needsResponse,
    open_offers: openOffers,
    avg_response_time_hours: null,
  };
}

/** Debug: returns raw parsed exchanges for a thread — used by ?debug=1 on the thread API route */
export async function getEbayRawDebug(
  userId: string,
  threadId: string
): Promise<unknown> {
  const sellerUsername = await getSellerEbayUsername(userId);

  if (threadId.startsWith("ebay-msg-")) {
    // Bypass cache to always get fresh data
    memberExchangeCache.delete(userId);
    const exchanges = await fetchMemberMessageExchanges(userId);
    const buckets = buildMemberThreadBuckets(exchanges);
    const threadExchanges = buckets.get(threadId) ?? [];
    return {
      sellerUsername,
      threadId,
      exchangeCount: threadExchanges.length,
      exchanges: threadExchanges.map((e) => ({
        messageId: e.messageId,
        sender: e.sender,
        isSellerExchange: sellerUsername
          ? e.sender.toLowerCase() === sellerUsername.toLowerCase()
          : false,
        bodyPreview: e.body.slice(0, 80),
        creationDate: e.creationDate,
        status: e.status,
        responseCount: e.responses.length,
        responses: e.responses.map((r) => ({
          messageId: r.messageId,
          senderUsername: r.senderUsername,
          bodyPreview: r.body.slice(0, 80),
          creationDate: r.creationDate,
        })),
      })),
    };
  }

  if (threadId.startsWith("ebay-inquiry-")) {
    const inquiryId = threadId.replace("ebay-inquiry-", "");
    const messages = await fetchInquiryMessages(userId, inquiryId);
    return { sellerUsername, threadId, messages };
  }

  return { error: "Unknown thread type" };
}
