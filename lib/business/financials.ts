import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import { getCashBalanceCents } from "@/lib/business/cash";
import {
  TRADE_RECOGNITION_SELECT,
  normalizeTradeRow,
  tradeRecognition,
  sumDeferredTradeGains,
  type RawTradeRow,
  type RecognizableTrade,
} from "@/lib/business/trade-recognition";

const BUSINESS_TABLE = "collection_items" as const;
const BUSINESS_ITEM_KIND = "inventory" as const;

type SaleRow = {
  sold_at: string;
  sold_price_cents: number | null;
  shipping_charged_cents: number | null;
  shipping_cost_cents: number | null;
  platform_fees_cents: number | null;
  tax_cents: number | null;
  net_payout_cents: number | null;
  cogs_cents: number | null;
  profit_cents: number | null;
  channel: string | null;
  inventory_item_id: string | null;
};

type SaleRowWithCard = SaleRow & {
  card_title: string | null;
  card_player: string | null;
  card_year: string | null;
};

type InventoryRow = {
  id: string;
  title: string | null;
  player_name: string | null;
  year: string | null;
  cost_basis_total_cents: number | null;
  current_market_value_cents: number | null;
  estimated_cmv: number | null;
  est_cmv: number | null;
  acquisition_date: string | null;
  acquisition_type: string | null;
  created_at: string;
  status: string | null;
  channel: string | null;
};

// Trade-recognition math now lives in `lib/business/trade-recognition.ts` so the
// dashboard KPIs and this page recognize trades identically. `TradeRow` is kept
// as a local alias to minimize churn in the signatures below.
type TradeRow = RecognizableTrade;

export type PeriodTotals = {
  revenue_cents: number;
  cogs_cents: number;
  fees_cents: number;
  shipping_cost_cents: number;
  profit_cents: number;
  sales_count: number;
  margin_pct: number | null;
  avg_order_value_cents: number | null;
};

export type MonthBucket = {
  month: string;
  revenue_cents: number;
  cogs_cents: number;
  fees_cents: number;
  profit_cents: number;
  sales_count: number;
};

export type DayBucket = {
  day: string; // YYYY-MM-DD (UTC)
  revenue_cents: number;
  cogs_cents: number;
  fees_cents: number;
  profit_cents: number;
  sales_count: number;
};

export type CashFlowBucket = {
  month: string;
  cash_in_cents: number; // net cash received from sales settled in the month
  cash_out_cents: number; // cash spent acquiring inventory in the month
  net_cents: number; // cash_in - cash_out
};

export type CashFlow = {
  monthly: CashFlowBucket[]; // trailing 12 months
  current_month_net_cents: number;
  prev_month_net_cents: number;
  current_month_in_cents: number;
  current_month_out_cents: number;
};

export type ChannelBreakdown = {
  channel: string;
  revenue_cents: number;
  profit_cents: number;
  sales_count: number;
  margin_pct: number | null;
};

export type AgingBucket = {
  label: "0-30" | "31-60" | "61-90" | "90+";
  count: number;
  cost_basis_cents: number;
  estimated_value_cents: number;
};

export type CardPerformance = {
  title: string;
  channel: string;
  sold_at: string;
  revenue_cents: number;
  cogs_cents: number;
  profit_cents: number;
  roi_pct: number | null;
};

export type Snapshot = {
  inventory_value_cents: number;
  cost_basis_cents: number;
  unrealized_pnl_cents: number;
  unrealized_pnl_pct: number | null;
  active_count: number;
  avg_hold_days: number | null;
  avg_unrealized_per_card_cents: number | null;
  /** Liquid cash the business holds (manual balance + sale/trade cash flow). */
  cash_on_hand_cents: number;
  /** Total business value = estimated inventory value + cash on hand. */
  total_business_value_cents: number;
  /**
   * Mark-to-market gain from trades that is deferred into received cards' basis
   * and not yet booked into P&L (recognized later when those cards sell). Shown
   * separately so trade value gains are visible without being counted twice.
   */
  unrealized_trade_gain_cents: number;
};

export type Velocity = {
  turn_rate_annualized: number | null; // COGS_TTM / avg_inventory_value
  avg_hold_days: number | null;        // active inventory
  avg_days_to_sell: number | null;     // sold items, last 180d
  sell_through_pct: number | null;     // sold_last_90d / (sold_last_90d + active_count)
  sold_last_90d: number;
};

