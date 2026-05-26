/**
 * Messaging domain types — platform-agnostic.
 *
 * Designed for eBay first, but extensible to Whatnot, website chat, etc.
 */

// ─── Core enums ──────────────────────────────────────────────────────────────

export type MessagePlatform =
  | "ebay"
  | "cardzcheck"
  | "whatnot"
  | "website"
  | "other";

export type ThreadStatus =
  | "open"
  | "needs_response"
  | "awaiting_buyer"
  | "resolved"
  | "archived";

export type MessageCategory =
  | "question"
  | "offer"
  | "shipping"
  | "complaint"
  | "return_refund"
  | "other";

export type MessageDirection = "inbound" | "outbound";

export type NegotiationAction =
  | "accept"
  | "counter"
  | "hold_firm"
  | "decline";

// ─── Thread ──────────────────────────────────────────────────────────────────

export interface MessageThread {
  id: string;
  user_id: string;
  platform: MessagePlatform;
  external_thread_id: string | null;

  // Buyer info
  buyer_username: string;
  buyer_display_name: string | null;
  business_customer_id: string | null;

  // Listing linkage
  listing_id: string | null;
  inventory_item_id: string | null;
  item_title: string | null;
  item_image_url: string | null;

  // Thread state
  status: ThreadStatus;
  category: MessageCategory;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string | null;

  // AI
  ai_suggested_reply: string | null;
  suggested_action: NegotiationAction | null;

  // Negotiation snapshot
  offer_amount_cents: number | null;
  listing_price_cents: number | null;
  cost_basis_cents: number | null;
  fee_percent: number | null;
  estimated_net_cents: number | null;
  estimated_profit_cents: number | null;
  suggested_counter_cents: number | null;

  created_at: string;
  updated_at: string;
}

// ─── Message ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  thread_id: string;
  direction: MessageDirection;
  sender_username: string;
  body: string;
  is_read: boolean;
  external_message_id: string | null;
  created_at: string;
}

// ─── AI Reply Draft ──────────────────────────────────────────────────────────

export interface AIReplyDraft {
  id: string;
  thread_id: string;
  tone: string;
  body: string;
  created_at: string;
}

// ─── Negotiation Analysis ────────────────────────────────────────────────────

export interface NegotiationAnalysis {
  offer_amount_cents: number;
  listing_price_cents: number;
  cost_basis_cents: number;
  fee_percent: number;
  estimated_net_cents: number;
  estimated_profit_cents: number;
  recommended_action: NegotiationAction;
  suggested_counter_cents: number | null;
  reasoning: string;
}

// ─── Messaging stats ────────────────────────────────────────────────────────

export interface MessagingStats {
  total_threads: number;
  unread_count: number;
  needs_response: number;
  open_offers: number;
  avg_response_time_hours: number | null;
}

// ─── Filter / query ──────────────────────────────────────────────────────────

export type ThreadFilter =
  | "all"
  | "unread"
  | "needs_response"
  | "offers"
  | "resolved"
  | "archived";
