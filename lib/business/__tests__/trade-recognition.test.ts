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

// Mark-to-market model: a trade books its full gain now.
//   profit = (cash received + fair value of cards received)
//            − (basis of cards given up + cash paid + fees)
describe("tradeRecognition", () => {
  it("books the full gain of a card-for-card + cash trade at trade time", () => {
    // The real-world case: gave a card (basis $1,749.56) worth $2,100 for a
    // $1,300 card + $800 cash − $115 fee. True gain = $235.44.
    const rec = tradeRecognition(
      trade({
        has_incoming: true,
        cash_in_cents: 80000,
        fees_cents: 11500,
        outgoing_basis_cents: 174956,
        incoming_fair_cents: 130000,
      })
    );
    expect(rec).toEqual({
      revenue_cents: 210000, // 130000 card + 80000 cash received
      cogs_cents: 186456, // 174956 basis + 11500 fee
      profit_cents: 23544, // $235.44
    });
  });

  it("recognizes the appreciation on a no-cash even swap now", () => {
    // Gave a $140,500-basis card for a card worth $200,000, no cash → book the
    // $59,500 appreciation now (nothing is deferred).
    const rec = tradeRecognition(
      trade({ has_incoming: true, outgoing_basis_cents: 140500, incoming_fair_cents: 200000 })
    );
    expect(rec).toEqual({
      revenue_cents: 200000,
      cogs_cents: 140500,
      profit_cents: 59500,
    });
  });

  it("expenses the trade fee against the gain", () => {
    const rec = tradeRecognition(
      trade({
        has_incoming: true,
        cash_in_cents: 25000,
        fees_cents: 2000,
        outgoing_basis_cents: 60000,
        incoming_fair_cents: 40000,
      })
    );
    expect(rec).toEqual({
      revenue_cents: 65000, // 40000 card + 25000 cash
      cogs_cents: 62000, // 60000 basis + 2000 fee
      profit_cents: 3000,
    });
  });

  it("realizes the full loss of a pure cards-for-cash disposal immediately", () => {
    // No card came back → recognized even at a loss.
    const rec = tradeRecognition(
      trade({ has_incoming: false, cash_out_cents: 11000, outgoing_basis_cents: 11000 })
    );
    expect(rec).toEqual({
      revenue_cents: 0,
      cogs_cents: 22000,
      profit_cents: -22000,
    });
  });

  it("realizes the gain of a cards-for-cash disposal", () => {
    const rec = tradeRecognition(
      trade({ has_incoming: false, cash_in_cents: 9000, outgoing_basis_cents: 5000 })
    );
    expect(rec).toEqual({
      revenue_cents: 9000,
      cogs_cents: 5000,
      profit_cents: 4000,
    });
  });

  it("returns null for a degenerate empty trade (no value either way)", () => {
    expect(tradeRecognition(trade())).toBeNull();
  });
});

describe("normalizeTradeRow", () => {
  it("maps raw columns and sums incoming fair value from 'in' items", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 4200,
      cash_received_cents: 7500,
      outgoing_basis_cents: 83000,
      incoming_basis_cents: 90000,
      realized_gain_cents: 14500,
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
      mark_to_market_gain_cents: 14500,
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
    expect(normalizeTradeRow(raw).has_incoming).toBe(true);
    // No 'in' item rows → incoming fair is 0, so the recognized figure falls back
    // to the outgoing basis as a loss (legacy rows carry no fair value to book).
    expect(normalizeTradeRow(raw).incoming_fair_cents).toBe(0);
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

  it("sums recognized trades inside the half-open window (swaps included)", () => {
    const trades: RecognizableTrade[] = [
      // Disposal inside window: profit -15000.
      trade({ traded_at: "2026-06-03T00:00:00.000Z", outgoing_basis_cents: 15000 }),
      // Swap inside window now books its gain: 100000 card − 88000 basis = 12000.
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
      revenue_cents: 100000,
      cogs_cents: 103000, // 15000 + 88000
      profit_cents: -3000, // -15000 + 12000
      sales_count: 2,
    });
  });

  it("excludes a trade exactly at the upper bound (half-open)", () => {
    const trades = [trade({ traded_at: "2026-07-01T00:00:00.000Z", outgoing_basis_cents: 500 })];
    expect(sumRecognizedTrades(trades, from, to).sales_count).toBe(0);
  });
});

describe("tradeDeferredGain", () => {
  it("is always 0 — the mark-to-market model defers nothing", () => {
    expect(
      tradeDeferredGain(
        trade({ has_incoming: true, incoming_fair_cents: 200000, outgoing_basis_cents: 88000 })
      )
    ).toBe(0);
    expect(tradeDeferredGain(trade({ has_incoming: false, cash_in_cents: 9000 }))).toBe(0);
  });
});

describe("sumDeferredTradeGains", () => {
  const from = Date.parse("2026-06-01T00:00:00.000Z");
  const to = Date.parse("2026-07-01T00:00:00.000Z");

  it("is 0 for any set of trades (nothing is deferred)", () => {
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
    ];
    expect(sumDeferredTradeGains(trades, from, to)).toBe(0);
  });
});

describe("recognizableFromBusinessTrade", () => {
  it("maps the client trade shape and sums incoming fair value from items", () => {
    const rec = recognizableFromBusinessTrade({
      traded_at: "2026-07-02T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 25000,
      outgoing_basis_cents: 69375,
      incoming_basis_cents: 65000,
      realized_gain_cents: 20625,
      items: [
        { direction: "in", fair_value_cents: 65000 },
        { direction: "out", fair_value_cents: 90000 },
      ],
    });
    // Books now: (65000 card + 25000 cash) − 69375 basis = 20625.
    expect(tradeRecognition(rec)).toEqual({
      revenue_cents: 90000,
      cogs_cents: 69375,
      profit_cents: 20625,
    });
    expect(tradeDeferredGain(rec)).toBe(0);
  });

  it("mirrors the real Veriswap trade: $235.44 booked now, nothing deferred", () => {
    const rec = recognizableFromBusinessTrade({
      traded_at: "2026-09-24T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 80000,
      fees_cents: 11500,
      outgoing_basis_cents: 174956,
      incoming_basis_cents: 130000,
      realized_gain_cents: 23544,
      items: [
        { direction: "in", fair_value_cents: 130000 },
        { direction: "out", fair_value_cents: 210000 },
      ],
    });
    expect(tradeRecognition(rec)?.profit_cents).toBe(23544);
    expect(tradeDeferredGain(rec)).toBe(0);
  });
});