export type StaleAlert = {
  cost_basis_cents: number;
  estimated_value_cents: number;
  count: number;
  avg_age_days: number | null;
};

export type FinancialsSummary = {
  snapshot: Snapshot;
  velocity: Velocity;
  totals: {
    last_30d: PeriodTotals;
    prev_30d: PeriodTotals;
    mtd: PeriodTotals;
    ytd: PeriodTotals;
  };
  monthly: MonthBucket[];
  daily: DayBucket[];
  cashflow: CashFlow;
  channels_90d: ChannelBreakdown[];
  inventory: {
    active_count: number;
    total_cost_basis_cents: number;
    total_estimated_value_cents: number;
    unrealized_pnl_cents: number;
    aging: AgingBucket[];
    stale: StaleAlert;
  };
  winners: CardPerformance[];
  losers: CardPerformance[];
};

function toInt(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function emptyPeriod(): PeriodTotals {
  return {
    revenue_cents: 0,
    cogs_cents: 0,
    fees_cents: 0,
    shipping_cost_cents: 0,
    profit_cents: 0,
    sales_count: 0,
    margin_pct: null,
    avg_order_value_cents: null,
  };
}

function aggregatePeriod(
  rows: SaleRow[],
  from: Date,
  to: Date,
  trades: TradeRow[] = []
): PeriodTotals {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const totals = emptyPeriod();
  for (const row of rows) {
    const t = new Date(row.sold_at).getTime();
    if (t < fromMs || t >= toMs) continue;
    const revenue =
      toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    totals.revenue_cents += revenue;
    totals.cogs_cents += toInt(row.cogs_cents);
    totals.fees_cents += toInt(row.platform_fees_cents);
    totals.shipping_cost_cents += toInt(row.shipping_cost_cents);
    totals.profit_cents += toInt(row.profit_cents);
    totals.sales_count += 1;
  }
  // Trades recognized in P&L: only the non-deferrable cash gain/loss.
  for (const trade of trades) {
    const t = new Date(trade.traded_at).getTime();
    if (t < fromMs || t >= toMs) continue;
    const rec = tradeRecognition(trade);
    if (!rec) continue;
    totals.revenue_cents += rec.revenue_cents;
    totals.cogs_cents += rec.cogs_cents;
    totals.profit_cents += rec.profit_cents;
    totals.sales_count += 1;
  }
  if (totals.revenue_cents > 0) {
    totals.margin_pct = (totals.profit_cents / totals.revenue_cents) * 100;
  }
  if (totals.sales_count > 0) {
    totals.avg_order_value_cents = Math.round(
      totals.revenue_cents / totals.sales_count
    );
  }
  return totals;
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildMonthBuckets(
  rows: SaleRow[],
  now: Date,
  trades: TradeRow[] = []
): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    buckets.set(key, {
      month: key,
      revenue_cents: 0,
      cogs_cents: 0,
      fees_cents: 0,
      profit_cents: 0,
      sales_count: 0,
    });
  }
  for (const row of rows) {
    const d = new Date(row.sold_at);
    const key = monthKey(d);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.revenue_cents +=
      toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    bucket.cogs_cents += toInt(row.cogs_cents);
    bucket.fees_cents += toInt(row.platform_fees_cents);
    bucket.profit_cents += toInt(row.profit_cents);
    bucket.sales_count += 1;
  }
  for (const trade of trades) {
    const bucket = buckets.get(monthKey(new Date(trade.traded_at)));
    if (!bucket) continue;
    const rec = tradeRecognition(trade);
    if (!rec) continue;
    bucket.revenue_cents += rec.revenue_cents;
    bucket.cogs_cents += rec.cogs_cents;
    bucket.profit_cents += rec.profit_cents;
    bucket.sales_count += 1;
  }
  return Array.from(buckets.values());
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Daily P&L buckets for the trailing `days` window. Mirrors buildMonthBuckets
 * but at day resolution so the trend chart can follow short timeframes
 * (Last 30d / MTD) instead of always showing the 12-month view.
 */
function buildDayBuckets(
  rows: SaleRow[],
  now: Date,
  trades: TradeRow[] = [],
  days = 35
): DayBucket[] {
  const buckets = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)
    );
    const key = dayKey(d);
    buckets.set(key, {
      day: key,
      revenue_cents: 0,
      cogs_cents: 0,
      fees_cents: 0,
      profit_cents: 0,
      sales_count: 0,
    });
  }
  for (const row of rows) {
    const bucket = buckets.get(dayKey(new Date(row.sold_at)));
    if (!bucket) continue;
    bucket.revenue_cents +=
      toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    bucket.cogs_cents += toInt(row.cogs_cents);
    bucket.fees_cents += toInt(row.platform_fees_cents);
    bucket.profit_cents += toInt(row.profit_cents);
    bucket.sales_count += 1;
  }
  for (const trade of trades) {
    const bucket = buckets.get(dayKey(new Date(trade.traded_at)));
    if (!bucket) continue;
    const rec = tradeRecognition(trade);
    if (!rec) continue;
    bucket.revenue_cents += rec.revenue_cents;
    bucket.cogs_cents += rec.cogs_cents;
    bucket.profit_cents += rec.profit_cents;
    bucket.sales_count += 1;
  }
  return Array.from(buckets.values());
}

