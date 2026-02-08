import { createClient } from "@/lib/supabase/server";
import type { WatchlistItem, CollectionItem, RecentSearch } from "@/types";
import { computeCollectionSummary, getCollectionValuePerCard, getEstCmv, getCostBasis } from "@/lib/values";

export interface UserAIContext {
  user: { id: string; name?: string | null; email?: string | null };
  collection_summary: {
    total_cards: number;
    total_value: number | null;
    cost_basis: number;
    unrealized_pl: number;
    change_30d?: number | null;
  };
  collection_top: Array<{
    id: string;
    display_name: string;
    year: string | null;
    brand: string | null;
    set_name: string | null;
    parallel?: string | null;
    grade?: string | null;
    est_value: number | null;
    cost_basis?: number | null;
    has_cmv: boolean;
    cmv_confidence?: string | null;
    notes?: string | null;
    last_updated: string;
  }>;
  collection_recent: Array<{
    id: string;
    display_name: string;
    year: string | null;
    brand: string | null;
    set_name: string | null;
    parallel?: string | null;
    grade?: string | null;
    est_value: number | null;
    cost_basis?: number | null;
    has_cmv: boolean;
    cmv_confidence?: string | null;
    notes?: string | null;
    last_updated: string;
  }>;
  watchlist_summary: {
    total_cards: number;
    total_value_if_purchased: number;
    below_target_count: number;
  };
  watchlist_below_target: Array<{
    id: string;
    display_name: string;
    target_price: number | null;
    est_value: number | null;
    delta: number | null;
  }>;
  recent_searches: Array<{
    query: string;
    est_value?: number;
    results_count?: number;
    created_at: string;
  }>;
  app_time: string;
}

const MAX_TOP = 10;
const MAX_RECENT = 10;
const MAX_WATCHLIST_BELOW = 10;
const MAX_RECENT_SEARCHES = 10;

export async function getUserContextForAI(userId: string): Promise<UserAIContext> {
  const supabase = await createClient();

  const nowIso = new Date().toISOString();

  const [{ data: userRow }, { data: collectionItems }, { data: watchlistItems }, { data: searchRows }] =
    await Promise.all([
      supabase.from("users").select("id, email, name").eq("id", userId).single(),
      supabase
        .from("collection_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("recent_searches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(MAX_RECENT_SEARCHES),
    ]);

  const collection = (collectionItems || []) as CollectionItem[];
  const watchlist = (watchlistItems || []) as WatchlistItem[];

  const summary = computeCollectionSummary(collection);
  const cost_basis = summary.totalCostBasis;
  const total_value = summary.totalDisplayValue;
  const unrealized_pl = summary.totalUnrealizedPL ?? 0;

  const mapCollectionCard = (item: CollectionItem) => {
    const display_name = [
      item.year,
      item.player_name,
      item.set_name,
      item.grade,
    ]
      .filter(Boolean)
      .join(" ");

    const estValue = getEstCmv(item);
    const costBasis = getCostBasis(item);
    const hasCmv = estValue !== null && estValue > 0;

    return {
      id: item.id,
      display_name,
      year: item.year ?? null,
      brand: null,
      set_name: item.set_name ?? null,
      parallel: null,
      grade: item.grade ?? null,
      est_value: estValue,
      cost_basis: costBasis,
      has_cmv: hasCmv,
      cmv_confidence: item.cmv_confidence ?? null,
      notes: item.notes ?? null,
      last_updated: item.created_at,
    };
  };

  const collection_top = [...collection]
    .sort((a, b) => getCollectionValuePerCard(b) - getCollectionValuePerCard(a))
    .slice(0, MAX_TOP)
    .map(mapCollectionCard);

  const collection_recent = [...collection]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, MAX_RECENT)
    .map(mapCollectionCard);

  const watchlist_summary = (() => {
    const total_cards = watchlist.length;
    const withPrice = watchlist.filter((w) => w.last_price !== null);
    const total_value_if_purchased = withPrice.reduce((sum, w) => sum + (w.last_price || 0), 0);
    const below_target_count = watchlist.filter(
      (w) =>
        w.target_price !== null &&
        w.last_price !== null &&
        (w.last_price as number) <= (w.target_price as number)
    ).length;
    return { total_cards, total_value_if_purchased, below_target_count };
  })();

  const watchlist_below_target = watchlist
    .filter(
      (w) =>
        w.target_price !== null &&
        w.last_price !== null &&
        (w.last_price as number) <= (w.target_price as number)
    )
    .sort((a, b) => (a.last_price || 0) - (b.last_price || 0))
    .slice(0, MAX_WATCHLIST_BELOW)
    .map((w) => {
      const display_name = [
        w.year,
        w.player_name,
        w.set_brand,
        w.condition,
        w.parallel_variant,
      ]
        .filter(Boolean)
        .join(" ");

      const est_value = w.last_price ?? null;
      const target = w.target_price ?? null;
      const delta =
        est_value !== null && target !== null ? (est_value as number) - (target as number) : null;

      return {
        id: w.id,
        display_name,
        target_price: target,
        est_value,
        delta,
      };
    });

  const recent_searches =
    (searchRows || []).map((row: any) => {
      const parsed = row.parsed as RecentSearch["parsed"] | undefined;
      return {
        query: row.query as string,
        est_value: row.cmv ?? undefined,
        results_count: row.resultCount ?? undefined,
        created_at: row.created_at ?? nowIso,
      };
    }) ?? [];

  return {
    user: {
      id: userRow?.id ?? userId,
      name: userRow?.name ?? null,
      email: userRow?.email ?? null,
    },
    collection_summary: {
      total_cards: collection.length,
      total_value,
      cost_basis,
      unrealized_pl,
      change_30d: null,
    },
    collection_top,
    collection_recent,
    watchlist_summary,
    watchlist_below_target,
    recent_searches,
    app_time: nowIso,
  };
}
