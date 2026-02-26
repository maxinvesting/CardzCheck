import { describe, expect, it } from "vitest";
import { computeNetPayout, computeProfit, formatMoney } from "@/lib/business/sales-utils";

describe("sales-utils", () => {
  it("computes net payout from gross - fees - shipping cost - tax", () => {
    const result = computeNetPayout({
      sold_price_cents: 20000,
      shipping_charged_cents: 1000,
      platform_fees_cents: 2500,
      shipping_cost_cents: 1200,
      tax_cents: 300,
    });

    expect(result).toBe(17000);
  });

  it("uses explicit net payout when provided", () => {
    const result = computeNetPayout({
      sold_price_cents: 20000,
      shipping_charged_cents: 1000,
      platform_fees_cents: 99999,
      net_payout_cents: 12345,
    });

    expect(result).toBe(12345);
  });

  it("defaults missing optional fields to zero", () => {
    expect(computeNetPayout({ sold_price_cents: 15000 })).toBe(15000);
  });

  it("computes profit from net payout and cogs", () => {
    expect(computeProfit({ net_payout_cents: 17000, cogs_cents: 12000 })).toBe(5000);
  });

  it("allows negative profit", () => {
    expect(computeProfit({ net_payout_cents: 8000, cogs_cents: 12000 })).toBe(-4000);
  });

  it("rounds non-integer input values to cents", () => {
    expect(
      computeNetPayout({
        sold_price_cents: 10000.4,
        shipping_charged_cents: 99.6,
        platform_fees_cents: 10.2,
        shipping_cost_cents: 3.6,
        tax_cents: 0.2,
      })
    ).toBe(10086);
  });

  it("formats money values", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(-450)).toBe("-$4.50");
  });
});
