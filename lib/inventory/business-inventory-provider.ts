/**
 * Phase 1 InventoryProvider implementation backed by business_inventory_items.
 *
 * This is a pure adapter — all DB logic stays in lib/business/actions.ts.
 * No Supabase calls are made here directly.
 */

import {
  getInventoryItem,
  updateInventoryItem,
  createInventoryItem,
  listInventory,
} from "@/lib/business/actions";
import type { BusinessInventoryItem } from "@/types";
import type {
  InventoryItemContext,
  InventoryProvider,
  EbayImportItemInput,
} from "./provider";

function toContext(item: BusinessInventoryItem): InventoryItemContext {
  return {
    id: item.id,
    source: "business_inventory_items",
    title: item.title,
    channel: item.channel ?? "other",
    cost_basis_total_cents: item.cost_basis_total_cents ?? 0,
    status: item.status ?? "unlisted",
    list_price_cents: item.list_price_cents ?? null,
    grade: item.grade ?? null,
    grading_company: item.grading_company ?? null,
    condition_status: item.condition_status ?? "raw",
    user_image_url: (item as any).user_image_url ?? null,
    notes: item.notes ?? null,
  };
}

function mapEbayToInventory(
  data: EbayImportItemInput
): Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at"> {
  return {
    title: data.title,
    quantity: 1,
    acquisition_type: data.acquisition_type ?? "buy",
    acquisition_date: null,
    // Store listed_price_cents as the list price; cost_basis unknown at import time
    cost_basis_total_cents: 0,
    tax_cents: 0,
    shipping_cents: 0,
    fees_paid_cents: 0,
    condition_status: data.condition_status ?? "raw",
    grading_company: data.grading_company ?? null,
    grade: data.grade ?? null,
    cert_number: data.cert_number ?? null,
    location: null,
    channel: "ebay",
    status: "listed",
    list_price_cents: data.listed_price_cents,
    current_market_value_cents: null,
    notes: data.notes ?? `Imported from eBay listing ${data.ebay_listing_id}`,
    card_id: null,
    // ebay_item_id is set via a separate direct update after insert
  } as any;
}

export const businessInventoryProvider: InventoryProvider = {
  source: "business_inventory_items",

  async getItem(userId, itemId) {
    const item = await getInventoryItem(userId, itemId);
    if (!item) return null;
    return toContext(item);
  },

  async updateStatus(userId, itemId, status) {
    await updateInventoryItem(userId, itemId, { status });
  },

  async createFromEbayData(userId, data) {
    const item = await createInventoryItem(userId, mapEbayToInventory(data));
    return toContext(item);
  },

  async listByStatus(userId, status, options) {
    const items = await listInventory(userId, { status });
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 200;
    return items.slice(offset, offset + limit).map(toContext);
  },
};
