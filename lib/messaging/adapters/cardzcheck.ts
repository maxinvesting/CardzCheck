/**
 * CardzCheck marketplace messaging adapter.
 *
 * Mirrors the shape of `lib/messaging/adapters/ebay.ts` so the unified
 * Sales Agent UI can drive both platforms with the same `MessageThread` /
 * `Message` types.
 *
 * Thread IDs are namespaced `cc-thread-<row-uuid>` and message IDs are
 * `cc-msg-<row-uuid>`.
 *
 * Reads/writes use the request-scoped Supabase client so RLS protects us;
 * a participant (buyer or seller) can read/write only their own threads.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Message,
  MessageThread,
  MessageCategory,
  ThreadStatus,
} from "../types";

const THREAD_ID_PREFIX = "cc-thread-";
const MESSAGE_ID_PREFIX = "cc-msg-";

export function isCardzcheckThreadId(id: string): boolean {
  return id.startsWith(THREAD_ID_PREFIX);
}

export function parseCardzcheckThreadId(id: string): string | null {
  if (!id.startsWith(THREAD_ID_PREFIX)) return null;
  return id.slice(THREAD_ID_PREFIX.length);
}

export function formatCardzcheckThreadId(rowId: string): string {
  return `${THREAD_ID_PREFIX}${rowId}`;
}

// ─── Row shapes returned by Supabase ─────────────────────────────────────────

interface ThreadRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string | null;
  transaction_id: string | null;
  subject: string | null;
  status: ThreadStatus;
  last_message_at: string;
  last_message_preview: string | null;
  last_sender_id: string | null;
  unread_count_seller: number;
  unread_count_buyer: number;
  created_at: string;
  updated_at: string;
  // Joined
  buyer?: { email: string | null } | null;
  seller?: { email: string | null } | null;
  listing?: {
    id: string;
    list_price_cents: number;
    card: { title: string | null } | null;
  } | null;
  transaction?: {
    id: string;
    sale_price_cents: number;
    fee_amount_cents: number;
  } | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────

function usernameFromEmail(email: string | null | undefined): string {
  if (!email) return "buyer";
  const local = email.split("@")[0] ?? email;
  return local || "buyer";
}

function categorize(subject: string | null, preview: string | null): MessageCategory {
  const haystack = `${subject ?? ""} ${preview ?? ""}`.toLowerCase();
  if (/\boffer\b|counter|deal|\$\d|price/.test(haystack)) return "offer";
  if (/\bship|tracking|deliver|address/.test(haystack)) return "shipping";
  if (/\brefund|return|cancel/.test(haystack)) return "return_refund";
  if (/\bcomplain|broken|damag|wrong/.test(haystack)) return "complaint";
  if (/\?$|question|how|what|when|why/.test(haystack)) return "question";
  return "other";
}

function mapThreadRow(row: ThreadRow, viewerId: string): MessageThread {
  const viewerIsSeller = row.seller_id === viewerId;
  const counterpartyEmail = viewerIsSeller ? row.buyer?.email : row.seller?.email;
  const unread = viewerIsSeller ? row.unread_count_seller : row.unread_count_buyer;

  const listPrice = row.listing?.list_price_cents ?? null;
  const salePrice = row.transaction?.sale_price_cents ?? null;
  const cardTitle = row.listing?.card?.title ?? null;
  const subjectFallback = cardTitle ?? row.subject ?? "Marketplace conversation";

  return {
    id: formatCardzcheckThreadId(row.id),
    user_id: viewerId,
    platform: "cardzcheck",
    external_thread_id: row.id,

    buyer_username: usernameFromEmail(counterpartyEmail),
    buyer_display_name: usernameFromEmail(counterpartyEmail),
    business_customer_id: null,

    listing_id: row.listing_id,
    inventory_item_id: row.transaction_id,
    item_title: subjectFallback,
    item_image_url: null,

    status: row.status,
    category: categorize(row.subject, row.last_message_preview),
    unread_count: unread,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,

    ai_suggested_reply: null,
    suggested_action: null,

    offer_amount_cents: null,
    listing_price_cents: listPrice,
    cost_basis_cents: null,
    fee_percent: null,
    estimated_net_cents:
      salePrice != null && row.transaction?.fee_amount_cents != null
        ? salePrice - row.transaction.fee_amount_cents
        : null,
    estimated_profit_cents: null,
    suggested_counter_cents: null,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessageRow(
  row: MessageRow,
  viewerId: string,
  participantEmails: Map<string, string | null>
): Message {
  return {
    id: `${MESSAGE_ID_PREFIX}${row.id}`,
    thread_id: formatCardzcheckThreadId(row.thread_id),
    direction: row.sender_id === viewerId ? "outbound" : "inbound",
    sender_username: usernameFromEmail(participantEmails.get(row.sender_id) ?? null),
    body: row.body,
    is_read: row.read_at != null,
    external_message_id: row.id,
    created_at: row.created_at,
  };
}

// ─── Shared select projection ────────────────────────────────────────────────

const THREAD_SELECT = `
  id, buyer_id, seller_id, listing_id, transaction_id, subject, status,
  last_message_at, last_message_preview, last_sender_id,
  unread_count_seller, unread_count_buyer, created_at, updated_at,
  buyer:users!marketplace_threads_buyer_id_fkey ( email ),
  seller:users!marketplace_threads_seller_id_fkey ( email ),
  listing:listings ( id, list_price_cents, card:marketplace_cards ( title ) ),
  transaction:transactions ( id, sale_price_cents, fee_amount_cents )
`;

// The auth.users FK alias isn't usable from PostgREST directly, so we fall
// back to a lighter projection without the user emails when the join fails.
const THREAD_SELECT_FALLBACK = `
  id, buyer_id, seller_id, listing_id, transaction_id, subject, status,
  last_message_at, last_message_preview, last_sender_id,
  unread_count_seller, unread_count_buyer, created_at, updated_at,
  listing:listings ( id, list_price_cents, card:marketplace_cards ( title ) ),
  transaction:transactions ( id, sale_price_cents, fee_amount_cents )
`;

async function selectThreads(filter: "seller" | "buyer", userId: string) {
  const supabase = await createClient();
  const column = filter === "seller" ? "seller_id" : "buyer_id";

  // Try with user-email join first; if PostgREST can't resolve it, retry plain.
  let { data, error } = await supabase
    .from("marketplace_threads")
    .select(THREAD_SELECT_FALLBACK)
    .eq(column, userId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (error) {
    console.warn("[cardzcheck/messaging] selectThreads error", error);
    return [] as ThreadRow[];
  }

  return ((data ?? []) as unknown as ThreadRow[]);
}

async function attachCounterpartyEmails(
  rows: ThreadRow[],
  viewerId: string
): Promise<ThreadRow[]> {
  if (rows.length === 0) return rows;
  const supabase = await createClient();
  const otherIds = Array.from(
    new Set(
      rows.map((r) => (r.seller_id === viewerId ? r.buyer_id : r.seller_id))
    )
  );

  const { data: profiles } = await supabase
    .from("users")
    .select("id, email")
    .in("id", otherIds);

  const emailById = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    emailById.set((p as { id: string }).id, (p as { email: string | null }).email);
  }

  return rows.map((r) => ({
    ...r,
    buyer: r.seller_id === viewerId ? { email: emailById.get(r.buyer_id) ?? null } : r.buyer ?? null,
    seller: r.seller_id === viewerId ? r.seller ?? null : { email: emailById.get(r.seller_id) ?? null },
  }));
}

// ─── Public API: seller side (consumed by Sales Agent) ───────────────────────

export async function getCardzcheckThreads(userId: string): Promise<MessageThread[]> {
  const rows = await selectThreads("seller", userId);
  const hydrated = await attachCounterpartyEmails(rows, userId);
  return hydrated.map((row) => mapThreadRow(row, userId));
}

export async function getCardzcheckBuyerThreads(userId: string): Promise<MessageThread[]> {
  const rows = await selectThreads("buyer", userId);
  const hydrated = await attachCounterpartyEmails(rows, userId);
  return hydrated.map((row) => mapThreadRow(row, userId));
}

export async function getCardzcheckThread(
  userId: string,
  threadId: string
): Promise<MessageThread | null> {
  const rowId = parseCardzcheckThreadId(threadId);
  if (!rowId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_threads")
    .select(THREAD_SELECT_FALLBACK)
    .eq("id", rowId)
    .maybeSingle();
  if (error || !data) return null;
  const rows = await attachCounterpartyEmails([data as unknown as ThreadRow], userId);
  return mapThreadRow(rows[0], userId);
}

export async function getCardzcheckMessages(
  userId: string,
  threadId: string
): Promise<Message[]> {
  const rowId = parseCardzcheckThreadId(threadId);
  if (!rowId) return [];
  const supabase = await createClient();
  const [{ data: msgs }, { data: thread }] = await Promise.all([
    supabase
      .from("marketplace_messages")
      .select("id, thread_id, sender_id, body, read_at, created_at")
      .eq("thread_id", rowId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("marketplace_threads")
      .select("buyer_id, seller_id")
      .eq("id", rowId)
      .maybeSingle(),
  ]);

  if (!msgs || !thread) return [];

  const t = thread as { buyer_id: string; seller_id: string };
  const { data: profiles } = await supabase
    .from("users")
    .select("id, email")
    .in("id", [t.buyer_id, t.seller_id]);
  const emails = new Map<string, string | null>();
  for (const p of profiles ?? []) {
    emails.set((p as { id: string }).id, (p as { email: string | null }).email);
  }

  // Mark inbound (counterparty) messages as read while the viewer is looking.
  void supabase
    .from("marketplace_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", rowId)
    .neq("sender_id", userId)
    .is("read_at", null);
  void supabase
    .from("marketplace_threads")
    .update(
      t.seller_id === userId
        ? { unread_count_seller: 0 }
        : { unread_count_buyer: 0 }
    )
    .eq("id", rowId);

  return (msgs as unknown as MessageRow[]).map((row) => mapMessageRow(row, userId, emails));
}

export async function sendCardzcheckMessage(
  userId: string,
  threadId: string,
  body: string
): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");
  const rowId = parseCardzcheckThreadId(threadId);
  if (!rowId) throw new Error("Invalid CardzCheck thread id.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_messages")
    .insert({ thread_id: rowId, sender_id: userId, body: trimmed })
    .select("id, thread_id, sender_id, body, read_at, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to send CardzCheck message.");
  }

  return {
    id: `${MESSAGE_ID_PREFIX}${(data as MessageRow).id}`,
    thread_id: threadId,
    direction: "outbound",
    sender_username: "You",
    body: (data as MessageRow).body,
    is_read: true,
    external_message_id: (data as MessageRow).id,
    created_at: (data as MessageRow).created_at,
  };
}

// ─── Public API: buyer-side thread creation ──────────────────────────────────

export interface StartThreadInput {
  sellerId: string;
  buyerId: string; // current authenticated user
  listingId?: string | null;
  transactionId?: string | null;
  subject?: string | null;
  body?: string | null;
}

/**
 * Start (or reuse) a thread between buyer and seller. If a listing or
 * transaction is provided, an existing thread referencing the same context
 * is reused. Otherwise we create a fresh thread.
 *
 * Returns the prefixed thread id, ready for use in URLs.
 */
