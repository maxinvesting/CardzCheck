import { describe, it, expect } from "vitest";
import {
  normalizeTradeRow,
  tradeRecognition,
  sumRecognizedTrades,
  type RawTradeRow,
  type RecognizableTrade,
} from "@/lib/business/trade-recognition";

const trade = (over: Partial<RecognizableTrade> = {}): RecognizableTrade => ({
  traded_at: "2026-06-10T00:00:00.000Z",
  cash_in_cents: 0,
  cash_out_cents: 0,
  outgoing_basis_cents: 0,
  has_incoming: false,
  ...over,
});

describe("tradeRecognition", () => {
  it("defers a card-for-card swap whose gain isn't realized in cash", () => {
    // Cards out (basis 140500) for cards in, no net cash → nothing recognized yet.
    const rec = tradeRecognition(
      trade({ has_incoming: true, outgoing_basis_cents: 140500 })
    );
    expect(rec).toBeNull();
  });

  it("recognizes a card-for-card swap only for cash beyond the basis given up", () => {
    const rec = tradeRecognition(
      trade({ has_incoming: true, cash_in_cents: 20000, outgoing_basis_cents: 5000 })
    );
    expect(rec).toEqual({
      revenue_cents: 20000,
      cogs_cents: 5000,
      profit_cents: 15000,
    });
  });

  it("realizes the full loss of a pure cards-for-cash disposal immediately", () => {
    // No card came back (has_incoming false) → recognized even at a loss.
    const rec = tradeRecognition(
      trade({ has_incoming: false, cash_out_cents: 11000, outgoing_basis_cents: 11000 })
    );
    expect(rec).toEqual({
      revenue_cents: 0,
      cogs_cents: 22000,
      profit_cents: -22000,
    });
  });
});

describe("normalizeTradeRow", () => {
  it("maps raw columns and derives has_incoming from trade_items directions", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 4200,
      cash_received_cents: 7500,
      outgoing_basis_cents: 83000,
      incoming_basis_cents: 93000,
      trade_items: [{ direction: "in" }, { direction: "out" }],
    };
    expect(normalizeTradeRow(raw)).toEqual({
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_in_cents: 7500,
      cash_out_cents: 4200,
      outgoing_basis_cents: 83000,
      has_incoming: true,
    });
  });

  it("falls back to incoming_basis_cents when a swap has no 'in' item rows", () => {
    // Legacy single-card trades and partially-failed multi-card trades carry
    // incoming basis on the header without 'in' item rows. They are still swaps
    // (basis deferred into received cards), not disposals — booking the full
    // loss would be a phantom. has_incoming must fall back to the basis signal.
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 0,
      outgoing_basis_cents: 15000,
      incoming_basis_cents: 33100,
      trade_items: [{ direction: "out" }, { direction: "out" }],
    };
    expect(normalizeTradeRow(raw).has_incoming).toBe(true);
    // And the would-be phantom disposal loss is deferred, not recognized.
    expect(tradeRecognition(normalizeTradeRow(raw))).toBeNull();
  });

  it("treats a row with no incoming items and no incoming basis as a disposal", () => {
    const raw: RawTradeRow = {
      traded_at: "2026-06-03T00:00:00.000Z",
      cash_paid_cents: 0,
      cash_received_cents: 0,
      outgoing_basis_cents: 15000,
      incoming_basis_cents: 0,
      trade_items: [{ direction: "out" }],
    };
    expect(normalizeTradeRow(raw).has_incoming).toBe(false);
  });
});

describe("sumRecognizedTrades", () => {
  const from = Date.parse("2026-06-01T00:00:00.000Z");
  const to = Date.parse("2026-07-01T00:00:00.000Z");

  it("sums only recognized trades inside the half-open window", () => {
    const trades: RecognizableTrade[] = [
      // Recognized disposal inside window: profit -15000.
      trade({ traded_at: "2026-06-03T00:00:00.000Z", outgoing_basis_cents: 15000 }),
      // Deferred swap inside window: contributes nothing.
      trade({
        traded_at: "2026-06-19T00:00:00.000Z",
        has_incoming: true,
        outgoing_basis_cents: 88000,
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
