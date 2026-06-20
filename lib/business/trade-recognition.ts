/**
 * Shared trade-recognition engine.
 *
 * A single source of truth for how a recorded trade is recognized in P&L, used
 * by BOTH the Financials page (`getFinancialsSummary`) and the dashboard KPIs
 * (`getBusinessMetrics` / `getBusinessPeriodMetrics`). Keeping the math here is
 * what guarantees the dashboard's revenue/profit reconciles with the Financials
 * page for the same period — previously the dashboard counted only sales and
 * silently dropped trades, so the two surfaces disagreed.
 *
 * This module deliberately depends on nothing else in `lib/business` so it can
 * be imported from both `actions.ts` and `financials.ts` without a cycle.
 */

/** Columns to select from `business_trades` (with item directions) for recognition. */
export const TRADE_RECOGNITION_SELECT =
  "traded_at,cash_paid_cents,cash_received_cents,outgoing_basis_cents,incoming_basis_cents,trade_items:business_trade_items(direction)" as const;

/** Raw `business_trades` row joined with its `business_trade_items` directions. */
export type RawTradeRow = {
  traded_at: string;
  cash_paid_cents: number | null;
  cash_received_cents: number | null;
  outgoing_basis_cents: number | null;
  incoming_basis_cents: number | null;
  trade_items?: Array<{ direction: string | null }> | null;
};

/**
 * Normalized view of a recorded trade for the recognition math.
 * `cash_in` / `cash_out` are the real money that moved at trade time;
 * `has_incoming` distinguishes a card-for-card swap (gain deferred into the
 * received cards' basis) from a pure cards-for-cash disposal.
 */
export type RecognizableTrade = {
  traded_at: string;
  cash_in_cents: number; // cash received in the trade
  cash_out_cents: number; // cash paid out in the trade
  outgoing_basis_cents: number; // cost basis of cards given away
  has_incoming: boolean; // true if any card came back in the trade
};

function toInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Map a raw `business_trades` row (+ joined item directions) into the recognition shape. */
export function normalizeTradeRow(row: RawTradeRow): RecognizableTrade {
  return {
    traded_at: row.traded_at,
    cash_in_cents: toInt(row.cash_received_cents),
    cash_out_cents: toInt(row.cash_paid_cents),
    outgoing_basis_cents: toInt(row.outgoing_basis_cents),
    has_incoming: (row.trade_items ?? []).some((it) => it.direction === "in"),
  };
}

/**
 * How much of a trade should be recognized in P&L *now*, consistent with the
 * app's deferral model. Card-for-card swaps defer their gain into the received
 * cards' basis, so only the cash that can't be absorbed (cash received beyond
 * the basis given up) is recognized at trade time. A pure cards-for-cash
 * disposal (no card received) realizes the full gain or loss immediately, since
 * there's nothing to defer the basis into. Returns null when nothing is
 * recognized yet (the normal deferred case).
 */
export function tradeRecognition(
  t: RecognizableTrade
): { revenue_cents: number; cogs_cents: number; profit_cents: number } | null {
  const net = t.cash_in_cents - t.cash_out_cents - t.outgoing_basis_cents;
  const recognize = t.has_incoming ? net > 0 : true;
  if (!recognize) return null;
  return {
    revenue_cents: t.cash_in_cents,
    cogs_cents: t.cash_out_cents + t.outgoing_basis_cents,
    profit_cents: net,
  };
}

/** Recognized trade totals within the half-open window [fromMs, toMs). */
export function sumRecognizedTrades(
  trades: RecognizableTrade[],
  fromMs: number,
  toMs: number
): { revenue_cents: number; cogs_cents: number; profit_cents: number; sales_count: number } {
  let revenue = 0;
  let cogs = 0;
  let profit = 0;
  let count = 0;
  for (const trade of trades) {
    const t = new Date(trade.traded_at).getTime();
    if (Number.isNaN(t) || t < fromMs || t >= toMs) continue;
    const rec = tradeRecognition(trade);
    if (!rec) continue;
    revenue += rec.revenue_cents;
    cogs += rec.cogs_cents;
    profit += rec.profit_cents;
    count += 1;
  }
  return { revenue_cents: revenue, cogs_cents: cogs, profit_cents: profit, sales_count: count };
}
