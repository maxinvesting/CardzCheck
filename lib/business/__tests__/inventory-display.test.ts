import { describe, expect, it } from "vitest";
import {
  getInventoryImageCandidates,
  getInventoryCertUrl,
  hasInventoryImage,
} from "@/lib/business/inventory-display";
import type { BusinessInventoryItem } from "@/types";

function buildItem(
  overrides: Partial<BusinessInventoryItem> = {}
): BusinessInventoryItem {
  return {
    id: "item-1",
    user_id: "user-1",
    business_account_id: "biz-1",
    card_id: "card-1",
    title: "2024 Topps Chrome Prospect",
    quantity: 1,
    acquisition_date: "2026-04-01",
    acquisition_type: "buy",
    cost_basis_total_cents: 1000,
    tax_cents: 0,
    shipping_cents: 0,
    fees_paid_cents: 0,
    condition_status: "graded",
    grading_company: "PSA",
    grade: "10",
    cert_number: "12345678",
    psa_cert_number: "12345678",
    location: null,
    channel: "other",
    status: "unlisted",
    list_price_cents: null,
    current_market_value_cents: null,
    image_source: "none",
    image_url: null,
    trusted_image: null,
    user_image_url: null,
    card_images: null,
    primary_image: null,
    stock_image_url: null,
    ebay_image_url: null,
    notes: null,
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getInventoryImageCandidates", () => {
  it("prefers hydrated PSA candidates before legacy fallback fields", () => {
    const item = buildItem({
      image_source: "psa",
      image_url: "https://legacy.example/psa.jpg",
      trusted_image: {
        source: "psa",
        frontUrl: "https://psa.example/front.jpg",
        backUrl: "https://psa.example/back.jpg",
        frontCandidates: [
          "https://psa.example/front.jpg",
          "https://user.example/front.jpg",
        ],
        backCandidates: ["https://psa.example/back.jpg"],
        hasFallbackCta: false,
      },
      user_image_url: "https://user.example/front.jpg",
      stock_image_url: "https://stock.example/front.jpg",
      ebay_image_url: "https://ebay.example/front.jpg",
    });

    expect(getInventoryImageCandidates(item)).toEqual([
      "https://psa.example/front.jpg",
      "https://user.example/front.jpg",
      "https://legacy.example/psa.jpg",
      "https://stock.example/front.jpg",
      "https://ebay.example/front.jpg",
    ]);
  });

  it("falls back to stored primary and user images when trusted PSA data is absent", () => {
    const item = buildItem({
      primary_image: {
        id: "img-1",
        card_id: "card-1",
        user_id: "user-1",
        storage_path: "",
        url: "https://storage.example/primary.jpg",
        label: "front",
        position: 0,
        created_at: "2026-04-01T00:00:00.000Z",
      },
      user_image_url: "https://user.example/front.jpg",
    });

    expect(getInventoryImageCandidates(item)).toEqual([
      "https://storage.example/primary.jpg",
      "https://user.example/front.jpg",
    ]);
  });

  it("provides a PSA cert page fallback when no image is available", () => {
    const item = buildItem({
      image_url: "https://cert-images.psa.com/12345678/large/12345678_f.jpg",
      image_source: "psa",
      trusted_image: {
        source: "none",
        frontUrl: null,
        backUrl: null,
        frontCandidates: [],
        backCandidates: [],
        hasFallbackCta: true,
      },
    });

    expect(getInventoryImageCandidates(item)).toEqual([]);
    expect(hasInventoryImage(item)).toBe(false);
    expect(getInventoryCertUrl(item)).toBe("https://www.psacard.com/cert/12345678/psa");
  });
});