export async function startCardzcheckThread(
  input: StartThreadInput
): Promise<{ threadId: string; created: boolean }> {
  if (input.sellerId === input.buyerId) {
    throw new Error("You can't message yourself.");
  }
  const supabase = await createClient();

  // Try to find an existing thread for this buyer/seller (+ context).
  const filterParts: string[] = [
    `buyer_id.eq.${input.buyerId}`,
    `seller_id.eq.${input.sellerId}`,
  ];
  let lookup = supabase
    .from("marketplace_threads")
    .select("id")
    .eq("buyer_id", input.buyerId)
    .eq("seller_id", input.sellerId);

  if (input.listingId) {
    lookup = lookup.eq("listing_id", input.listingId);
  } else if (input.transactionId) {
    lookup = lookup.eq("transaction_id", input.transactionId);
  } else {
    lookup = lookup.is("listing_id", null).is("transaction_id", null);
  }

  const { data: existing } = await lookup.maybeSingle();
  let rowId: string | undefined = (existing as { id?: string } | null)?.id;
  let created = false;

  if (!rowId) {
    const { data: inserted, error } = await supabase
      .from("marketplace_threads")
      .insert({
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        listing_id: input.listingId ?? null,
        transaction_id: input.transactionId ?? null,
        subject: input.subject ?? null,
        status: "open",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(error?.message ?? "Failed to start conversation.");
    }
    rowId = (inserted as { id: string }).id;
    created = true;
  }

  if (input.body && input.body.trim()) {
    await supabase
      .from("marketplace_messages")
      .insert({ thread_id: rowId, sender_id: input.buyerId, body: input.body.trim() });
  }

  // Mark suppress-unused
  void filterParts;

  return { threadId: formatCardzcheckThreadId(rowId), created };
}

export async function updateCardzcheckThreadStatus(
  userId: string,
  threadId: string,
  status: ThreadStatus
): Promise<void> {
  const rowId = parseCardzcheckThreadId(threadId);
  if (!rowId) return;
  const supabase = await createClient();
  await supabase
    .from("marketplace_threads")
    .update({ status })
    .eq("id", rowId);
  void userId;
}
