/**
 * InventoryProvider abstraction
 *
 * The eBay integration layer never references a specific Supabase table directly.
 * Instead it uses this interface, which is implemented by:
 *   - BusinessInventoryProvider  (Phase 1 — business_inventory_items)
 *   - CollectionItemsProvider    (future — collection_items with item_kind='inventory')
 *
 * Swapping Phase 1 → Phase 2 requires only changing the provider import in
 * lib/ebay/selling/event-handlers.ts and lib/ebay/selling/import.ts.
 */

/** Which underlying table this provider resolves items from. */
export type InventorySource =
  | "business_inventory_items"
  | "collection_items";

/** Minimal item shape the eBay integration needs. */
export type InventoryItemContext = {
  id: string;
  source: InventorySource;
  title: string;
  channel: string;
  cost_basis_total_cents: number;
  status: string;
  list_price_cents: number | null;
  grade: string | null;
  grading_company: string | null;
  condition_status: string;
  user_image_url: string | null;
  notes: string | null;
};

/** Input shape for creating a new inventory item from an eBay listing import. */
export type EbayImportItemInput = {
  title: string;
  ebay_listing_id: string;
  ebay_item_id: string;
  listed_price_cents: number;
  acquisition_type?: "buy" | "trade" | "rip" | "consignment" | "other";
  condition_status?: "raw" | "graded";
  grade?: string | null;
  grading_company?: string | null;
  cert_number?: string | null;
  image_url?: string | null;
  notes?: string | null;
};

export interface InventoryProvider {
  readonly source: InventorySource;

  /** Fetch a single item by ID. Returns null if not found or not owned by userId. */
  getItem(userId: string, itemId: string): Promise<InventoryItemContext | null>;

  /** Update the inventory status. Reuses existing normalizeStatus logic in the provider impl. */
  updateStatus(
    userId: string,
    itemId: string,
    status: "unlisted" | "listed" | "pending_sale" | "sold" | "returned"
  ): Promise<void>;

  /**
   * Create a new inventory item from eBay import data.
   * The provider implementation is responsible for mapping eBay fields to the
   * underlying table's schema (e.g. cost_basis_total_cents from listed_price_cents).
   */
  createFromEbayData(
    userId: string,
    data: EbayImportItemInput
  ): Promise<InventoryItemContext>;

  /**
   * List items by status, paginated. Used by the listing push flow to
   * enumerate un-listed inventory items.
   */
  listByStatus(
    userId: string,
    status: string,
    options?: { limit?: number; offset?: number }
  ): Promise<InventoryItemContext[]>;
}
