/**
 * eBay Buy Order API v2
 *
 * Fetches orders the authenticated user has made as a BUYER.
 * Requires scope: https://api.ebay.com/oauth/api_scope/buy.order.readonly
 *
 * Docs: https://developer.ebay.com/api-docs/buy/order/overview.html
 */

import { ebayFetch } from "../selling/client";

const EBAY_API_BASE =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EbayPurchaseAmount {
  value: string;
  currency: string;
}

export interface EbayPurchaseLineItem {
  lineItemId: string;
  title: string;
  quantity: number;
  imageUrl?: string;
  unitPrice: EbayPurchaseAmount;
  /** Shipping cost charged to buyer for this line item */
  deliveryCost?: {
    shippingCost?: EbayPurchaseAmount;
  };
  /** Tax amounts (may have multiple entries) */
  taxes?: Array<{ amount: EbayPurchaseAmount }>;
  /** eBay item ID for linking back to the listing */
  legacyItemId?: string;
}

export interface EbayPurchaseOrder {
  purchaseOrderId: string;
  creationDate: string; // ISO 8601
  lineItems: EbayPurchaseLineItem[];
  pricingSummary?: {
    priceSubtotal?: EbayPurchaseAmount;
    deliveryCost?: EbayPurchaseAmount;
    tax?: EbayPurchaseAmount;
    total?: EbayPurchaseAmount;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDollars(amount: EbayPurchaseAmount | undefined): number {
  if (!amount) return 0;
  const n = parseFloat(amount.value ?? "0");
  return Number.isFinite(n) ? n : 0;
}

function parseCents(amount: EbayPurchaseAmount | undefined): number {
  return Math.round(parseDollars(amount) * 100);
}

// ─── Normalized type ──────────────────────────────────────────────────────────

export interface NormalizedPurchaseLineItem {
  lineItemId: string;
  title: string;
  quantity: number;
  imageUrl: string | null;
  unitPriceDollars: number;
  shippingCents: number;
  taxCents: number;
  legacyItemId: string | null;
}

export interface NormalizedPurchaseOrder {
  purchaseOrderId: string;
  createdAt: string;
  lineItems: NormalizedPurchaseLineItem[];
  /** Order-level totals (may differ from per-line sums due to discounts) */
  totalShippingCents: number;
  totalTaxCents: number;
}

function normalizeOrder(raw: EbayPurchaseOrder): NormalizedPurchaseOrder {
  const lineItems: NormalizedPurchaseLineItem[] = (raw.lineItems ?? []).map((li) => {
    const taxCents = (li.taxes ?? []).reduce(
      (sum, t) => sum + parseCents(t.amount),
      0
    );
    return {
      lineItemId: li.lineItemId,
      title: li.title ?? "",
      quantity: li.quantity ?? 1,
      imageUrl: li.imageUrl ?? null,
      unitPriceDollars: parseDollars(li.unitPrice),
      shippingCents: parseCents(li.deliveryCost?.shippingCost),
      taxCents,
      legacyItemId: li.legacyItemId ?? null,
    };
  });

  return {
    purchaseOrderId: raw.purchaseOrderId,
    createdAt: raw.creationDate,
    lineItems,
    totalShippingCents: parseCents(raw.pricingSummary?.deliveryCost),
    totalTaxCents: parseCents(raw.pricingSummary?.tax),
  };
}

// ─── API call ─────────────────────────────────────────────────────────────────

type RawOrdersResponse = {
  orders?: EbayPurchaseOrder[];
  total?: number;
  next?: string;
};

/**
 * Fetch all purchase orders for the authenticated user since the given date.
 * Returns [] gracefully if the user lacks buy.order.readonly scope (403/401).
 *
 * @param userId  CardzCheck user ID (used to resolve their eBay access token)
 * @param after   Only return orders created after this date (incremental sync)
 */
export async function getBuyerOrders(
  userId: string,
  after?: Date
): Promise<NormalizedPurchaseOrder[]> {
  const results: NormalizedPurchaseOrder[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    if (after) {
      params.set("filter", `creationDate:[${after.toISOString()}..${new Date().toISOString()}]`);
    }

    const url = `${EBAY_API_BASE}/buy/order/v2/purchase_order?${params.toString()}`;

    let res: Response;
    try {
      res = await ebayFetch(userId, url);
    } catch (err) {
      // No connected account or token failure — bail out cleanly
      console.warn("[ebay/buying] Failed to fetch buyer orders:", err);
      return results;
    }

    // 401/403 means buyer scope not granted — skip silently
    if (res.status === 401 || res.status === 403) {
      console.info("[ebay/buying] Buyer scope not granted for user", userId, "— skipping purchase sync");
      return results;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      console.error("[ebay/buying] Unexpected error fetching buyer orders:", res.status, body);
      return results;
    }

    const text = await res.text();
    if (!text) break;

    const data = JSON.parse(text) as RawOrdersResponse;
    const page = (data.orders ?? []).map(normalizeOrder);
    results.push(...page);

    const total = data.total ?? page.length;
    offset += page.length;

    if (offset >= total || page.length === 0) break;
  }

  return results;
}
