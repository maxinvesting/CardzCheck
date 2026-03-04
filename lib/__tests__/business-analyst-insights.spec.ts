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

const NOW = new Date("2026-06-01T00:00:00.000Z"); // items acquired 2025-01-01 are ~517 days old

describe("generateBusinessAnalystInsights", () => {
  it("returns empty actions for zero inventory", () => {
    const result = generateBusinessAnalystInsights([], NOW);
    expect(result.actions).toEqual([]);
    expect(result.summary.actionCount).toBe(0);
    expect(result.coverage.totalItems).toBe(0);
  });

  // -------------------------------------------------------------------------
  // LIST signal
  // -------------------------------------------------------------------------

  it("fires a LIST signal for unlisted items 60+ days with CMV above $15", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("a", {
          status: "unlisted",
          current_market_value_cents: 5000, // $50, above $15 threshold
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const listSignals = result.actions.filter((s) => s.type === "list");
    expect(listSignals).toHaveLength(1);
    expect(listSignals[0].title).toBe("Item a");
    expect(listSignals[0].daysHeld).toBeGreaterThanOrEqual(60);
    expect(listSignals[0].itemId).toBe("a");
  });

  it("does NOT fire a LIST signal when CMV is below $15", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("cheap", {
          status: "unlisted",
          current_market_value_cents: 1000, // $10, below $15 threshold
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const listSignals = result.actions.filter((s) => s.type === "list");
    expect(listSignals).toHaveLength(0);
  });

  it("does NOT fire a LIST signal when held fewer than 60 days", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("recent", {
          status: "unlisted",
          current_market_value_cents: 5000,
          acquisition_date: "2026-05-20", // only ~12 days before NOW
        }),
      ],
      NOW
    );

    const listSignals = result.actions.filter((s) => s.type === "list");
    expect(listSignals).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // REPRICE signal
  // -------------------------------------------------------------------------

  it("fires a REPRICE signal when CMV is 20%+ above list price", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("underpriced", {
          status: "listed",
          list_price_cents: 10000, // $100
          current_market_value_cents: 13000, // $130 — 30% above
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const repriceSignals = result.actions.filter((s) => s.type === "reprice");
    expect(repriceSignals).toHaveLength(1);
    expect(repriceSignals[0].detail).toContain("30%");
  });

  it("does NOT fire a REPRICE signal when gap is below 20%", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("close-priced", {
          status: "listed",
          list_price_cents: 10000, // $100
          current_market_value_cents: 11500, // $115 — only 15% above
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const repriceSignals = result.actions.filter((s) => s.type === "reprice");
    expect(repriceSignals).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // No "review" signal — prices above CMV are intentional
  // -------------------------------------------------------------------------

  it("does NOT fire any signal when list price exceeds CMV", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("high-listed", {
          status: "listed",
          list_price_cents: 20000, // $200 list
          current_market_value_cents: 15000, // $150 CMV — seller lists high intentionally
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    // Should NOT have a "review" or "reprice" signal for this case
    const reviewOrReprice = result.actions.filter(
      (s) => s.type === "reprice"
    );
    expect(reviewOrReprice).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Market Pulse
  // -------------------------------------------------------------------------

  it("fires market_pulse_gainer when CMV is 10%+ above cost basis", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("gainer", {
          status: "listed",
          cost_basis_total_cents: 10000,
          list_price_cents: 10000,
          current_market_value_cents: 12000, // 20% gain — above 10% threshold
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const gainers = result.actions.filter((s) => s.type === "market_pulse_gainer");
    expect(gainers).toHaveLength(1);
    expect(gainers[0].detail).toContain("20%");
  });

  it("fires market_pulse_loser when CMV is 10%+ below cost basis", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("loser", {
          status: "listed",
          cost_basis_total_cents: 10000,
          list_price_cents: 10000,
          current_market_value_cents: 8000, // 20% loss — above 10% threshold
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const losers = result.actions.filter((s) => s.type === "market_pulse_loser");
    expect(losers).toHaveLength(1);
    expect(losers[0].detail).toContain("20%");
  });

  it("does NOT fire market pulse when movement is under 10%", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("flat", {
          status: "listed",
          cost_basis_total_cents: 10000,
          list_price_cents: 10000,
          current_market_value_cents: 10500, // 5% — under threshold
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    const pulse = result.actions.filter(
      (s) => s.type === "market_pulse_gainer" || s.type === "market_pulse_loser"
    );
    expect(pulse).toHaveLength(0);
  });

  it("shows all qualifying market pulse items — no arbitrary top-3 limit", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem(`gainer-${i}`, {
        status: "listed",
        cost_basis_total_cents: 10000,
        list_price_cents: 10000,
        current_market_value_cents: 15000, // 50% gain
        acquisition_date: "2025-01-01",
      })
    );

    const result = generateBusinessAnalystInsights(items, NOW);
    const gainers = result.actions.filter((s) => s.type === "market_pulse_gainer");
    expect(gainers).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // Days Held
  // -------------------------------------------------------------------------

  it("includes daysHeld on every signal", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("a", {
          status: "unlisted",
          current_market_value_cents: 5000,
          acquisition_date: "2025-01-01",
        }),
      ],
      NOW
    );

    for (const signal of result.actions) {
      expect(signal).toHaveProperty("daysHeld");
      expect(typeof signal.daysHeld).toBe("number");
    }
  });

  it("sets daysHeld to null when acquisition date is missing", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("no-date", {
          status: "listed",
          list_price_cents: 10000,
          current_market_value_cents: 15000, // triggers reprice
          acquisition_date: null,
        }),
      ],
      NOW
    );

    const repriceSignals = result.actions.filter((s) => s.type === "reprice");
    expect(repriceSignals).toHaveLength(1);
    expect(repriceSignals[0].daysHeld).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Coverage metrics are preserved
  // -------------------------------------------------------------------------

  it("preserves coverage metrics", () => {
    const result = generateBusinessAnalystInsights(
      [
        makeItem("a", {
          status: "listed",
          list_price_cents: 10000,
          current_market_value_cents: 5000,
        }),
        makeItem("b", { status: "unlisted" }),
      ],
      NOW
    );

    expect(result.coverage.totalItems).toBe(2);
    expect(result.coverage.activeItems).toBe(2);
    expect(result.coverage.cmvCoveragePct).toBe(50);
    expect(result.coverage.listCoveragePct).toBe(50);
    expect(result.summary.unlistedActiveCount).toBe(1);
  });
});
