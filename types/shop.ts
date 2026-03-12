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
  cost_basis?: number | null; // admin only, excluded from public API
  ebay_sold_comp?: number | null; // admin only — reference eBay sold comp price
  quantity: number;
  quantity_sold: number;
  image_urls: string[];
  thumbnail_url: string | null;
  status: "active" | "sold" | "reserved" | "delisted";
  publish_state: "draft" | "published";
  featured: boolean;
  is_premium: boolean;
  shipping_method: string;
  shipping_cost: number;
  notes: string | null;
  tags: string[];
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
  payment_status: "pending" | "paid" | "failed" | "refunded";
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
