/**
 * Bulk Mode types
 *
 * Covers the full pipeline from batch creation through draft listing generation.
 * Used by both the service layer (lib/bulk/) and the UI (app/bulk/).
 */

// ----------------------------------------------------------------
// Enums / union literals matching DB check constraints
// ----------------------------------------------------------------

export type BulkBatchStatus = "pending" | "processing" | "ready" | "archived";

export type BulkItemStatus = "pending" | "identified" | "priced" | "approved" | "skipped";

export type BulkStrategy = "single" | "multi_quantity" | "bundle_candidate" | "skip";

export type BulkDraftStatus = "draft" | "approved" | "exported";

// ----------------------------------------------------------------
// DB row shapes (mirror table columns exactly)
// ----------------------------------------------------------------

export interface BulkBatch {
  id: string;
  user_id: string;
  name: string;
  status: BulkBatchStatus;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface BulkBatchItem {
  id: string;
  batch_id: string;
  position: number;
  status: BulkItemStatus;
  primary_image_url: string | null;
  secondary_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkItemIdentification {
  id: string;
  item_id: string;
  title_candidate: string | null;
  player: string | null;
  brand: string | null;
  set_name: string | null;
  year: string | null;
  card_number: string | null;
  rookie_flag: boolean;
  insert_parallel_notes: string | null;
  /** 0.0 – 1.0 */
  confidence: number;
  needs_review: boolean;
  raw_response_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BulkItemPricing {
  id: string;
  item_id: string;
  suggested_listing_price: number | null;
  estimated_sale_price: number | null;
  /** 0.0 – 1.0 */
  pricing_confidence: number;
  pricing_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkItemStrategy {
  id: string;
  item_id: string;
  recommended_strategy: BulkStrategy;
  estimated_shipping_cost: number | null;
  estimated_ebay_fee: number | null;
  estimated_net_profit: number | null;
  ese_eligible: boolean;
  not_worth_listing: boolean;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkListingDraft {
  id: string;
  item_id: string;
  draft_status: BulkDraftStatus;
  listing_payload_json: BulkListingPayload;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------
// Draft listing payload shape (stored as JSONB)
// This is the data the user will eventually push to eBay.
// ----------------------------------------------------------------

export interface BulkListingPayload {
  title: string;
  price: number;
  condition: "New" | "Like New" | "Very Good" | "Good" | "Acceptable";
  /** eBay category hint; populated from identification when available */
  category_hint: string | null;
  /** Array of image URLs to attach to the listing */
  photos: string[];
  shipping_method: "standard_envelope" | "first_class" | "priority";
  quantity: number;
  /** eBay item specifics — key/value pairs for listing details */
  item_specifics: Record<string, string>;
  strategy: BulkStrategy;
  /** Internal-only notes visible in the review UI, not sent to eBay */
  internal_notes: string | null;
}

// ----------------------------------------------------------------
// Rich view type: one item + all related rows joined
// Used in the batch review UI so we only do one data fetch per item
// ----------------------------------------------------------------

export interface BulkItemView {
  item: BulkBatchItem;
  identification: BulkItemIdentification | null;
  pricing: BulkItemPricing | null;
  strategy: BulkItemStrategy | null;
  draft: BulkListingDraft | null;
}

// ----------------------------------------------------------------
// Service layer input/output types
// ----------------------------------------------------------------

/** Input to the identification service */
export interface IdentificationInput {
  primaryImageUrl: string;
  secondaryImageUrl?: string;
}

/** Output from the identification service */
export interface IdentificationResult {
  titleCandidate: string | null;
  player: string | null;
  brand: string | null;
  setName: string | null;
  year: string | null;
  cardNumber: string | null;
  rookieFlag: boolean;
  insertParallelNotes: string | null;
  /** 0.0 – 1.0 */
  confidence: number;
  needsReview: boolean;
  rawResponseJson: Record<string, unknown> | null;
}

/** Input to the pricing engine */
export interface PricingInput {
  identification: IdentificationResult;
}

/** Output from the pricing engine */
export interface PricingResult {
  suggestedListingPrice: number | null;
  estimatedSalePrice: number | null;
  /** 0.0 – 1.0 */
  pricingConfidence: number;
  pricingNotes: string;
}

/** Input to the shipping/margin engine */
export interface ShippingInput {
  suggestedListingPrice: number | null;
  estimatedSalePrice: number | null;
}

/** Output from the shipping/margin engine */
export interface ShippingResult {
  eseEligible: boolean;
  estimatedShippingCost: number;
  estimatedEbayFee: number;
  estimatedNetProfit: number;
  notWorthListing: boolean;
}

/** Input to the strategy engine */
export interface StrategyInput {
  identification: IdentificationResult;
  pricing: PricingResult;
  shipping: ShippingResult;
  /** How many identical cards (same player+year+set+cardNumber) exist in this batch */
  duplicateCount: number;
}

/** Output from the strategy engine */
export interface StrategyResult {
  recommendedStrategy: BulkStrategy;
  rationale: string;
}

// ----------------------------------------------------------------
// API request/response shapes
// ----------------------------------------------------------------

export interface CreateBatchRequest {
  name: string;
}

export interface CreateBatchResponse {
  batch: BulkBatch;
}

export interface AddItemsRequest {
  items: Array<{
    primaryImageUrl: string;
    secondaryImageUrl?: string;
  }>;
}

export interface AddItemsResponse {
  created: number;
  items: BulkBatchItem[];
}

export interface ProcessBatchResponse {
  processed: number;
  skipped: number;
  errors: string[];
}

export interface BatchDetailResponse {
  batch: BulkBatch;
  items: BulkItemView[];
}
