/**
 * eBay Messaging Adapter
 *
 * Uses the eBay Trading API (XML) for member-to-member messaging:
 *   - GetMyMessages: fetch inbox messages
 *   - AddMemberMessageRTQ: reply to buyer messages
 *   - GetMemberMessages: get messages for a specific item
 *
 * The Trading API uses the same OAuth user tokens as the RESTful APIs
 * but requires XML request/response format and different headers.
 *
 * Required OAuth scope (must be added to EBAY_SCOPES):
 *   https://api.ebay.com/oauth/api_scope
 *
 * eBay Developer Program requirements:
 *   - Trading API must be enabled on the eBay app keyset
 *   - App must be opted into the Trading API (done in Developer Portal)
 */

import { createClient } from "@/lib/supabase/server";
import type {
  MessageThread,
  Message,
  MessageCategory,
  ThreadStatus,
} from "../types";

// ─── Constants ───────────────────────────────────────────────────────────────

const TRADING_API_URL =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll";

const COMPATIBILITY_LEVEL = "1349"; // Current eBay API version

// ─── XML helpers ─────────────────────────────────────────────────────────────

function buildTradingHeaders(
  callName: string,
  accessToken: string
): Record<string, string> {
  return {
    "X-EBAY-API-COMPATIBILITY-LEVEL": COMPATIBILITY_LEVEL,
    "X-EBAY-API-CALL-NAME": callName,
    "X-EBAY-API-SITEID": "0", // US site
    "X-EBAY-API-IAF-TOKEN": accessToken,
    "Content-Type": "text/xml",
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extract text content from an XML tag. Simple regex-based parser
 * sufficient for eBay's flat response structure.
 */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

// ─── Token helper ────────────────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ebay_accounts")
    .select("access_token")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  return data?.access_token ?? null;
}

// ─── GetMyMessages ───────────────────────────────────────────────────────────

interface EbayMessageSummary {
  messageId: string;
  senderId: string;
  subject: string;
  body: string;
  itemId: string | null;
  itemTitle: string | null;
  creationDate: string;
  isRead: boolean;
  isReplied: boolean;
  messageType: string; // "AskSellerQuestion", "ContactEbayMember", etc.
  responseEnabled: boolean;
}

/**
 * Fetch messages from eBay's inbox.
 * Returns message summaries sorted by date (newest first).
 *
 * @param userId - CardzCheck user ID (maps to ebay_accounts)
 * @param startTime - ISO date string, fetch messages after this time
 * @param pageNumber - 1-based page number
 */
export async function fetchEbayMessages(
  userId: string,
  startTime?: string,
  pageNumber: number = 1
): Promise<{ messages: EbayMessageSummary[]; hasMore: boolean } | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;

  const startTimeXml = startTime
    ? `<StartTime>${escapeXml(startTime)}</StartTime>`
    : `<StartTime>${new Date(Date.now() - 30 * 86_400_000).toISOString()}</StartTime>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnMessages</DetailLevel>
  <FolderID>0</FolderID>
  ${startTimeXml}
  <EndTime>${new Date().toISOString()}</EndTime>
  <Pagination>
    <EntriesPerPage>25</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
</GetMyMessagesRequest>`;

  try {
    const res = await fetch(TRADING_API_URL, {
      method: "POST",
      headers: buildTradingHeaders("GetMyMessages", token),
      body: xml,
    });

    if (!res.ok) {
      console.error(`[ebay-messaging] GetMyMessages failed: ${res.status}`);
      return null;
    }

    const responseXml = await res.text();

    // Check for API errors
    const ack = extractTag(responseXml, "Ack");
    if (ack === "Failure") {
      const errorMsg = extractTag(responseXml, "ShortMessage") ?? "Unknown error";
      console.error(`[ebay-messaging] GetMyMessages error: ${errorMsg}`);
      return null;
    }

    // Parse messages
    const messageBlocks = extractAllTags(responseXml, "Message");
    const messages: EbayMessageSummary[] = messageBlocks.map((block) => ({
      messageId: extractTag(block, "MessageID") ?? "",
      senderId: extractTag(block, "SendingUserID") ?? extractTag(block, "Sender") ?? "",
      subject: extractTag(block, "Subject") ?? "",
      body: extractTag(block, "Text") ?? extractTag(block, "Body") ?? "",
      itemId: extractTag(block, "ItemID"),
      itemTitle: extractTag(block, "ItemTitle"),
      creationDate: extractTag(block, "CreationDate") ?? new Date().toISOString(),
      isRead: extractTag(block, "Read") === "true",
      isReplied: extractTag(block, "Replied") === "true",
      messageType: extractTag(block, "MessageType") ?? "AskSellerQuestion",
      responseEnabled: extractTag(block, "ResponseEnabled") !== "false",
    }));

    // Check pagination
    const totalPages = parseInt(extractTag(responseXml, "TotalNumberOfPages") ?? "1", 10);
    const hasMore = pageNumber < totalPages;

    return { messages, hasMore };
  } catch (err) {
    console.error("[ebay-messaging] GetMyMessages exception:", err);
    return null;
  }
}

// ─── AddMemberMessageRTQ (Reply to Question) ────────────────────────────────

/**
 * Send a reply to a buyer's message on eBay.
 *
 * @param userId - CardzCheck user ID
 * @param recipientId - eBay username of the buyer
 * @param itemId - eBay listing item ID (required for RTQ replies)
 * @param body - Message body text
 * @param parentMessageId - The message ID being replied to
 */
