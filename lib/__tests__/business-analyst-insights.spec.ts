import { describe, expect, it } from "vitest";
import type { BusinessInventoryItem } from "@/types";
import { generateBusinessAnalystInsights } from "@/lib/business/analyst-insights";

function makeItem(
  id: string,
  overrides: Partial<BusinessInventoryItem> = {}
): BusinessInventoryItem {
  return {
    id,
    user_id: "user-1",
    card_id: null,
    title: `Item ${id}`,
    quantity: 1,
    acquisition_date: "2025-01-01",
    acquisition_type: "buy",
    cost_basis_total_cents: 10000,
    tax_cents: 0,
    shipping_cents: 0,
    fees_paid_cents: 0,
    condition_status: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    location: null,
    channel: "ebay",
    status: "unlisted",
    list_price_cents: null,
    current_market_value_cents: null,
    notes: null,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("generateBusinessAnalystInsights", () => {
  it("adds opportunity and uncertainty language when data is missing", () => {
    const result = generateBusinessAnalystInsights([
      makeItem("a", { status: "unlisted", list_price_cents: null, current_market_value_cents: null }),
    ]);

    expect(
      result.listingOpportunities.some((line) => line.includes("currently unlisted"))
    ).toBe(true);
    expect(
      result.profitSignals.some((line) => line.includes("Profit estimates unavailable"))
    ).toBe(true);
  });

  it("returns highest estimated profit potential from deterministic inputs", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("a", {
          title: "Base Candidate",
          status: "listed",
          cost_basis_total_cents: 10000,
          list_price_cents: 13000,
        }),
        makeItem("b", {
          title: "Jayden Daniels Prizm Silver",
          status: "listed",
          cost_basis_total_cents: 9000,
          list_price_cents: 16500,
        }),
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(
      result.profitSignals.some((line) =>
        line.includes("Jayden Daniels Prizm Silver")
      )
    ).toBe(true);
    expect(result.profitSignals.some((line) => line.includes("$75.00"))).toBe(true);
  });

  it("flags wax concentration and CMV coverage risk", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("a", {
          title: "Wax Case",
          status: "listed",
          notes: "[WAX]",
          cost_basis_total_cents: 56000,
          list_price_cents: 65000,
        }),
        makeItem("b", {
          title: "Card Single",
          status: "listed",
          cost_basis_total_cents: 44000,
          list_price_cents: 50000,
        }),
      ],
      new Date("2026-02-20T00:00:00.000Z")
    );

    expect(
      result.inventoryRisks.some((line) =>
        line.includes("No comps / CMV available")
      )
    ).toBe(true);
    expect(
      result.inventoryRisks.some(
        (line) => line.includes("concentrated in Wax") && line.includes("56%")
      )
    ).toBe(true);
  });
});
