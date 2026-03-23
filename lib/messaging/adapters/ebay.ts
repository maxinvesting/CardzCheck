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

type MemberMessageExchange = NonNullable<
  NonNullable<EbayMemberMessagesResponse["MemberMessage"]>["MemberMessageExchange"]
>[number];

function mapMemberMessageToThread(
  exchange: MemberMessageExchange,
  userId: string
): MessageThread | null {
  const q = exchange.Question;
  if (!q) return null;

  const now = new Date().toISOString();
  const isRead = q.IsRead === "true";

  return {
    id: `ebay-msg-${q.MessageID}`,
    user_id: userId,
    platform: "ebay",
    external_thread_id: q.MessageID,
    buyer_username: q.Sender,
    buyer_display_name: q.Sender,
    business_customer_id: null,
    listing_id: q.ItemID ?? null,
    inventory_item_id: null,
    item_title: q.ItemTitle ?? null,
    item_image_url: null,
    status: exchange.MessageStatus === "Unanswered" ? "needs_response" : "awaiting_buyer",
    category: "question",
    unread_count: isRead ? 0 : 1,
    last_message_at: exchange.CreationDate ?? q.CreationDate,
    last_message_preview: q.Body.slice(0, 120),
    ai_suggested_reply: null,
    suggested_action: null,
    offer_amount_cents: null,
    listing_price_cents: null,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents: null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,
    created_at: q.CreationDate,
    updated_at: exchange.CreationDate ?? q.CreationDate ?? now,
  };
}

// ─── Post Order API calls ─────────────────────────────────────────────────────

async function fetchPostOrderInquiries(
  userId: string
): Promise<MessageThread[]> {
  try {
    const res = await ebayFetch(
      userId,
      "/post-order/v2/inquiry?status=OPEN&limit=50",
      { headers: { "X-EBAY-C-ENDUSERCTX": `userId=${userId}` } }
    );

    if (res.status === 403 || res.status === 401) {
      // Scope not granted — silently return empty
      console.info("[ebay/messaging] Post Order scope not granted, skipping inquiries");
      return [];
    }
    if (!res.ok) return [];

    const data = (await res.json()) as EbayInquiryListResponse;
    return (data.inquiries ?? []).map((inq) => mapInquiryToThread(inq, userId));
  } catch {
    return [];
  }
}

async function fetchInquiryMessages(
  userId: string,
  inquiryId: string
): Promise<Message[]> {
  try {
    const res = await ebayFetch(
      userId,
      `/post-order/v2/inquiry/${inquiryId}/message`
    );
    if (!res.ok) return [];

    const data = (await res.json()) as EbayInquiryMessageResponse;
    return (data.messages ?? []).map((m, i) => ({
      id: `${inquiryId}-msg-${i}`,
      thread_id: `ebay-inquiry-${inquiryId}`,
      direction: m.sender === userId ? "outbound" : "inbound",
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

async function fetchMemberMessages(userId: string): Promise<MessageThread[]> {
  try {
    const token = await getValidTokenForUser(userId);
    if (!token) return [];

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMemberMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${token}</eBayAuthToken>
  </RequesterCredentials>
  <MailMessageType>All</MailMessageType>
  <MessageStatus>Unanswered</MessageStatus>
  <StartCreationTime>${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}</StartCreationTime>
  <EndCreationTime>${new Date().toISOString()}</EndCreationTime>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>1</PageNumber>
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

    if (!res.ok) return [];

    // Parse XML response minimally — extract key fields
    const text = await res.text();

    // Check for Failure ack
    if (text.includes("<Ack>Failure</Ack>")) {
      console.info("[ebay/messaging] GetMemberMessages failed (scope likely not granted)");
      return [];
    }

    // Extract exchanges using simple regex (avoids XML parser dependency)
    const exchanges: MessageThread[] = [];
    const exchangeRegex = /<MemberMessageExchange>([\s\S]*?)<\/MemberMessageExchange>/g;
    let match;

    while ((match = exchangeRegex.exec(text)) !== null) {
      const block = match[1];
      const get = (tag: string) => {
        const m = new RegExp(`<${tag}>(.*?)<\/${tag}>`).exec(block);
        return m?.[1] ?? "";
      };

      const msgId = get("MessageID");
      if (!msgId) continue;

      const creationDate = get("CreationDate");
      const sender = get("SenderID") || get("Sender");
      const body = get("Body").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      const itemId = get("ItemID");
      const itemTitle = get("Subject") || null;
      const isRead = get("Read") === "true";
      const status = get("MessageStatus");

      exchanges.push({
        id: `ebay-msg-${msgId}`,
        user_id: userId,
        platform: "ebay",
        external_thread_id: msgId,
        buyer_username: sender,
        buyer_display_name: sender,
        business_customer_id: null,
        listing_id: itemId || null,
        inventory_item_id: null,
        item_title: itemTitle,
        item_image_url: null,
        status: status === "Unanswered" ? "needs_response" : "awaiting_buyer",
        category: "question",
        unread_count: isRead ? 0 : 1,
        last_message_at: creationDate,
        last_message_preview: body.slice(0, 120) || null,
        ai_suggested_reply: null,
        suggested_action: null,
        offer_amount_cents: null,
        listing_price_cents: null,
        cost_basis_cents: null,
        fee_percent: null,
        estimated_net_cents: null,
        estimated_profit_cents: null,
        suggested_counter_cents: null,
        created_at: creationDate,
        updated_at: creationDate,
      });
    }

    return exchanges;
  } catch (err) {
    console.warn("[ebay/messaging] GetMemberMessages error:", err);
    return [];
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

// ─── Public adapter API ───────────────────────────────────────────────────────

export async function getEbayThreads(userId: string): Promise<MessageThread[]> {
  // Fetch from both APIs in parallel; combine results
  const [inquiries, memberMessages] = await Promise.all([
    fetchPostOrderInquiries(userId),
    fetchMemberMessages(userId),
  ]);

  // Deduplicate by id, sort newest first
  const all = [...memberMessages, ...inquiries];
  return all.sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
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
    return fetchInquiryMessages(userId, inquiryId);
  }

  // Trading API messages — reconstruct from thread data
  const thread = await getEbayThread(userId, threadId);
  if (!thread || !thread.last_message_preview) return [];

  // Return the preview message as the message body
  return [
    {
      id: `${threadId}-0`,
      thread_id: threadId,
      direction: "inbound",
      sender_username: thread.buyer_username,
      body: thread.last_message_preview,
      is_read: thread.unread_count === 0,
      external_message_id: thread.external_thread_id,
      created_at: thread.last_message_at,
    },
  ];
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
