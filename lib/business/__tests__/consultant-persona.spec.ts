import { describe, it, expect } from "vitest";
import { deriveConsultantPersona } from "@/lib/business/consultant-persona";
import type { BusinessInventoryItem, BusinessSale } from "@/types";

function item(overrides: Partial<BusinessInventoryItem>): BusinessInventoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: "u",
    business_account_id: "u",
    card_id: "c",
    title: "Card",
    player_name: null,
    year: null,
    set_name: null,
    insert_type: null,
    parallel_type: null,
    card_number: null,
    quantity: 1,
    acquisition_date: null,
    acquisition_type: "buy",
    cost_basis_total_cents: 0,
    tax_cents: 0,
    shipping_cents: 0,
    fees_paid_cents: 0,
    condition_status: "raw",
    grading_company: null,
    grade: null,
    cert_number: null,
    psa_cert_number: null,
    cert_image_status: null,
    cert_image_last_error: null,
    location: null,
    channel: "ebay",
    status: "listed",
    list_price_cents: null,
    current_market_value_cents: null,
    estimated_cmv: null,
    est_cmv: null,
    last_known_price_cents: null,
    last_price_cents: null,
    last_price: null,
    lowest_listing_cents: null,
    lowest_listing_price_cents: null,
    market_floor_cents: null,
    market_floor_price_cents: null,
    image_url: null,
    image_source: "none",
    user_image_url: null,
    notes: null,
    ebay_item_id: null,
    ebay_listing_url: null,
    item_kind: "inventory",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as BusinessInventoryItem;
}

describe("deriveConsultantPersona", () => {
  it("returns an empty-book message when there is nothing recorded", () => {
    const out = deriveConsultantPersona({ inventory: [], sales: [] });
    expect(out).toMatch(/no inventory or sales/i);
  });

  it("surfaces top players, graded mix and price band from real data", () => {
    const inventory = [
      item({ player_name: "Ohtani", condition_status: "graded", current_market_value_cents: 20000 }),
      item({ player_name: "Ohtani", condition_status: "graded", current_market_value_cents: 30000 }),
      item({ player_name: "Stroud", condition_status: "raw", current_market_value_cents: 10000 }),
    ];
    const out = deriveConsultantPersona({ inventory, sales: [] as BusinessSale[] });
    expect(out).toMatch(/Ohtani/);
    expect(out).toMatch(/67% graded/); // 2 of 3
    expect(out).toMatch(/Typical item value/);
    expect(out).not.toMatch(/CJ Stroud, Jayden Daniels/); // no hardcoded persona
  });

  it("excludes sold/traded items from the active picture", () => {
    const inventory = [
      item({ player_name: "A", status: "sold" }),
      item({ player_name: "B", status: "listed", current_market_value_cents: 5000 }),
    ];
    const out = deriveConsultantPersona({ inventory, sales: [] });
    expect(out).toMatch(/Active inventory: 1 item/);
  });
});
