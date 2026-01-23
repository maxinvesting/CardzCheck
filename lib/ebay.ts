import * as cheerio from "cheerio";
import type { Comp, CompsStats } from "@/types";

interface EbaySearchParams {
  player: string;
  year?: string;
  set?: string;
  grade?: string;
}

function buildSearchUrl(params: EbaySearchParams): string {
  // Build search query
  const queryParts: string[] = [params.player];
  if (params.year) queryParts.push(params.year);
  if (params.set) queryParts.push(params.set);
  if (params.grade) queryParts.push(params.grade);

  const query = queryParts.join(" ");
  const encodedQuery = encodeURIComponent(query);

  // eBay sold listings URL
  // LH_Sold=1&LH_Complete=1 = Sold items only
  // _sop=13 = Sort by ending date (newest first)
  // _sacat=212 = Sports Trading Cards category
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=212&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
}

function parsePrice(priceText: string): number | null {
  // Remove currency symbols and parse
  const cleaned = priceText
    .replace(/[^0-9.,]/g, "")
    .replace(",", "");

  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

function parseDate(dateText: string): string {
  // eBay shows dates like "Sold Jan 15, 2024" or "Sold 2d ago"
  const now = new Date();

  if (dateText.includes("ago")) {
    // Handle relative dates
    const match = dateText.match(/(\d+)([dhm])/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];

      if (unit === "d") {
        now.setDate(now.getDate() - value);
      } else if (unit === "h") {
        now.setHours(now.getHours() - value);
      } else if (unit === "m") {
        now.setMinutes(now.getMinutes() - value);
      }
    }
    return now.toISOString().split("T")[0];
  }

  // Try to parse absolute dates
  const dateMatch = dateText.match(
    /(?:Sold\s+)?([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/
  );
  if (dateMatch) {
    const month = dateMatch[1];
    const day = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const monthNum = months[month.substring(0, 3)];
    if (monthNum !== undefined) {
      return new Date(year, monthNum, day).toISOString().split("T")[0];
    }
  }

  return now.toISOString().split("T")[0];
}

export async function scrapeEbaySoldListings(
  params: EbaySearchParams
): Promise<Comp[]> {
  const url = buildSearchUrl(params);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`eBay request failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const comps: Comp[] = [];

  // eBay listing items
  $(".s-item").each((_, element) => {
    const $item = $(element);

    // Skip "Shop on eBay" placeholder items
    const title = $item.find(".s-item__title").text().trim();
    if (!title || title.toLowerCase().includes("shop on ebay")) {
      return;
    }

    // Get price (may have multiple prices for auction items)
    const priceText = $item.find(".s-item__price").first().text();
    const price = parsePrice(priceText);
    if (!price) return;

    // Get sold date
    const dateText = $item.find(".s-item__title--tagblock .POSITIVE").text() ||
      $item.find(".s-item__ended-date").text() ||
      "";
    const date = parseDate(dateText);

    // Get link
    const link = $item.find(".s-item__link").attr("href") || "";

    // Get image
    const image =
      $item.find(".s-item__image-img").attr("src") ||
      $item.find(".s-item__image-img").attr("data-src") ||
      "";

    comps.push({
      title,
      price,
      date,
      link: link.split("?")[0], // Remove tracking params
      image: image || undefined,
      source: "ebay",
    });
  });

  return comps;
}

export function calculateStats(comps: Comp[]): CompsStats {
  if (comps.length === 0) {
    return { cmv: 0, avg: 0, low: 0, high: 0, count: 0 };
  }

  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const count = prices.length;

  // CMV is median
  let cmv: number;
  const mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    cmv = (prices[mid - 1] + prices[mid]) / 2;
  } else {
    cmv = prices[mid];
  }

  const avg = prices.reduce((sum, p) => sum + p, 0) / count;
  const low = prices[0];
  const high = prices[count - 1];

  return {
    cmv: Math.round(cmv * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    low,
    high,
    count,
  };
}

export function buildSearchQuery(params: EbaySearchParams): string {
  const parts = [params.player];
  if (params.year) parts.push(params.year);
  if (params.set) parts.push(params.set);
  if (params.grade) parts.push(params.grade);
  return parts.join(" ");
}
