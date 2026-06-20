/**
 * Trade Center server-side data access.
 *
 * - getTradeableCards / getBinder / browseBinders read a user's "Available for
 *   Trade" cards from collection_items. The binder/browse helpers use the
 *   service role and return ONLY a safe projection (never cost basis or other
 *   private columns), since they expose OTHER users' cards.
 * - getTrade / listMyTrades read trades the caller participates in (RLS-scoped),
 *   hydrating the counterparty's display name via the service role (public.users
 *   is owner-only under RLS).
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  BinderCard,
  Trade,
  TradeableCard,
  TradeDetail,
  TradeItem,
  TradeShipment,
} from "./types";

// Excluded statuses — a sold/pending/already-traded card can't be offered.
const UNAVAILABLE = "(sold,pending_sale,traded)";

const CARD_SELECT =
  "id, title, set_name, player_name, year, grade, grading_company, image_url, user_image_url, estimated_cmv, est_cmv, current_market_value_cents, list_price_cents";

interface CardRow {
  id: string;
  title: string | null;
  set_name: string | null;
  player_name: string | null;
  year: string | null;
  grade: string | null;
  grading_company: string | null;
  image_url: string | null;
  user_image_url: string | null;
  estimated_cmv: number | null;
  est_cmv: number | null;
  current_market_value_cents: number | null;
  list_price_cents: number | null;
  user_id?: string;
}

/** Mirror of pickEstimatedValueCents from list-from-inventory. */
function pickValueCents(row: CardRow): number {
  if (typeof row.current_market_value_cents === "number" && row.current_market_value_cents > 0) {
    return row.current_market_value_cents;
  }
  if (typeof row.estimated_cmv === "number" && row.estimated_cmv > 0) {
    return Math.round(row.estimated_cmv * 100);
  }
  if (typeof row.est_cmv === "number" && row.est_cmv > 0) {
    return Math.round(row.est_cmv * 100);
  }
  if (typeof row.list_price_cents === "number" && row.list_price_cents > 0) {
    return row.list_price_cents;
  }
  return 0;
}

function mapCard(row: CardRow): TradeableCard {
  return {
    id: row.id,
    title: row.title ?? row.set_name ?? null,
    player: row.player_name ?? row.title ?? null,
    year: row.year ?? null,
    grade: row.grade ?? null,
    grading_company: row.grading_company ?? null,
    image_url: row.user_image_url || row.image_url || null,
    estimated_value_cents: pickValueCents(row),
  };
}

/** The caller's own tradeable cards (RLS-scoped). */
export async function getTradeableCards(userId: string): Promise<TradeableCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_items")
    .select(CARD_SELECT)
    .eq("user_id", userId)
    .eq("is_tradeable", true)
    .not("status", "in", UNAVAILABLE)
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as CardRow[]).map(mapCard);
}

export interface OwnInventoryCard extends TradeableCard {
  is_tradeable: boolean;
  status: string | null;
}

/** The caller's full available inventory + tradeable flag (binder management). */
export async function listOwnInventory(userId: string): Promise<OwnInventoryCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_items")
    .select(`${CARD_SELECT}, is_tradeable, status`)
    .eq("user_id", userId)
    .not("status", "in", UNAVAILABLE)
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as Array<CardRow & { is_tradeable: boolean; status: string | null }>).map(
    (r) => ({ ...mapCard(r), is_tradeable: !!r.is_tradeable, status: r.status ?? null })
  );
}

/** A specific user's tradeable binder (sanitized projection via service role). */
export async function getBinder(targetUserId: string): Promise<TradeableCard[]> {
  const service = await createServiceClient();
  const { data } = await service
    .from("collection_items")
    .select(CARD_SELECT)
    .eq("user_id", targetUserId)
    .eq("is_tradeable", true)
    .not("status", "in", UNAVAILABLE)
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as CardRow[]).map(mapCard);
}

