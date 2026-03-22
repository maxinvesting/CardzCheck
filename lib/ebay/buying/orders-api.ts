/**
 * eBay Purchase History — via Trading API GetMyeBayBuying
 *
 * Fetches items the authenticated user has WON/PURCHASED on eBay.
 * Uses the existing seller OAuth access token — no extra scope required.
 * The Trading API uses XML over HTTPS with the Bearer token in the header.
 *
 * Docs: https://developer.ebay.com/devzone/xml/docs/reference/ebay/GetMyeBayBuying.html
 */

import { ebayFetch } from "../selling/client";

const TRADING_API_URL =
  process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/ws/api.dll"
    : "https://api.ebay.com/ws/api.dll";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NormalizedPurchaseLineItem {
  lineItemId: string;      // eBay ItemID + TransactionID
  title: string;
  quantity: number;
  imageUrl: string | null;
  unitPriceDollars: number;
  shippingCents: number;
  taxCents: number;
  legacyItemId: string | null;
}

export interface NormalizedPurchaseOrder {
  purchaseOrderId: string; // OrderID or ItemID-TransactionID composite
  createdAt: string;       // ISO 8601
  lineItems: NormalizedPurchaseLineItem[];
  totalShippingCents: number;
  totalTaxCents: number;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function buildGetMyeBayBuyingXml(pageNumber: number, entriesPerPage: number, modTimeTo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials/>
  <WonList>
    <Include>true</Include>
    <IncludeNotes>false</IncludeNotes>
    <Pagination>
      <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
    <ModTimeTo>${modTimeTo}</ModTimeTo>
  </WonList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBayBuyingRequest>`;
}

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
  return m?.[1]?.trim() ?? "";
}

function extractAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function parseDollars(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseXmlOrders(xml: string): NormalizedPurchaseOrder[] {
  const orders: NormalizedPurchaseOrder[] = [];
  const orderBlocks = extractAll(xml, "Order");

  if (orderBlocks.length > 0) {
    // Paid as grouped orders
    for (const block of orderBlocks) {
      const orderId = extractText(block, "OrderID");
      const createdAt = extractText(block, "CreatedTime") || new Date().toISOString();
      const shippingDollars = parseDollars(extractText(block, "ShippingServiceCost") || extractText(block, "ShippingCost"));
      const taxDollars = parseDollars(extractText(block, "SalesTax") || "0");

      const transactionBlocks = extractAll(block, "Transaction");
      const lineItems: NormalizedPurchaseLineItem[] = transactionBlocks.map((tb, i) => {
        const itemId = extractText(tb, "ItemID");
        const transactionId = extractText(tb, "TransactionID");
        const title = extractText(tb, "Title");
        const quantity = parseInt(extractText(tb, "QuantityPurchased") || "1", 10) || 1;
        const price = parseDollars(extractText(tb, "TransactionPrice") || extractText(tb, "SalePrice"));
        const imageUrl = extractText(tb, "PictureURL") || null;

        return {
          lineItemId: transactionId || String(i),
          title,
          quantity,
          imageUrl,
          unitPriceDollars: price,
          shippingCents: i === 0 ? Math.round(shippingDollars * 100) : 0, // assign shipping to first item
          taxCents: i === 0 ? Math.round(taxDollars * 100) : 0,
          legacyItemId: itemId || null,
        };
      });

      if (lineItems.length === 0) continue;
      orders.push({
        purchaseOrderId: orderId || lineItems.map(l => l.legacyItemId).join("-"),
        createdAt,
        lineItems,
        totalShippingCents: Math.round(shippingDollars * 100),
        totalTaxCents: Math.round(taxDollars * 100),
      });
    }
  } else {
    // Individual item transactions (not grouped into an order)
    const itemBlocks = extractAll(xml, "Item");
    for (const block of itemBlocks) {
      const itemId = extractText(block, "ItemID");
      const title = extractText(block, "Title");
      const quantity = parseInt(extractText(block, "QuantityPurchased") || "1", 10) || 1;
      const price = parseDollars(extractText(block, "SalePrice") || "0");
      const createdAt = extractText(block, "EndTime") || new Date().toISOString();
      const imageUrl = extractText(block, "PictureURL") || null;
      const shippingDollars = parseDollars(extractText(block, "ShippingCost") || "0");

      if (!itemId) continue;

      orders.push({
        purchaseOrderId: itemId,
        createdAt,
        lineItems: [{
          lineItemId: itemId,
          title,
          quantity,
          imageUrl,
          unitPriceDollars: price,
          shippingCents: Math.round(shippingDollars * 100),
          taxCents: 0,
          legacyItemId: itemId,
        }],
        totalShippingCents: Math.round(shippingDollars * 100),
        totalTaxCents: 0,
      });
    }
  }

  return orders;
}

// ─── Main API call ────────────────────────────────────────────────────────────

/**
 * Fetch all items the user has purchased on eBay since `after`.
 * Returns [] gracefully on any error.
 *
 * @param userId  CardzCheck user ID (used to resolve their eBay access token)
 * @param after   Only return purchases after this date
 */
export async function getBuyerOrders(
  userId: string,
  after?: Date
): Promise<NormalizedPurchaseOrder[]> {
  const results: NormalizedPurchaseOrder[] = [];
  const entriesPerPage = 200;
  // modTimeTo: items whose transaction was modified up to now
  const modTimeTo = new Date().toISOString();

  let pageNumber = 1;
  let totalPages = 1;

  while (pageNumber <= totalPages) {
    const body = buildGetMyeBayBuyingXml(pageNumber, entriesPerPage, modTimeTo);

    let res: Response;
    try {
      res = await ebayFetch(userId, TRADING_API_URL, {
        method: "POST",
        headers: {
          "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
          "X-EBAY-API-CALL-NAME": "GetMyeBayBuying",
          "X-EBAY-API-SITEID": "0",
          "Content-Type": "text/xml;charset=utf-8",
        },
        body,
      });
    } catch (err) {
      console.warn("[ebay/buying] Failed to call Trading API:", err);
      return results;
    }

    if (!res.ok) {
      console.warn("[ebay/buying] Trading API returned", res.status);
      return results;
    }

    const xml = await res.text();

    // Check for API-level errors
    if (xml.includes("<Ack>Failure</Ack>")) {
      const errMsg = extractText(xml, "LongMessage") || extractText(xml, "ShortMessage");
      console.warn("[ebay/buying] Trading API error:", errMsg);
      return results;
    }

    // Parse total pages on first call
    if (pageNumber === 1) {
      const totalPagesStr = extractText(xml, "TotalNumberOfPages");
      totalPages = parseInt(totalPagesStr || "1", 10) || 1;
    }

    const pageOrders = parseXmlOrders(xml);

    // Filter to only orders after `after` date
    const filtered = after
      ? pageOrders.filter(o => new Date(o.createdAt) > after)
      : pageOrders;

    results.push(...filtered);

    // If all orders on this page are older than `after`, stop paginating
    if (after && pageOrders.length > 0 && filtered.length === 0) break;

    pageNumber++;
  }

  return results;
}
