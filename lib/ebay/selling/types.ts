/**
 * eBay Selling API types
 * Separate from lib/ebay/types.ts which is for Browse API / comps only.
 */

export type EbayOrderLineItem = {
  lineItemId: string;
  title: string;
  quantity: number;
  soldPriceCents: number;
  categoryId: string | null;
  ebayItemId: string | null;
  ebayOfferId: string | null;
  ebayTransactionId: string | null;
};

export type EbayOrder = {
  orderId: string;
  createdAt: string;
  buyerUsername: string | null;
  buyerEmail: string | null;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  lineItems: EbayOrderLineItem[];
  /** Total shipping the buyer paid */
  shippingChargedCents: number;
  /** Actual shipping cost (label) — may be unknown until shipped */
  shippingCostCents: number;
  taxCents: number;
  totalCents: number;
};

export type EbayListing = {
  listingId: string;
  offerId: string | null;
  title: string;
  price: number;
  currency: string;
  categoryId: string | null;
  status: "ACTIVE" | "ENDED" | "SOLD" | "OUT_OF_STOCK";
  quantity: number;
  quantitySold: number;
  listingUrl: string | null;
  imageUrl: string | null;
  sku: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type EbayInventoryItem = {
  sku: string;
  title: string;
  description: string | null;
  condition: "NEW" | "LIKE_NEW" | "VERY_GOOD" | "GOOD" | "ACCEPTABLE";
  imageUrls: string[];
  price: number;
  currency: string;
  quantity: number;
  categoryId: string | null;
};

export type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type: string;
  scope: string;
};

export type EbayUserIdentity = {
  userId: string;
  username: string;
};

export type EbayFeeResult = {
  platform_fees_cents: number;
  final_value_fee_cents: number;
  per_order_fee_cents: number;
  promoted_listing_fee_cents: number;
};

export type EbayOfferPublishResult = {
  listingId: string;
  listingUrl: string;
};
