import { describe, expect, it } from "vitest";
import type { BusinessInventoryItem, BusinessSale, BusinessMetrics } from "@/types";
import { buildBusinessConsultantContext } from "@/lib/business/consultant-context";

function makeInventory(
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
    status: "listed",
    list_price_cents: 14000,
    current_market_value_cents: 13000,
    notes: null,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSale(
  id: string,
  overrides: Partial<BusinessSale> = {}
): BusinessSale {
  return {
    id,
    user_id: "user-1",
    inventory_item_id: "inv-1",
    sale_date: "2026-02-15",
    sale_price_cents: 20000,
    platform_fees_cents: 2500,
    shipping_charged_cents: 800,
    shipping_paid_cents: 1200,
    other_costs_cents: 0,
    net_proceeds_cents: 17100,
    profit_cents: 4500,
    order_id: null,
    buyer_handle: null,
    notes: null,
    created_at: "2026-02-15T00:00:00.000Z",
    updated_at: "2026-02-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildBusinessConsultantContext", () => {
  it("builds deterministic inventory and sales summaries", () => {
    const metrics: BusinessMetrics = {
      revenueMtd: 20000,
      revenueYtd: 20000,
      profitMtd: 4500,
      profitYtd: 4500,
      activeInventoryCount: 2,
    };

    const context = buildBusinessConsultantContext({
      inventory: [
        makeInventory("a", { status: "unlisted", list_price_cents: null, current_market_value_cents: null }),
        makeInventory("b", { notes: "[WAX]", quantity: 2, current_market_value_cents: 7000 }),
      ],
      sales: [makeSale("sale-1")],
      metrics,
      now: new Date("2026-02-20T00:00:00.000Z"),
    });

    expect(context.inventory_summary.active_items).toBe(2);
    expect(context.inventory_summary.unlisted_active_items).toBe(1);
    expect(context.inventory_summary.cmv_coverage_pct).toBe(50);
    expect(context.pricing_coverage.active_missing_cmv_count).toBe(1);
    expect(context.category_distribution.wax_count).toBe(1);
    expect(context.sales_summary.total_sales).toBe(1);
    expect(context.sales_summary.fee_burden_pct).toBe(12.5);
    expect(context.sales_summary.shipping_impact_cents).toBe(400);
  });
});
