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
  "traded_at,cash_paid_cents,cash_received_cents,fees_cents,outgoing_basis_cents,incoming_basis_cents,realized_gain_cents,trade_items:business_trade_items(direction)" as const;

/** Raw `business_trades` row joined with its `business_trade_items` directions. */
export type RawTradeRow = {
  traded_at: string;
  cash_paid_cents: number | null;
  cash_received_cents: number | null;
  fees_cents?: number | null;
  outgoing_basis_cents: number | null;
  incoming_basis_cents: number | null;
  realized_gain_cents: number | null;
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
  fees_cents: number; // trade fee paid — expensed into realized P&L at trade time
  outgoing_basis_cents: number; // cost basis of cards given away
  has_incoming: boolean; // true if any card came back in the trade
  /**
   * Mark-to-market gain stored on the trade at record time
   * (outgoing fair value + cash received − cash paid − outgoing basis).
   * This is the figure the Sales & Trades page surfaces as "Realized gain".
   * It is NOT booked into P&L directly — `tradeRecognition` decides how much
   * is recognized now vs deferred into received cards' basis.
   */
  mark_to_market_gain_cents: number;
};

function toInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Map a raw `business_trades` row (+ joined item directions) into the recognition shape.
 *
 * `has_incoming` is normally derived from the presence of a `direction='in'`
 * trade_item, but it ALSO falls back to `incoming_basis_cents > 0`. Some trades
 * carry incoming basis on the header without any `'in'` item rows: legacy
 * single-card trades (the original route wrote `incoming_basis = fair + cash_paid
 * − cash_received` but never captured an incoming card), and multi-card trades
 * where the non-atomic POST committed the header + outgoing rows but failed
 * before persisting the incoming inventory. In both cases the basis was carried
 * forward into received cards, so recognizing them as full cards-for-cash
 * disposals would book a phantom realized loss. A non-zero incoming basis means
 * value was deferred forward — never write it off as an immediate disposal.
 */
export function normalizeTradeRow(row: RawTradeRow): RecognizableTrade {
  return {
    traded_at: row.traded_at,
    cash_in_cents: toInt(row.cash_received_cents),
    cash_out_cents: toInt(row.cash_paid_cents),
    fees_cents: toInt(row.fees_cents),
    outgoing_basis_cents: toInt(row.outgoing_basis_cents),
    has_incoming:
      (row.trade_items ?? []).some((it) => it.direction === "in") ||
      toInt(row.incoming_basis_cents) > 0,
    mark_to_market_gain_cents: toInt(row.realized_gain_cents),
  };
}

/**
 * Client-facing trade shape used by the Sales & Trades page (`/api/business/trades`
 * returns `items`, not the joined `trade_items` of a raw select). Maps into the
 * recognition input so the trades table can show the SAME recognized/deferred
 * split the Financials P&L uses, instead of the raw mark-to-market gain.
 */
export type BusinessTradeLike = {
  traded_at: string;
  cash_paid_cents: number | null;
  cash_received_cents: number | null;
  fees_cents?: number | null;
  outgoing_basis_cents: number | null;
  incoming_basis_cents: number | null;
  realized_gain_cents: number | null;
  items?: Array<{ direction: string | null }> | null;
};

export function recognizableFromBusinessTrade(
  t: BusinessTradeLike
): RecognizableTrade {
  return {
    traded_at: t.traded_at,
    cash_in_cents: toInt(t.cash_received_cents),
    cash_out_cents: toInt(t.cash_paid_cents),
    fees_cents: toInt(t.fees_cents),
    outgoing_basis_cents: toInt(t.outgoing_basis_cents),
    has_incoming:
      (t.items ?? []).some((it) => it.direction === "in") ||
      toInt(t.incoming_basis_cents) > 0,
    mark_to_market_gain_cents: toInt(t.realized_gain_cents),
  };
}

/**
 * How much of a trade should be recognized in P&L *now*.
 *
 * Card-for-card swap: the net cash that changed hands minus any trade fee
 * (cash received − cash paid − fees) is realized immediately — it is real money
 * in or out of the business. The appreciation on the cards given up (outgoing
 * fair value − outgoing basis) is what defers into the received cards' basis
 * and realizes when they sell. A pure card swap with no cash and no fee
 * recognizes nothing now (fully deferred).
 *
 * Pure cards-for-cash disposal (no card received): there's nothing to defer the
 * basis into, so the full gain or loss (cash received − cash paid − fees −
 * basis given up) realizes immediately.
 *
 * Returns null when nothing is recognized (a swap with zero net cash and no fee).
 *
 * The identity `recognizedNow + deferred === mark_to_market` is preserved in
 * every case — `realized_gain_cents` (the stored mark-to-market) nets out the
 * fee too — so booking cash and fees here never double-counts against the
 * deferred basis gain; see `tradeDeferredGain`.
 */
export function tradeRecognition(
  t: RecognizableTrade
): { revenue_cents: number; cogs_cents: number; profit_cents: number } | null {
  if (t.has_incoming) {
    const netCash = t.cash_in_cents - t.cash_out_cents - t.fees_cents;
    if (netCash === 0) return null;
    return {
      revenue_cents: t.cash_in_cents,
      cogs_cents: t.cash_out_cents + t.fees_cents,
      profit_cents: netCash,
    };
  }
  const net =
    t.cash_in_cents - t.cash_out_cents - t.fees_cents - t.outgoing_basis_cents;
  return {
    revenue_cents: t.cash_in_cents,
    cogs_cents: t.cash_out_cents + t.fees_cents + t.outgoing_basis_cents,
    profit_cents: net,
  };
}

/**
 * The portion of a trade's mark-to-market gain that is NOT yet booked into P&L
 * — i.e. deferred into the received cards' cost basis and recognized later when
 * those cards sell. For a card-for-card swap this is the appreciation on the
 * cards given up (plus any deferred cash gain); for a pure cards-for-cash
 * disposal nothing is deferred (the whole gain is recognized at trade time), so
 * this is 0. By construction, `recognizedNow + deferred === mark_to_market`, so
 * showing booked profit alongside this figure double-counts nothing.
 */
export function tradeDeferredGain(t: RecognizableTrade): number {
  if (!t.has_incoming) return 0;
  const recognizedNow = tradeRecognition(t)?.profit_cents ?? 0;
  return t.mark_to_market_gain_cents - recognizedNow;
}

/** Sum of deferred (unrecognized) trade gains within [fromMs, toMs). */
export function sumDeferredTradeGains(
  trades: RecognizableTrade[],
  fromMs: number,
  toMs: number
): number {
  let deferred = 0;
  for (const trade of trades) {
    const t = new Date(trade.traded_at).getTime();
    if (Number.isNaN(t) || t < fromMs || t >= toMs) continue;
    deferred += tradeDeferredGain(trade);
  }
  return deferred;
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