/**
 * Monthly cash flow: actual cash received from sales (net of fees/shipping)
 * minus cash spent acquiring inventory, bucketed by trailing 12 months.
 * This is distinct from accrual profit — it tracks real money in/out.
 */
function buildCashFlow(
  sales: SaleRow[],
  inventory: InventoryRow[],
  now: Date,
  trades: TradeRow[] = []
): CashFlow {
  const buckets = new Map<string, CashFlowBucket>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    buckets.set(key, {
      month: key,
      cash_in_cents: 0,
      cash_out_cents: 0,
      net_cents: 0,
    });
  }

  // Cash in — prefer the actual net payout; fall back to gross less fees/shipping.
  for (const row of sales) {
    const bucket = buckets.get(monthKey(new Date(row.sold_at)));
    if (!bucket) continue;
    const netPayout = toInt(row.net_payout_cents);
    const cashIn =
      netPayout !== 0
        ? netPayout
        : toInt(row.sold_price_cents) +
          toInt(row.shipping_charged_cents) -
          toInt(row.platform_fees_cents) -
          toInt(row.shipping_cost_cents);
    bucket.cash_in_cents += cashIn;
  }

  // Cash out — cost basis of inventory acquired in the month. Skip
  // trade-acquired cards: their basis is rolled over from the trade, not cash
  // spent — the real cash for a trade is its cash_paid, added below.
  for (const row of inventory) {
    if (row.acquisition_type === "trade") continue;
    const acquired = row.acquisition_date
      ? new Date(row.acquisition_date)
      : new Date(row.created_at);
    const bucket = buckets.get(monthKey(acquired));
    if (!bucket) continue;
    bucket.cash_out_cents += toInt(row.cost_basis_total_cents);
  }

  // Trades move real cash regardless of how the gain is recognized: cash
  // received is money in, cash paid is money out, bucketed by trade date.
  for (const trade of trades) {
    const bucket = buckets.get(monthKey(new Date(trade.traded_at)));
    if (!bucket) continue;
    bucket.cash_in_cents += trade.cash_in_cents;
    bucket.cash_out_cents += trade.cash_out_cents;
  }

  for (const bucket of buckets.values()) {
    bucket.net_cents = bucket.cash_in_cents - bucket.cash_out_cents;
  }

  const monthly = Array.from(buckets.values());
  const curKey = monthKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  );
  const prevKey = monthKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  );
  const cur = buckets.get(curKey);
  const prev = buckets.get(prevKey);

  return {
    monthly,
    current_month_net_cents: cur?.net_cents ?? 0,
    prev_month_net_cents: prev?.net_cents ?? 0,
    current_month_in_cents: cur?.cash_in_cents ?? 0,
    current_month_out_cents: cur?.cash_out_cents ?? 0,
  };
}

