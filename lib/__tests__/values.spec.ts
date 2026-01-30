import { computeCollectionSummary, getDisplayValue } from "@/lib/values";
import type { CollectionItem } from "@/types";

function makeItem(partial: Partial<CollectionItem> & { id?: string }): CollectionItem {
  return {
    id: partial.id ?? "id-" + Math.random().toString(36).slice(2),
    user_id: "user-1",
    player_name: partial.player_name ?? "Player",
    players: partial.players ?? null,
    year: partial.year ?? null,
    set_name: partial.set_name ?? null,
    insert: partial.insert ?? null,
    grade: partial.grade ?? null,
    purchase_price: partial.purchase_price ?? null,
    purchase_date: partial.purchase_date ?? null,
    image_url: partial.image_url ?? null,
    notes: partial.notes ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
    est_cmv: (partial as any).est_cmv ?? null,
  };
}

describe("values helpers", () => {
  it("computes display_value with CMV preferred over cost basis", () => {
    const card: CollectionItem = makeItem({
      purchase_price: 100,
      // @ts-expect-error est_cmv is optional on CollectionItem
      est_cmv: 150,
    });

    expect(getDisplayValue(card as any)).toBe(150);
  });

  it("falls back to cost basis when CMV missing", () => {
    const card: CollectionItem = makeItem({
      purchase_price: 100,
      // no est_cmv
    });

    expect(getDisplayValue(card as any)).toBe(100);
  });

  it("uses CMV when only CMV is present", () => {
    const card: CollectionItem = makeItem({
      purchase_price: null,
      // @ts-expect-error est_cmv is optional on CollectionItem
      est_cmv: 150,
    });

    expect(getDisplayValue(card as any)).toBe(150);
  });

  it("computeCollectionSummary respects CMV vs cost basis and weighted PL%", () => {
    const cardA = makeItem({
      purchase_price: 100,
      // @ts-expect-error est_cmv is optional on CollectionItem
      est_cmv: 150,
    });
    const cardB = makeItem({
      purchase_price: 50,
      // @ts-expect-error est_cmv is optional on CollectionItem
      est_cmv: 40,
    });

    const summary = computeCollectionSummary([cardA as any, cardB as any]);

    // Collection Value = 150 + 40 = 190
    expect(summary.totalDisplayValue).toBeCloseTo(190);
    // Cost Basis = 100 + 50 = 150
    expect(summary.totalCostBasis).toBeCloseTo(150);
    // Unrealized P/L = (150-100) + (40-50) = 50 - 10 = 40
    expect(summary.totalUnrealizedPL).toBeCloseTo(40);
    // Unrealized P/L % = 40 / 150 = 0.2666...
    expect(summary.totalUnrealizedPLPct).toBeCloseTo(40 / 150);
  });

  it("handles cards without CMV in summary", () => {
    const cardWithCostOnly = makeItem({
      purchase_price: 100,
      // no est_cmv
    });
    const cardWithCmvOnly = makeItem({
      purchase_price: null,
      // @ts-expect-error est_cmv is optional on CollectionItem
      est_cmv: 150,
    });

    const summary = computeCollectionSummary([cardWithCostOnly as any, cardWithCmvOnly as any]);

    // Collection Value = CMV only: 0 + 150 = 150 (cost-only card contributes 0)
    expect(summary.totalDisplayValue).toBeCloseTo(150);
    expect(summary.totalCostBasis).toBeCloseTo(100);
    expect(summary.totalUnrealizedPL).toBeNull();
    expect(summary.totalUnrealizedPLPct).toBeNull();
  });
});

