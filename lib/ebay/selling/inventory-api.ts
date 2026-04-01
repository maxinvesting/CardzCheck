/**
 * eBay Sell Inventory API wrapper
 * Creates and manages listings on eBay from CardzCheck inventory items.
 *
 * Flow for creating a listing:
 *   1. createOrUpdateInventoryItem()  — creates an inventory item record with a SKU
 *   2. createOffer()                  — creates a fixed-price offer on the inventory item
 *   3. publishOffer()                 — publishes the offer, returns the listing ID
 *
 * Docs: https://developer.ebay.com/api-docs/sell/inventory/overview.html
 */

import { ebayRequest, ebayFetch } from "./client";
import type { EbayOfferPublishResult } from "./types";

const INVENTORY_PATH = "/sell/inventory/v1";

export type CreateListingInput = {
  /** CardzCheck inventory item ID — used as the eBay SKU */
  inventoryItemId: string;
  title: string;
  description: string;
  condition: "LIKE_NEW" | "VERY_GOOD" | "GOOD" | "ACCEPTABLE" | "FOR_PARTS_OR_NOT_WORKING";
  /** eBay category ID (e.g., 261328 sports, 183454 CCG, 183050 non-sport). */
  categoryId: string;
  priceCents: number;
  quantity: number;
  imageUrls: string[];
  /** Optional: eBay fulfillment policy ID (set up in eBay account settings) */
  fulfillmentPolicyId?: string;
  /** Optional: eBay payment policy ID */
  paymentPolicyId?: string;
  /** Optional: eBay return policy ID */
  returnPolicyId?: string;
  /** eBay merchant location key (set up in eBay Sell Account API) */
  merchantLocationKey?: string;
};

/**
 * Create or update an eBay inventory item (SKU-based).
 * SKU = CardzCheck inventoryItemId for 1:1 mapping.
 */
export async function createOrUpdateInventoryItem(
  userId: string,
  input: CreateListingInput
): Promise<void> {
  const sku = input.inventoryItemId;
  const price = (input.priceCents / 100).toFixed(2);

  const body = {
    product: {
      title: input.title,
      description: input.description,
      imageUrls: input.imageUrls,
    },
    condition: input.condition,
    availability: {
      shipToLocationAvailability: {
        quantity: input.quantity,
      },
    },
  };

  const res = await ebayFetch(
    userId,
    `${INVENTORY_PATH}/inventory_item/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );

  // 204 No Content = success for PUT
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`eBay createInventoryItem failed (${res.status}): ${text}`);
  }
}

/**
 * Create an offer for an existing inventory item SKU.
 * Returns the offerId.
 */
export async function createOffer(
  userId: string,
  input: CreateListingInput
): Promise<string> {
  const sku = input.inventoryItemId;
  const price = (input.priceCents / 100).toFixed(2);

  const body: Record<string, unknown> = {
    sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    availableQuantity: input.quantity,
    categoryId: input.categoryId,
    listingDescription: input.description,
    pricingSummary: {
      price: { value: price, currency: "USD" },
    },
    listingDuration: "GTC", // Good Till Cancelled
  };

  if (input.merchantLocationKey) {
    body.merchantLocationKey = input.merchantLocationKey;
  }

  // Policy IDs are optional — eBay will use defaults from account if not provided
  if (input.fulfillmentPolicyId || input.paymentPolicyId || input.returnPolicyId) {
    body.listingPolicies = {
      ...(input.fulfillmentPolicyId ? { fulfillmentPolicyId: input.fulfillmentPolicyId } : {}),
      ...(input.paymentPolicyId ? { paymentPolicyId: input.paymentPolicyId } : {}),
      ...(input.returnPolicyId ? { returnPolicyId: input.returnPolicyId } : {}),
    };
  }

  const data = await ebayRequest<{ offerId?: string }>(
    userId,
    `${INVENTORY_PATH}/offer`,
    { method: "POST", body: JSON.stringify(body) }
  );

  if (!data.offerId) {
    throw new Error("eBay createOffer returned no offerId");
  }

  return data.offerId;
}

/**
 * Publish an offer (makes it live on eBay).
 * Returns { listingId, listingUrl }.
 */
export async function publishOffer(
  userId: string,
  offerId: string
): Promise<EbayOfferPublishResult> {
  const data = await ebayRequest<{ listingId?: string }>(
    userId,
    `${INVENTORY_PATH}/offer/${encodeURIComponent(offerId)}/publish`,
    { method: "POST", body: "{}" }
  );

  if (!data.listingId) {
    throw new Error("eBay publishOffer returned no listingId");
  }

  const listingUrl = `https://www.ebay.com/itm/${data.listingId}`;
  return { listingId: data.listingId, listingUrl };
}

/**
 * Full pipeline: create inventory item → create offer → publish.
 * Returns the live eBay listing ID and URL.
 */
export async function createListing(
  userId: string,
  input: CreateListingInput
): Promise<EbayOfferPublishResult & { offerId: string; sku: string }> {
  await createOrUpdateInventoryItem(userId, input);
  const offerId = await createOffer(userId, input);
  const result = await publishOffer(userId, offerId);
  return { ...result, offerId, sku: input.inventoryItemId };
}

/**
 * Update the price of an existing offer.
 */
export async function updateOfferPrice(
  userId: string,
  offerId: string,
  newPriceCents: number
): Promise<void> {
  const price = (newPriceCents / 100).toFixed(2);
  await ebayRequest(userId, `${INVENTORY_PATH}/offer/${encodeURIComponent(offerId)}`, {
    method: "PUT",
    body: JSON.stringify({
      pricingSummary: { price: { value: price, currency: "USD" } },
    }),
  });
}

/**
 * End / delist an active listing.
 */
export async function endListing(
  userId: string,
  inventoryItemId: string
): Promise<void> {
  const sku = inventoryItemId;
  // Delete the inventory item — this ends all associated offers/listings
  const res = await ebayFetch(
    userId,
    `${INVENTORY_PATH}/inventory_item/${encodeURIComponent(sku)}`,
    { method: "DELETE" }
  );

  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`eBay endListing failed (${res.status}): ${text}`);
  }
}
