/**
 * Trade Center domain types. Shared between server (lib/trade, app/api/trade)
 * and client (app/trade, components/trade).
 */

export type TradeSide = "initiator" | "recipient";

export type TradeStatus =
  | "draft"
  | "proposed"
  | "countered"
  | "accepted" // both approved, awaiting cash payment
  | "cash_pending" // cash checkout opened, not yet paid
  | "confirmed" // agreement locked (cash paid if any) — ship now
  | "shipped" // at least one side has shipped
  | "completed" // both shipped → cards swapped
  | "declined"
  | "canceled";

export type CashStatus = "none" | "pending" | "paid";

export interface Trade {
  id: string;
  initiator_id: string;
  recipient_id: string;
  status: TradeStatus;
  cash_from: TradeSide | null;
  cash_cents: number;
  cash_status: CashStatus;
  /** Settlement method: true = platform-mediated (3% of total value), false = direct ship-to-ship (free, subscriber-only). */
  use_middleman: boolean;
  platform_fee_cents: number;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  initiator_approved: boolean;
  recipient_approved: boolean;
  note: string | null;
  last_actor_id: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
}

export interface TradeItem {
  id: string;
  trade_id: string;
  owner_id: string;
  side: TradeSide;
  collection_item_id: string | null;
  title: string | null;
  player: string | null;
  year: string | null;
  grade: string | null;
  grading_company: string | null;
  image_url: string | null;
  estimated_value_cents: number;
  created_at: string;
}

export interface TradeShipment {
  id: string;
  trade_id: string;
  shipper_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_url: string | null;
  cost_cents: number | null;
  shipped_at: string | null;
  delivered_at: string | null;
}

/** A trade hydrated with its line items + shipments for UI rendering. */
export interface TradeDetail extends Trade {
  items: TradeItem[];
  shipments: TradeShipment[];
  counterparty_name: string | null;
}

/** A card a user has flagged "Available for Trade" — safe public projection. */
export interface TradeableCard {
  id: string; // collection_items.id
  title: string | null;
  player: string | null;
  year: string | null;
  grade: string | null;
  grading_company: string | null;
  image_url: string | null;
  estimated_value_cents: number;
}

export interface BinderCard extends TradeableCard {
  owner_id: string;
}

/** Statuses where the proposal cards/cash can still be revised. */
export const EDITABLE_STATUSES: TradeStatus[] = ["draft", "proposed", "countered"];

/** Statuses that can no longer change. */
export const TERMINAL_STATUSES: TradeStatus[] = ["completed", "declined", "canceled"];

export function isEditable(status: TradeStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export function isTerminal(status: TradeStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function sideForUser(trade: Trade, userId: string): TradeSide | null {
  if (trade.initiator_id === userId) return "initiator";
  if (trade.recipient_id === userId) return "recipient";
  return null;
}
