import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessInventoryItem } from "@/types";
import {
  computeLedgerSummary,
  mapInventoryItemToLedgerRow,
  mapInventoryToLedgerRows,
  sortLedgerRows,
} from "@/lib/business/ledger-table";

function makeItem(overrides: Partial<BusinessInventoryItem> = {}): BusinessInventoryItem {
  return {
    id: "item-1",
    user_id: "user-1",
    business_account_id: "business-1",
    card_id: null,
    title: "2024 Topps Chrome Player Base",
    quantity: 1,
    acquisition_date: "2026-04-01",
    acquisition_type: "buy",
    cost_basis_total_cents: 5000,
    tax_cents: 0,
    shipping_cents: 0,
    fees_paid_cents: 0,
    condition_status: "graded",
    grading_company: "PSA",
    grade: "10",
    cert_number: null,
    location: null,
    channel: "ebay",
    status: "unlisted",
    list_price_cents: null,
    current_market_value_cents: null,
    image_url: null,
    user_image_url: null,
    notes: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ledger table mapping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses CMV before fallback values and computes line P&L", () => {
    const row = mapInventoryItemToLedgerRow(
      makeItem({
        quantity: 2,
        cost_basis_total_cents: 5000,
        current_market_value_cents: 3000,
        last_known_price_cents: 9000,
      })
    );

    expect(row.estimatedValueSource).toBe("cmv");
    expect(row.estimatedValueCents).toBe(6000);
    expect(row.pnlCents).toBe(1000);
    expect(row.daysHeld).toBe(30);
  });

  it("falls back to last known price when CMV is missing", () => {
    const row = mapInventoryItemToLedgerRow(
      makeItem({
        current_market_value_cents: null,
        last_known_price_cents: 4200,
      })
    );

    expect(row.estimatedValueSource).toBe("fallback");
    expect(row.estimatedValueCents).toBe(4200);
    expect(row.pnlCents).toBe(-800);
  });

  it("computes spread only when own price and market floor are both available", () => {
    const withMarket = mapInventoryItemToLedgerRow(
      makeItem({
        status: "listed",
        list_price_cents: 11000,
        lowest_listing_cents: 10000,
      })
    );
    const withoutMarket = mapInventoryItemToLedgerRow(
      makeItem({
        status: "listed",
        list_price_cents: 11000,
      })
    );

    expect(withMarket.spreadPct).toBe(10);
    expect(withMarket.status).toBe("Listed");
    expect(withoutMarket.spreadPct).toBeNull();
  });

  it("summarizes quantity, cost, value, and covered P&L", () => {
    const rows = mapInventoryToLedgerRows([
      makeItem({
        id: "item-1",
        quantity: 2,
        cost_basis_total_cents: 5000,
        current_market_value_cents: 3000,
      }),
      makeItem({
        id: "item-2",
        quantity: 1,
        cost_basis_total_cents: 2000,
        current_market_value_cents: null,
      }),
    ]);

    expect(computeLedgerSummary(rows)).toEqual({
      inventoryCount: 3,
      totalCostBasisCents: 7000,
      totalEstimatedValueCents: 6000,
      estimatedPnlCents: 1000,
    });
  });

  it("sorts by value descending by default with null values last", () => {
    const rows = mapInventoryToLedgerRows([
      makeItem({ id: "low", title: "Beta", current_market_value_cents: 1000 }),
      makeItem({ id: "none", title: "Alpha", current_market_value_cents: null }),
      makeItem({ id: "high", title: "Gamma", current_market_value_cents: 9000 }),
    ]);

    expect(
      sortLedgerRows(rows, { column: "cmv", direction: "desc" }).map((r) => r.id)
    ).toEqual(["high", "low", "none"]);
    expect(
      sortLedgerRows(rows, { column: "cmv", direction: "asc" }).map((r) => r.id)
    ).toEqual(["low", "high", "none"]);
    // null value still sorts last even ascending.
  });

  it("sorts by P&L, cost, and name", () => {
    const rows = mapInventoryToLedgerRows([
      makeItem({ id: "a", title: "Zebra", cost_basis_total_cents: 1000, current_market_value_cents: 5000 }),
      makeItem({ id: "b", title: "Apple", cost_basis_total_cents: 9000, current_market_value_cents: 9500 }),
    ]);

    expect(
      sortLedgerRows(rows, { column: "pnl", direction: "desc" }).map((r) => r.id)
    ).toEqual(["a", "b"]);
    expect(
      sortLedgerRows(rows, { column: "cost", direction: "desc" }).map((r) => r.id)
    ).toEqual(["b", "a"]);
    expect(
      sortLedgerRows(rows, { column: "card", direction: "asc" }).map((r) => r.id)
    ).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const rows = mapInventoryToLedgerRows([
      makeItem({ id: "x", current_market_value_cents: 100 }),
      makeItem({ id: "y", current_market_value_cents: 900 }),
    ]);
    const before = rows.map((r) => r.id);
    sortLedgerRows(rows, { column: "cmv", direction: "desc" });
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});
