export interface ShopListing {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  inventory_item_id: string | null;
  player_name: string;
  year: number;
  set_brand: string;
  parallel_variant: string | null;
  card_number: string | null;
  grade: string;
  condition: "raw" | "graded" | "sealed";
  cert_number: string | null;
  sport: string; // category/game label (e.g., Football, Pokemon, One Piece)
  price: number;
  cmv: number | null;
  // Public: our eBay storefront price for this card. Subscriber deals are always ≥13.5% below this.
  ebay_storefront_price: number | null;
  cost_basis?: number | null; // admin only, excluded from public API
  ebay_sold_comp?: number | null; // admin only — reference eBay sold comp price
  ebay_comp_url?: string | null; // direct URL to an eBay sold listing used as a comp
  quantity: number;
  quantity_sold: number;
  image_urls: string[];
  thumbnail_url: string | null;
  status: "active" | "sold" | "reserved" | "delisted" | "archived";
  publish_state: "draft" | "published";
  featured: boolean;
  is_premium: boolean;
  shipping_method: string;
  shipping_cost: number;
  notes: string | null;
  tags: string[];
  // AI-generated cache fields (populated lazily via /api/shop/listings/[id]/ai-insight and grade-analysis)
  ai_insight: string | null;
  ai_insight_at: string | null;
  grade_analysis: ShopListingGradeAnalysis | null;
  grade_analysis_at: string | null;
}

/** Cached grade probability output stored in shop_listings.grade_analysis */
export interface ShopListingGradeAnalysis {
  status: "ok" | "low_confidence" | "unable";
  estimated_grade_low: number;
  estimated_grade_high: number;
  grade_notes: string;
  confidence: {
    overall_confidence_score: number;
    confidence_label: "high" | "medium" | "low";
    limiting_factors: string[];
  };
  centering: {
    left_right_ratio: string;
    top_bottom_ratio: string;
    centering_severity_0_3: number;
    centering_notes: string;
  };
  surface: string;
  corners: string;
  edges: string;
  probabilities: Array<{ label: string; probability: number }>;
  analyzed_image_url: string | null;
}

export interface ShopOrder {
  id: string;
  created_at: string;
  buyer_email: string;
  buyer_name: string;
  shipping_address: Record<string, unknown>;
  items: ShopOrderItem[];
  subtotal: number | null;
  shipping_total: number | null;
  total: number | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  payment_status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  fulfillment_status: "unfulfilled" | "shipped" | "delivered";
  tracking_number: string | null;
  tracking_carrier: string | null;
  shipped_at: string | null;
  notes: string | null;
}

export interface ShopOrderItem {
  listing_id: string;
  quantity: number;
  player_name: string;
  year: number;
  set_brand: string;
  grade: string;
  price: number;
  shipping_cost: number;
}

export interface CartItem {
  listingId: string;
  quantity: number;
  listing?: ShopListing; // populated when hydrated
}