function buildChannelBreakdown(
  rows: SaleRow[],
  cutoff: Date,
  trades: TradeRow[] = []
): ChannelBreakdown[] {
  const map = new Map<string, ChannelBreakdown>();
  const cutoffMs = cutoff.getTime();
  const ensure = (channel: string): ChannelBreakdown => {
    if (!map.has(channel)) {
      map.set(channel, {
        channel,
        revenue_cents: 0,
        profit_cents: 0,
        sales_count: 0,
        margin_pct: null,
      });
    }
    return map.get(channel)!;
  };
  for (const row of rows) {
    if (new Date(row.sold_at).getTime() < cutoffMs) continue;
    const entry = ensure((row.channel || "other").toLowerCase());
    entry.revenue_cents +=
      toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    entry.profit_cents += toInt(row.profit_cents);
    entry.sales_count += 1;
  }
  // Recognized trade gains show up as their own "trade" channel.
  for (const trade of trades) {
    if (new Date(trade.traded_at).getTime() < cutoffMs) continue;
    const rec = tradeRecognition(trade);
    if (!rec) continue;
    const entry = ensure("trade");
    entry.revenue_cents += rec.revenue_cents;
    entry.profit_cents += rec.profit_cents;
    entry.sales_count += 1;
  }
  const out = Array.from(map.values());
  for (const entry of out) {
    if (entry.revenue_cents > 0) {
      entry.margin_pct = (entry.profit_cents / entry.revenue_cents) * 100;
    }
  }
  // Sort by profit descending (highest contributors first).
  out.sort((a, b) => b.profit_cents - a.profit_cents);
  return out;
}

function pickEstimatedValueCents(row: InventoryRow): number {
  return (
    toInt(row.current_market_value_cents) ||
    toInt(row.est_cmv) ||
    toInt(row.estimated_cmv) ||
    0
  );
}

