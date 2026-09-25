import { describe, it, expect } from "vitest";
import {
  normalizeTradeRow,
  tradeRecognition,
  sumRecognizedTrades,
  tradeDeferredGain,
  sumDeferredTradeGains,
  recognizableFromBusinessTrade,
  type RawTradeRow,
  type RecognizableTrade,
} from "@/lib/business/trade-recognition";

const trade = (over: Partial<RecognizableTrade> = {}): RecognizableTrade => ({
  traded_at: "2026-06-10T00:00:00.000Z",
  cash_in_cents: 0,
  cash_out_cents: 0,
  fees_cents: 0,
  outgoing_basis_cents: 0,
  incoming_fair_cents: 0,
  has_incoming: false,
  mark_to_market_gain_cents: 0,
  ...over,
});

// Deferral model: a card-for-card trade books NO profit now — the gain rolls
// into the received cards' basis and realizes when those cards sell. Only cash
// received beyond the cost given up (or a pure cards-for-cash disposal) hits
// P&L at trade time.
describe("tradeRecognition", () => {
  it("defers a card-for-card + cash trade whose cash doesn't exceed the basis", () => {
    // The real Veriswap trade: gave a $1,749.56-basis card for a $1,300 card +
    // $800 cash − $115 fee. Cash ($800) < basis+fee ($1,864.56) → nothing now.
    const rec = tradeRecognition(
      trade({
        has_incoming: true,
        cash_in_cents: 80000,
        fees_cents: 11500,
        outgoing_basis_cents: 174956,
        incoming_fair_cents: 130000,
      })
    );
    expect(rec).toBeNull();
  });

  it("defers a no-cash even swap entirely", () => {
    const rec = tradeRecognition(
      trade({ has_incoming: true, outgoing_basis_cents: 140500, incoming_fair_cents: 200000 })
    );
    expect(rec).toBeNull();
  });

  it("recognizes only cash received in excess of the cost given up", () => {
    // Gave a $5,000-basis card for a $3,000 card + $10,000 cash. $5,000 of the
    // cash can't roll into a basis → realized now; the rest defers.
    const rec = tradeRecognition(
      trade({
        has_incoming: true,
        cash_in_cents: 10000,
        outgoing_basis_cents: 5000,
        incoming_fair_cents: 3000,
      })
    );
    expect(rec).toEqual({ revenue_cents: 5000, cogs_cents: 0, profit_cents: 5000 });
  });

  it("realizes the full loss of a pure cards-for-cash disposal immediately", () => {
    const rec = tradeRecognition(
      trade({ has_incoming: false, cash_out_cents: 11000, outgoing_basis_cents: 11000 })
    );
    expect(rec).toEqual({ revenue_cents: 0, cogs_cents: 22000, profit_cents: -22000 });
  });

  it("realizes the gain of a pure cards-for-cash disposal", () => {
    const rec = tradeRecognition(
      trade({ has_incoming: false, cash_in_cents: 9000, outgoing_basis_cents: 5000 })
    );
    expect(rec).toEqual({ revenue_cents: 9000, cogs_cents: 5000, profit_cents: 4000 });
  });
});

describe("tradeDeferredGain", () => {
  it("defers the whole gain of a card-for-card + cash trade (Veriswap)", () => {
    const t = trade({
      has_incoming: true,
      cash_in_cents: 80000,
      fees_cents: 11500,
      outgoing_basis_cents: 174956,
      incoming_fair_cents: 130000,
    });
    // (130000 + 80000) − (174956 + 11500) = 23544, none recognized now.
    expect(tradeDeferredGain(t)).toBe(23544);
    expect(tradeRecognition(t)?.profit_cents ?? 0).toBe(0);
  });

  it("recognized + deferred reconstructs the total gain when cash is in excess", () => {
    const t = trade({
      has_incoming: true,
      cash_in_cents: 10000,
      outgoing_basis_cents: 5000,
      incoming_fair_cents: 3000,
    });
    const recognized = tradeRecognition(t)?.profit_cents ?? 0;
    const totalGain = 3000 + 10000 - 5000; // 8000
    expect(recognized).toBe(5000);
    expect(tradeDeferredGain(t)).toBe(3000);
    expect(recognized + tradeDeferredGain(t)).toBe(totalGain);
  });

  it("defers nothing for a pure cards-for-cash disposal", () => {
    expect(tradeDeferredGain(trade({ has_incoming: false, cash_in_cents: 9000 }))).toBe(0);
  });
});