export async function sendEbayReply(
  userId: string,
  recipientId: string,
  itemId: string,
  body: string,
  parentMessageId?: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getAccessToken(userId);
  if (!token) return { success: false, error: "No eBay account connected" };

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddMemberMessageRTQRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${escapeXml(itemId)}</ItemID>
  <MemberMessage>
    <Body>${escapeXml(body)}</Body>
    <RecipientID>${escapeXml(recipientId)}</RecipientID>
    ${parentMessageId ? `<ParentMessageID>${escapeXml(parentMessageId)}</ParentMessageID>` : ""}
    <MessageType>CustomizedSubject</MessageType>
  </MemberMessage>
</AddMemberMessageRTQRequest>`;

  try {
    const res = await fetch(TRADING_API_URL, {
      method: "POST",
      headers: buildTradingHeaders("AddMemberMessageRTQ", token),
      body: xml,
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const responseXml = await res.text();
    const ack = extractTag(responseXml, "Ack");

    if (ack === "Failure" || ack === "PartialFailure") {
      const errorMsg =
        extractTag(responseXml, "LongMessage") ??
        extractTag(responseXml, "ShortMessage") ??
        "Failed to send reply";
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── Conversion: eBay messages → CardzCheck domain types ─────────────────────

function classifyCategory(msg: EbayMessageSummary): MessageCategory {
  const subjectLower = (msg.subject + " " + msg.body).toLowerCase();

  if (subjectLower.includes("offer") || subjectLower.includes("best offer") || subjectLower.includes("would you take"))
    return "offer";
  if (subjectLower.includes("shipping") || subjectLower.includes("tracking") || subjectLower.includes("delivered"))
    return "shipping";
  if (subjectLower.includes("return") || subjectLower.includes("refund"))
    return "return_refund";
  if (subjectLower.includes("complaint") || subjectLower.includes("damaged") || subjectLower.includes("wrong item") || subjectLower.includes("not as described"))
    return "complaint";
  if (msg.messageType === "AskSellerQuestion")
    return "question";

  return "other";
}

function classifyStatus(msg: EbayMessageSummary): ThreadStatus {
  if (msg.isReplied) return "awaiting_buyer";
  if (!msg.isRead) return "needs_response";
  return "open";
}

/**
 * Convert raw eBay messages into CardzCheck MessageThread objects.
 * Groups messages by sender + item (thread-like behavior since
 * eBay doesn't have a native thread concept for all message types).
 */
export function ebayMessagesToThreads(
  userId: string,
  messages: EbayMessageSummary[]
): MessageThread[] {
  // Group by sender + itemId to form threads
  const threadMap = new Map<string, EbayMessageSummary[]>();

  for (const msg of messages) {
    const key = `${msg.senderId}::${msg.itemId ?? "general"}`;
    const existing = threadMap.get(key) ?? [];
    existing.push(msg);
    threadMap.set(key, existing);
  }

  const threads: MessageThread[] = [];

  for (const [key, msgs] of threadMap.entries()) {
    // Sort messages by date ascending
    msgs.sort(
      (a, b) =>
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
    );
    const latest = msgs[msgs.length - 1];
    const unreadCount = msgs.filter((m) => !m.isRead).length;

    threads.push({
      id: `ebay-${key.replace(/::/g, "-")}`,
      user_id: userId,
      platform: "ebay",
      external_thread_id: latest.messageId,
      buyer_username: latest.senderId,
      buyer_display_name: null,
      business_customer_id: null,
      listing_id: latest.itemId,
      inventory_item_id: null,
      item_title: latest.itemTitle,
      item_image_url: null,
      status: classifyStatus(latest),
      category: classifyCategory(latest),
      unread_count: unreadCount,
      last_message_at: latest.creationDate,
      last_message_preview: latest.body.slice(0, 200),
      ai_suggested_reply: null,
      suggested_action: null,
      offer_amount_cents: null,
      listing_price_cents: null,
      cost_basis_cents: null,
      fee_percent: null,
      estimated_net_cents: null,
      estimated_profit_cents: null,
      suggested_counter_cents: null,
      created_at: msgs[0].creationDate,
      updated_at: latest.creationDate,
    });
  }

  // Sort threads by last message (newest first)
  threads.sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime()
  );

  return threads;
}

/**
 * Convert raw eBay messages for a thread into CardzCheck Message objects.
 */
export function ebayMessagesToMessages(
  threadId: string,
  sellerUsername: string,
  msgs: EbayMessageSummary[]
): Message[] {
  return msgs
    .sort(
      (a, b) =>
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
    )
    .map((msg) => ({
      id: `ebay-msg-${msg.messageId}`,
      thread_id: threadId,
      direction:
        msg.senderId.toLowerCase() === sellerUsername.toLowerCase()
          ? ("outbound" as const)
          : ("inbound" as const),
      sender_username: msg.senderId,
      body: msg.body,
      is_read: msg.isRead,
      external_message_id: msg.messageId,
      created_at: msg.creationDate,
    }));
}

// ─── Check if user has eBay messaging connected ─────────────────────────────

export async function hasEbayMessagingAccess(
  userId: string
): Promise<{ connected: boolean; username: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ebay_accounts")
    .select("ebay_username, scopes")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return { connected: false, username: null };

  // Check if the base scope is present (required for Trading API)
  const hasMessagingScope =
    Array.isArray(data.scopes) &&
    data.scopes.some(
      (s: string) =>
        s === "https://api.ebay.com/oauth/api_scope" ||
        s.includes("sell.inventory") // Trading API also works with sell scopes in some cases
    );

  return {
    connected: hasMessagingScope,
    username: data.ebay_username,
  };
}