function isActive(status: string | null): boolean {
  if (!status) return true;
  return status !== "sold" && status !== "returned" && status !== "traded";
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor(
    (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function buildInventory(rows: InventoryRow[], now: Date): {
  aging: AgingBucket[];
  snapshot: Snapshot;
  stale: StaleAlert;
} {
  const buckets: AgingBucket[] = [
    { label: "0-30", count: 0, cost_basis_cents: 0, estimated_value_cents: 0 },
    { label: "31-60", count: 0, cost_basis_cents: 0, estimated_value_cents: 0 },
    { label: "61-90", count: 0, cost_basis_cents: 0, estimated_value_cents: 0 },
    { label: "90+", count: 0, cost_basis_cents: 0, estimated_value_cents: 0 },
  ];

  let active = 0;
  let totalCost = 0;
  let totalValue = 0;
  let totalHoldDays = 0;
  let staleAgeSum = 0;

  for (const row of rows) {
    if (!isActive(row.status)) continue;
    active += 1;
    const cost = toInt(row.cost_basis_total_cents);
    const value = pickEstimatedValueCents(row);
    totalCost += cost;
    totalValue += value;

    const acquired = row.acquisition_date
      ? new Date(row.acquisition_date)
      : new Date(row.created_at);
    const days = Math.max(0, daysBetween(now, acquired));
    totalHoldDays += days;

    let idx = 0;
    if (days > 90) {
      idx = 3;
      staleAgeSum += days;
    } else if (days > 60) idx = 2;
    else if (days > 30) idx = 1;
    buckets[idx].count += 1;
    buckets[idx].cost_basis_cents += cost;
    buckets[idx].estimated_value_cents += value;
  }

  const unrealized = totalValue - totalCost;
  const snapshot: Snapshot = {
    inventory_value_cents: totalValue,
    cost_basis_cents: totalCost,
    unrealized_pnl_cents: unrealized,
    unrealized_pnl_pct: totalCost > 0 ? (unrealized / totalCost) * 100 : null,
    active_count: active,
    avg_hold_days: active > 0 ? Math.round(totalHoldDays / active) : null,
    avg_unrealized_per_card_cents:
      active > 0 ? Math.round(unrealized / active) : null,
    // Cash is layered in by getFinancialsSummary, which has the account context.
    cash_on_hand_cents: 0,
    total_business_value_cents: totalValue,
    // Layered in by getFinancialsSummary, which has the trade ledger loaded.
    unrealized_trade_gain_cents: 0,
  };

  const stale: StaleAlert = {
    cost_basis_cents: buckets[3].cost_basis_cents,
    estimated_value_cents: buckets[3].estimated_value_cents,
    count: buckets[3].count,
    avg_age_days: buckets[3].count > 0
      ? Math.round(staleAgeSum / buckets[3].count)
      : null,
  };

  return { aging: buckets, snapshot, stale };
}

function buildVelocity(
  sales: SaleRow[],
  inventoryValueCents: number,
  activeCount: number,
  now: Date,
  avgHoldDaysInventory: number | null
): Velocity {
  const ttmStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const startMs = ttmStart.getTime();

  let cogsTtm = 0;
  let salesCountTtm = 0;
  let daysToSellSum = 0;
  let daysToSellCount = 0;
  let soldLast90 = 0;
  const last90Start = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  for (const row of sales) {
    const t = new Date(row.sold_at).getTime();
    if (t < startMs) continue;
    cogsTtm += toInt(row.cogs_cents);
    salesCountTtm += 1;
    if (t >= last90Start) soldLast90 += 1;
  }

  // avg_days_to_sell uses last 180d sales × inventory hold-time proxy
  // (we don't have acquisition_date on the sold row; use TTM avg hold as proxy).
  daysToSellSum = avgHoldDaysInventory ?? 0;
  daysToSellCount = avgHoldDaysInventory != null ? 1 : 0;

  const turn = inventoryValueCents > 0 && cogsTtm > 0
    ? cogsTtm / inventoryValueCents
    : null;

  const sellThroughDenom = soldLast90 + activeCount;
  const sellThrough = sellThroughDenom > 0
    ? (soldLast90 / sellThroughDenom) * 100
    : null;

  return {
    turn_rate_annualized: turn,
    avg_hold_days: avgHoldDaysInventory,
    avg_days_to_sell:
      daysToSellCount > 0 ? Math.round(daysToSellSum / daysToSellCount) : null,
    sell_through_pct: sellThrough,
    sold_last_90d: soldLast90,
  };
}

function buildWinnersLosers(rows: SaleRowWithCard[]): {
  winners: CardPerformance[];
  losers: CardPerformance[];
} {
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const performances: CardPerformance[] = [];
  for (const row of rows) {
    if (new Date(row.sold_at).getTime() < cutoff) continue;
    const revenue =
      toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    const cogs = toInt(row.cogs_cents);
    const profit = toInt(row.profit_cents);
    const roi = cogs > 0 ? (profit / cogs) * 100 : null;
    performances.push({
      title: row.card_title?.trim() || row.card_player?.trim() || "Untitled card",
      channel: (row.channel || "other").toLowerCase(),
      sold_at: row.sold_at,
      revenue_cents: revenue,
      cogs_cents: cogs,
      profit_cents: profit,
      roi_pct: roi,
    });
  }

  const winners = [...performances]
    .filter((p) => p.profit_cents > 0)
    .sort((a, b) => b.profit_cents - a.profit_cents)
    .slice(0, 5);

  const losers = [...performances]
    .filter((p) => p.profit_cents < 0)
    .sort((a, b) => a.profit_cents - b.profit_cents)
    .slice(0, 5);

  return { winners, losers };
}

export async function getFinancialsSummary(
  userId: string
): Promise<FinancialsSummary> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
  );
  const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prev30Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const last90Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const salesFrom =
    [twelveMonthsAgo, yearStart, oneYearAgo].sort(
      (a, b) => a.getTime() - b.getTime()
    )[0];

  const [salesRes, inventoryRes, tradesRes, cashBalanceCents] = await Promise.all([
    supabase
      .from("business_sales")
      .select(
        "sold_at,sold_price_cents,shipping_charged_cents,shipping_cost_cents,platform_fees_cents,tax_cents,net_payout_cents,cogs_cents,profit_cents,channel,inventory_item_id,inventory_item:collection_items(title,player_name,year)"
      )
      .eq("business_account_id", context.businessAccountId)
      .eq("is_deleted", false)
      .gte("sold_at", salesFrom.toISOString())
      .order("sold_at", { ascending: true }),
    supabase
      .from(BUSINESS_TABLE)
      .select(
        "id,title,player_name,year,cost_basis_total_cents,current_market_value_cents,estimated_cmv,est_cmv,acquisition_date,acquisition_type,created_at,status,channel"
      )
      .eq("user_id", userId)
      .eq("item_kind", BUSINESS_ITEM_KIND),
    supabase
      .from("business_trades")
      .select(TRADE_RECOGNITION_SELECT)
      .eq("business_account_id", context.businessAccountId)
      .eq("is_deleted", false)
      .gte("traded_at", salesFrom.toISOString()),
    getCashBalanceCents(supabase, context.businessAccountId),
  ]);

  type RawSale = SaleRow & {
    inventory_item?: {
      title?: string | null;
      player_name?: string | null;
      year?: string | null;
    } | null;
  };
  const saleRowsRaw: RawSale[] = (salesRes.data ?? []) as unknown as RawSale[];
  const saleRows: SaleRow[] = saleRowsRaw.map((r) => ({
    sold_at: r.sold_at,
    sold_price_cents: r.sold_price_cents,
    shipping_charged_cents: r.shipping_charged_cents,
    shipping_cost_cents: r.shipping_cost_cents,
    platform_fees_cents: r.platform_fees_cents,
    tax_cents: r.tax_cents,
    net_payout_cents: r.net_payout_cents,
    cogs_cents: r.cogs_cents,
    profit_cents: r.profit_cents,
    channel: r.channel,
    inventory_item_id: r.inventory_item_id,
  }));
  const saleRowsWithCard: SaleRowWithCard[] = saleRowsRaw.map((r) => ({
    sold_at: r.sold_at,
    sold_price_cents: r.sold_price_cents,
    shipping_charged_cents: r.shipping_charged_cents,
    shipping_cost_cents: r.shipping_cost_cents,
    platform_fees_cents: r.platform_fees_cents,
    tax_cents: r.tax_cents,
    net_payout_cents: r.net_payout_cents,
    cogs_cents: r.cogs_cents,
    profit_cents: r.profit_cents,
    channel: r.channel,
    inventory_item_id: r.inventory_item_id,
    card_title: r.inventory_item?.title ?? null,
    card_player: r.inventory_item?.player_name ?? null,
    card_year: r.inventory_item?.year ?? null,
  }));
  const inventoryRows: InventoryRow[] = (inventoryRes.data ?? []) as InventoryRow[];

  // Trades — gracefully degrade to none if the trade ledger isn't migrated yet.
  const rawTrades: RawTradeRow[] = tradesRes.error
    ? []
    : ((tradesRes.data ?? []) as unknown as RawTradeRow[]);
  const tradeRows: TradeRow[] = rawTrades.map(normalizeTradeRow);

  const last30 = aggregatePeriod(saleRows, last30Start, now, tradeRows);
  const prev30 = aggregatePeriod(saleRows, prev30Start, last30Start, tradeRows);
  const mtd = aggregatePeriod(saleRows, monthStart, now, tradeRows);
  const ytd = aggregatePeriod(saleRows, yearStart, now, tradeRows);

  const monthly = buildMonthBuckets(saleRows, now, tradeRows);
  const daily = buildDayBuckets(saleRows, now, tradeRows);
  const cashflow = buildCashFlow(saleRows, inventoryRows, now, tradeRows);
  const channels_90d = buildChannelBreakdown(saleRows, last90Start, tradeRows);
  const inv = buildInventory(inventoryRows, now);
  // Layer cash on hand into the snapshot now that we have the account context.
  inv.snapshot.cash_on_hand_cents = cashBalanceCents;
  inv.snapshot.total_business_value_cents =
    inv.snapshot.inventory_value_cents + cashBalanceCents;
  // Deferred (not-yet-booked) trade gains across the loaded trade window — the
  // mark-to-market value gained through trades that profit will recognize as the
  // received cards sell. Shown separately so it never double-counts P&L.
  inv.snapshot.unrealized_trade_gain_cents = sumDeferredTradeGains(
    tradeRows,
    salesFrom.getTime(),
    now.getTime()
  );

  const velocity = buildVelocity(
    saleRows,
    inv.snapshot.inventory_value_cents,
    inv.snapshot.active_count,
    now,
    inv.snapshot.avg_hold_days
  );

  const { winners, losers } = buildWinnersLosers(saleRowsWithCard);

  return {
    snapshot: inv.snapshot,
    velocity,
    totals: { last_30d: last30, prev_30d: prev30, mtd, ytd },
    monthly,
    daily,
    cashflow,
    channels_90d,
    inventory: {
      active_count: inv.snapshot.active_count,
      total_cost_basis_cents: inv.snapshot.cost_basis_cents,
      total_estimated_value_cents: inv.snapshot.inventory_value_cents,
      unrealized_pnl_cents: inv.snapshot.unrealized_pnl_cents,
      aging: inv.aging,
      stale: inv.stale,
    },
    winners,
    losers,
  };
}
