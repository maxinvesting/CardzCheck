import { describe, expect, it } from "vitest";
import {
  cashDeltaForSetBalance,
  cashInForSale,
  cashOutForPurchase,
  computeCashBalance,
  netCashForTrade,
} from "@/lib/business/cash";

describe("cash money math", () => {
  it("sums non-deleted transactions for the balance", () => {
    const balance = computeCashBalance([
      { amount_cents: 10_000, is_deleted: false }, // opening balance
      { amount_cents: 4_250, is_deleted: false }, // sale proceeds
      { amount_cents: -3_000, is_deleted: false }, // cash paid in trade
      { amount_cents: 9_999, is_deleted: true }, // reversed → ignored
    ]);
    expect(balance).toBe(11_250);
  });

  it("returns zero for an empty ledger", () => {
    expect(computeCashBalance([])).toBe(0);
  });

  it("ignores non-finite amounts defensively", () => {
    const balance = computeCashBalance([
      { amount_cents: 500, is_deleted: false },
      { amount_cents: Number.NaN as unknown as number, is_deleted: false },
    ]);
    expect(balance).toBe(500);
  });

  it("computes the signed delta to set a balance", () => {
    expect(cashDeltaForSetBalance(10_000, 25_000)).toBe(15_000); // raise
    expect(cashDeltaForSetBalance(25_000, 10_000)).toBe(-15_000); // lower
    expect(cashDeltaForSetBalance(5_000, 5_000)).toBe(0); // no change
  });

  it("nets trade cash as received minus paid and fees", () => {
    expect(netCashForTrade(5_000, 2_000)).toBe(3_000); // received more
    expect(netCashForTrade(0, 4_000)).toBe(-4_000); // paid cash, got none
    expect(netCashForTrade(0, 4_000, 2_300)).toBe(-6_300); // paid cash + fee
    expect(netCashForTrade(1_000, 1_000)).toBe(0); // even cash
  });

  it("treats a sale's cash in as its net payout", () => {
    expect(cashInForSale(8_650)).toBe(8_650);
    expect(cashInForSale(null)).toBe(0);
    expect(cashInForSale(undefined)).toBe(0);
  });

  it("computes a purchase's cash out as the negated total outlay", () => {
    // cost only
    expect(cashOutForPurchase(5_000)).toBe(-5_000);
    // cost + tax + shipping + fees
    expect(cashOutForPurchase(5_000, 400, 350, 250)).toBe(-6_000);
    // nothing paid → no cash movement
    expect(cashOutForPurchase(0)).toBe(0);
    expect(cashOutForPurchase(null, null, null, null)).toBe(0);
    // defensive: non-finite fields are ignored, not NaN-propagated
    expect(cashOutForPurchase(1_000, Number.NaN as unknown as number)).toBe(-1_000);
  });
});
