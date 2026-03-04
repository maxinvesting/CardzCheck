/**
 * eBay Sell Fulfillment API wrapper
 * Fetches orders from eBay for a given seller.
 *
 * Docs: https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
 */

import { ebayRequest } from "./client";
import type { EbayOrder, EbayOrderLineItem } from "./types";

const FULFILLMENT_PATH = "/sell/fulfillment/v1";

type EbayApiLineItem = {
  lineItemId?: string;
  title?: string;
  quantity?: number;
  total?: { value?: string };
  legacyItemId?: string;
  legacyTransactionId?: string;
  lineItemCost?: { value?: string };
  listingMarketplaceId?: string;
  properties?: Record<string, unknown>;
};

type EbayApiOrder = {
  orderId?: string;
  creationDate?: string;
  buyer?: { username?: string; buyerRegistrationAddress?: { email?: string } };
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  lineItems?: EbayApiLineItem[];
  pricingSummary?: {
    total?: { value?: string };
    deliveryCost?: { value?: string };
    tax?: { value?: string };
    priceDiscount?: { value?: string };
  };
  fulfillmentStartInstructions?: Array<{ shippingStep?: { shipTo?: { contactAddress?: { addressLine1?: string } } } }>;
};

function parseCents(value: string | null | undefined): number {
  const num = parseFloat(value ?? "0");
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function normalizeOrder(raw: EbayApiOrder): EbayOrder {
  const lineItems: EbayOrderLineItem[] = (raw.lineItems ?? []).map((li) => ({
    lineItemId: li.lineItemId ?? "",
    title: li.title ?? "",
    quantity: li.quantity ?? 1,
    soldPriceCents: parseCents(li.lineItemCost?.value),
    categoryId: null,
    ebayItemId: li.legacyItemId ?? null,
    ebayOfferId: null,
    ebayTransactionId: li.legacyTransactionId ?? null,
  }));

  const pricing = raw.pricingSummary;
  const shippingChargedCents = parseCents(pricing?.deliveryCost?.value);
  const taxCents = parseCents(pricing?.tax?.value);
  const totalCents = parseCents(pricing?.total?.value);
  const soldPriceCents = lineItems.reduce((sum, li) => sum + li.soldPriceCents * li.quantity, 0);

  return {
    orderId: raw.orderId ?? "",
    createdAt: raw.creationDate ?? new Date().toISOString(),
    buyerUsername: raw.buyer?.username ?? null,
    buyerEmail: raw.buyer?.buyerRegistrationAddress?.email ?? null,
    orderFulfillmentStatus: raw.orderFulfillmentStatus ?? "NOT_STARTED",
    orderPaymentStatus: raw.orderPaymentStatus ?? "UNPAID",
    lineItems,
    shippingChargedCents,
    shippingCostCents: 0, // unknown until shipped — populated from shipping label if available
    taxCents,
    totalCents: totalCents || soldPriceCents + shippingChargedCents + taxCents,
  };
}

/**
 * Fetch a page of orders from eBay's Fulfillment API.
 * Only returns PAID orders by default.
 *
 * @param userId   - The CardzCheck user ID (used to look up access token)
 * @param after    - Filter to orders created after this date (ISO string)
 * @param limit    - Page size (max 200 per eBay docs)
 * @param offset   - Pagination offset
 */
export async function getOrders(
  userId: string,
  options: {
    after?: Date;
    limit?: number;
    offset?: number;
    paymentStatus?: "PAID" | "FAILED";
  } = {}
): Promise<{ orders: EbayOrder[]; total: number; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? 200, 200);
  const offset = options.offset ?? 0;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    orderPaymentStatus: options.paymentStatus ?? "PAID",
  });

  if (options.after) {
    // eBay uses ISO 8601 with ms: 2024-01-01T00:00:00.000Z
    params.set(
      "filter",
      `creationdate:[${options.after.toISOString()}..${new Date().toISOString()}]`
    );
  }

  const data = await ebayRequest<{
    orders?: EbayApiOrder[];
    total?: number;
    next?: string;
  }>(userId, `${FULFILLMENT_PATH}/order?${params.toString()}`);

  const orders = (data.orders ?? []).map(normalizeOrder);
  const total = data.total ?? orders.length;

  return {
    orders,
    total,
    hasMore: offset + orders.length < total,
  };
}

/**
 * Fetch a single order by eBay order ID.
 */
export async function getOrder(userId: string, orderId: string): Promise<EbayOrder> {
  const data = await ebayRequest<EbayApiOrder>(
    userId,
    `${FULFILLMENT_PATH}/order/${encodeURIComponent(orderId)}`
  );
  return normalizeOrder(data);
}