/**
 * Fetch a specific set of cards owned by `ownerId`, returned as trade snapshots.
 * Used when building/revising a trade. Always requires the card to be flagged
 * tradeable and still available, so nothing sold/traded can be put into a trade.
 * Service-role so we can validate cards on EITHER side of the trade.
 */
export async function fetchOwnedCards(
  ownerId: string,
  ids: string[]
): Promise<TradeableCard[]> {
  if (ids.length === 0) return [];
  const service = await createServiceClient();
  const { data } = await service
    .from("collection_items")
    .select(CARD_SELECT)
    .in("id", ids)
    .eq("user_id", ownerId)
    .eq("is_tradeable", true)
    .not("status", "in", UNAVAILABLE);
  return ((data ?? []) as CardRow[]).map(mapCard);
}

/** Browse everyone's tradeable cards (excluding the caller). For discovery. */
export async function browseBinders(
  excludeUserId: string | null,
  limit = 60
): Promise<BinderCard[]> {
  const service = await createServiceClient();
  let q = service
    .from("collection_items")
    .select(`${CARD_SELECT}, user_id`)
    .eq("is_tradeable", true)
    .not("status", "in", UNAVAILABLE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { data } = await q;
  return ((data ?? []) as CardRow[]).map((row) => ({
    ...mapCard(row),
    owner_id: row.user_id as string,
  }));
}

/** Resolve display names for a set of user ids (service role; users is owner-RLS). */
export async function resolveDisplayNames(
  ids: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return out;
  const service = await createServiceClient();
  const { data } = await service
    .from("users")
    .select("id, name, email")
    .in("id", unique);
  for (const p of (data ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
    const display = p.name?.trim() || (p.email ? p.email.split("@")[0] : null);
    out.set(p.id, display ?? null);
  }
  return out;
}

/** Full trade detail for a participant (RLS enforces participation). */
export async function getTrade(
  tradeId: string,
  userId: string
): Promise<TradeDetail | null> {
  const supabase = await createClient();
  const { data: tradeRow } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .maybeSingle();
  if (!tradeRow) return null;
  const trade = tradeRow as Trade;
  if (trade.initiator_id !== userId && trade.recipient_id !== userId) return null;

  const [{ data: items }, { data: shipments }] = await Promise.all([
    supabase
      .from("trade_items")
      .select("*")
      .eq("trade_id", tradeId)
      .order("created_at", { ascending: true }),
    supabase.from("trade_shipments").select("*").eq("trade_id", tradeId),
  ]);

  const otherId =
    trade.initiator_id === userId ? trade.recipient_id : trade.initiator_id;
  const names = await resolveDisplayNames([otherId]);

  return {
    ...trade,
    items: (items ?? []) as TradeItem[],
    shipments: (shipments ?? []) as TradeShipment[],
    counterparty_name: names.get(otherId) ?? null,
  };
}

/** All trades the caller participates in, newest first, with line items. */
export async function listMyTrades(userId: string): Promise<TradeDetail[]> {
  const supabase = await createClient();
  const { data: tradeRows } = await supabase
    .from("trades")
    .select("*")
    .or(`initiator_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(100);
  const trades = (tradeRows ?? []) as Trade[];
  if (trades.length === 0) return [];

  const ids = trades.map((t) => t.id);
  const { data: items } = await supabase
    .from("trade_items")
    .select("*")
    .in("trade_id", ids);
  const byTrade = new Map<string, TradeItem[]>();
  for (const it of (items ?? []) as TradeItem[]) {
    const arr = byTrade.get(it.trade_id) ?? [];
    arr.push(it);
    byTrade.set(it.trade_id, arr);
  }

  const names = await resolveDisplayNames(
    trades.map((t) => (t.initiator_id === userId ? t.recipient_id : t.initiator_id))
  );

  return trades.map((t) => {
    const otherId = t.initiator_id === userId ? t.recipient_id : t.initiator_id;
    return {
      ...t,
      items: byTrade.get(t.id) ?? [],
      shipments: [],
      counterparty_name: names.get(otherId) ?? null,
    };
  });
}