describe("normalizeTradeRow", () => {
  it("maps raw columns and sums incoming fair value from 'in' items", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 4200,
      cash_received_cents: 7500,
      outgoing_basis_cents: 83000,
      incoming_basis_cents: 79700,
      realized_gain_cents: 10300,
      trade_items: [
        { direction: "in", fair_value_cents: 90000 },
        { direction: "out", fair_value_cents: 100000 },
      ],
    };
    expect(normalizeTradeRow(raw)).toEqual({
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_in_cents: 7500,
      cash_out_cents: 4200,
      fees_cents: 0,
      outgoing_basis_cents: 83000,
      incoming_fair_cents: 90000,
      has_incoming: true,
      mark_to_market_gain_cents: 10300,
    });
  });

  it("derives has_incoming from a stale incoming_basis even without 'in' item rows", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 0,
      outgoing_basis_cents: 15000,
      incoming_basis_cents: 33100,
      realized_gain_cents: 18100,
      trade_items: [{ direction: "out" }, { direction: "out" }],
    };
    const rec = normalizeTradeRow(raw);
    expect(rec.has_incoming).toBe(true);
    // No cash and no 'in' item rows → nothing recognized now (deferred).
    expect(tradeRecognition(rec)).toBeNull();
  });

  it("treats a row with no incoming items and no incoming basis as a disposal", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 0,
      outgoing_basis_cents: 15000,
      incoming_basis_cents: 0,
      realized_gain_cents: -15000,
      trade_items: [{ direction: "out" }],
    };
    expect(normalizeTradeRow(raw).has_incoming).toBe(false);
  });
});

describe("sumRecognizedTrades", () => {
  const from = Date.parse("2026-06-01T00:00:00.000Z");
  const to = Date.parse("2026-07-01T00:00:00.000Z");

  it("counts disposals now and defers swaps (no double count)", () => {
    const trades: RecognizableTrade[] = [
      // Disposal inside window: profit -15000.
      trade({ traded_at: "2026-06-03T00:00:00.000Z", outgoing_basis_cents: 15000 }),
      // Card-for-card swap inside window: deferred → contributes nothing now.
      trade({
        traded_at: "2026-06-19T00:00:00.000Z",
        has_incoming: true,
        outgoing_basis_cents: 88000,
        incoming_fair_cents: 100000,
      }),
      // Recognized but BEFORE the window: excluded.
      trade({ traded_at: "2026-05-03T00:00:00.000Z", outgoing_basis_cents: 11000 }),
    ];
    expect(sumRecognizedTrades(trades, from, to)).toEqual({
      revenue_cents: 0,
      cogs_cents: 15000,
      profit_cents: -15000,
      sales_count: 1,
    });
  });

  it("excludes a trade exactly at the upper bound (half-open)", () => {
    const trades = [trade({ traded_at: "2026-07-01T00:00:00.000Z", outgoing_basis_cents: 500 })];
    expect(sumRecognizedTrades(trades, from, to).sales_count).toBe(0);
  });
});

describe("sumDeferredTradeGains", () => {
  const from = Date.parse("2026-06-01T00:00:00.000Z");
  const to = Date.parse("2026-07-01T00:00:00.000Z");

  it("sums deferred gains for in-window swaps only", () => {
    const trades: RecognizableTrade[] = [
      trade({
        traded_at: "2026-06-05T00:00:00.000Z",
        has_incoming: true,
        outgoing_basis_cents: 50000,
        incoming_fair_cents: 57000,
      }),
      trade({
        traded_at: "2026-06-20T00:00:00.000Z",
        has_incoming: true,
        outgoing_basis_cents: 30000,
        incoming_fair_cents: 27000,
      }),
      // Disposal contributes nothing (fully realized, not deferred).
      trade({ traded_at: "2026-06-21T00:00:00.000Z", has_incoming: false, cash_in_cents: 9000 }),
      // Out of window: excluded.
      trade({
        traded_at: "2026-05-21T00:00:00.000Z",
        has_incoming: true,
        outgoing_basis_cents: 1000,
        incoming_fair_cents: 6000,
      }),
    ];
    // (57000-50000) + (27000-30000) = 7000 + (-3000) = 4000.
    expect(sumDeferredTradeGains(trades, from, to)).toBe(4000);
  });
});

describe("recognizableFromBusinessTrade", () => {
  it("mirrors the real Veriswap trade: nothing booked now, $235.44 deferred to sale", () => {
    const rec = recognizableFromBusinessTrade({
      traded_at: "2026-09-24T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 80000,
      fees_cents: 11500,
      outgoing_basis_cents: 174956,
      incoming_basis_cents: 106456,
      realized_gain_cents: 23544,
      items: [
        { direction: "in", fair_value_cents: 130000 },
        { direction: "out", fair_value_cents: 210000 },
      ],
    });
    expect(tradeRecognition(rec)).toBeNull();
    expect(tradeDeferredGain(rec)).toBe(23544);
  });
});
