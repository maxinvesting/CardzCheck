// eBay Sold Listings Scraper (Beta)
// Uses fetch + HTML parsing (no browser automation for serverless compatibility)

import type { EbaySearchParams, CompItem, RecentCompsData } from "./types";
import {
  buildSoldListingsUrl,
  buildSearchQuery,
  calculatePriceStats,
  filterOutliers,
  isLotOrBundle,
  titleMatchesPlayer,
  getParallelAlternatives,
} from "./utils";

/**
 * Parse HTML to extract sold listings
 * Uses multiple selector strategies for resilience
 */
function parseListingsFromHTML(html: string, playerName: string, set?: string, parallelType?: string): CompItem[] {
  const items: CompItem[] = [];

  // Strategy 1: Parse s-item divs using regex (serverless compatible)
  // This is fragile but works without a DOM parser

  // Find all s-item blocks
  const itemRegex = /<li[^>]*class="[^"]*s-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const itemHtml = match[1];

    // Skip "Shop on eBay" items
    if (itemHtml.includes("Shop on eBay")) continue;

    // Extract title
    const titleMatch = itemHtml.match(/<span[^>]*role="heading"[^>]*>([^<]+)<\/span>/i) ||
      itemHtml.match(/<h3[^>]*class="[^"]*s-item__title[^"]*"[^>]*>([^<]+)<\/h3>/i) ||
      itemHtml.match(/class="[^"]*s-item__title[^"]*"[^>]*>([^<]+)</i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    if (!title) continue;

    // Skip lots/bundles
    if (isLotOrBundle(title)) continue;

    // Verify player name (required)
    const titleLower = title.toLowerCase();
    const nameParts = playerName.toLowerCase().split(/\s+/);
    const playerMatches = nameParts.every(part => titleLower.includes(part));
    
    if (!playerMatches) {
      continue;
    }

    // Set matching - strict matching to avoid wrong sets
    // When user asks for Prizm, reject Phoenix/Optic/Mosaic/Select even if title has "prizm"
    // (e.g. "Panini Phoenix ... Silver Hyper Prizm" — Prizm is the parallel, not the set)
    if (set) {
      const setLower = set.toLowerCase();
      const titleSet = titleLower;

      if (setLower.includes("prizm") || setLower.includes("prism")) {
        if (!titleSet.includes("prizm") && !titleSet.includes("prism")) continue;
        if (titleSet.includes("phoenix")) continue;
        if (titleSet.includes("optic")) continue;
        if (titleSet.includes("mosaic")) continue;
        if (titleSet.includes("select")) continue;
      }

      if (setLower.includes("mosaic")) {
        if (!titleSet.includes("mosaic")) continue;
        if (titleSet.includes("phoenix")) continue;
        if (titleSet.includes("optic")) continue;
        if (titleSet.includes("select")) continue;
      }

      if (setLower.includes("optic")) {
        if (!titleSet.includes("optic")) continue;
        if (titleSet.includes("phoenix")) continue;
        if (titleSet.includes("mosaic")) continue;
        if (titleSet.includes("select")) continue;
      }

      if (setLower.includes("select")) {
        if (!titleSet.includes("select")) continue;
        if (titleSet.includes("phoenix")) continue;
        if (titleSet.includes("mosaic")) continue;
        if (titleSet.includes("optic")) continue;
      }

      if (setLower.includes("phoenix")) {
        if (!titleSet.includes("phoenix")) continue;
        if (titleSet.includes("mosaic")) continue;
        if (titleSet.includes("optic")) continue;
        if (titleSet.includes("select")) continue;
      }
    }

    // Parallel type matching - very lenient to allow variations
    if (parallelType) {
      const parallelLower = parallelType.toLowerCase();
      // For "silver prizm/prism", allow any variation that has both "silver" and "prizm/prism"
      if (parallelLower.includes("silver") && (parallelLower.includes("prism") || parallelLower.includes("prizm"))) {
        // Must have "silver" and some form of "prizm/prism" - allow hyper, patch, wave, etc.
        if (!titleLower.includes("silver") || (!titleLower.includes("prizm") && !titleLower.includes("prism"))) {
          continue;
        }
      } else if (parallelLower.includes("silver")) {
        // Just "silver" - must have silver
        if (!titleLower.includes("silver")) {
          continue;
        }
      } else if (!titleLower.includes(parallelLower)) {
        // Other parallel types - require match
        continue;
      }
    }

    // Extract price
    const priceMatch = itemHtml.match(/class="[^"]*s-item__price[^"]*"[^>]*>\s*\$?([\d,]+\.?\d*)/i) ||
      itemHtml.match(/\$\s*([\d,]+\.?\d*)/);

    if (!priceMatch) continue;

    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
    if (isNaN(price) || price <= 0) continue;

    // Extract date (sold date)
    const dateMatch = itemHtml.match(/Sold\s+(\w+\s+\d+,?\s*\d*)/i) ||
      itemHtml.match(/class="[^"]*POSITIVE[^"]*"[^>]*>([^<]+)</i) ||
      itemHtml.match(/class="[^"]*s-item__ended-date[^"]*"[^>]*>([^<]+)</i);

    let date = new Date().toISOString().split("T")[0]; // Default to today
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1]);
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate.toISOString().split("T")[0];
      }
    }

    // Extract URL
    const urlMatch = itemHtml.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/i) ||
      itemHtml.match(/class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i);

    const url = urlMatch ? urlMatch[1].split("?")[0] : ""; // Remove tracking params

    // Extract image
    const imageMatch = itemHtml.match(/class="[^"]*s-item__image-img[^"]*"[^>]*src="([^"]+)"/i) ||
      itemHtml.match(/<img[^>]*src="(https:\/\/i\.ebayimg\.com[^"]+)"/i);

    const image = imageMatch ? imageMatch[1] : undefined;

    items.push({
      title,
      price,
      date,
      url,
      image,
    });
  }

  return items;
}

/**
 * Scrape eBay sold listings page
 */
async function scrapeEbaySoldPage(params: EbaySearchParams): Promise<CompItem[]> {
  const url = buildSoldListingsUrl(params);
  console.log(`🕷️ Scraping sold listings: ${url.replace(/&_nkw=[^&]+/, "&_nkw=***")}`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      console.error(`❌ Scraper request failed: ${response.status}`);
      if (response.status === 429 || response.status === 403) {
        throw new Error("eBay blocked the request. Try again later.");
      }
      throw new Error(`Scraper HTTP error: ${response.status}`);
    }

    const html = await response.text();

    // Check for bot detection - eBay shows various challenge pages
    if (
      html.includes("Please verify yourself") ||
      html.includes("captcha") ||
      html.includes("Checking your browser") ||
      html.includes("Pardon Our Interruption") ||
      html.includes("challenge-") ||
      html.includes("splashui")
    ) {
      console.log("⚠️ eBay bot detection triggered - challenge page detected");
      throw new Error("eBay requires browser verification - sold data unavailable via API");
    }

    // Also check if we got actual search results (look for s-item class)
    if (!html.includes("s-item") && !html.includes("srp-results")) {
      console.log("⚠️ No search results found in HTML - may be blocked or empty");
      throw new Error("eBay returned no search results - may be blocked");
    }

    const items = parseListingsFromHTML(html, params.player, params.set, params.parallelType);
    console.log(`✅ Scraped ${items.length} sold listings`);

    return items;
  } catch (error) {
    console.error("❌ Scraper error:", error);
    throw error;
  }
}

/**
 * Scrape with fallback strategies
 */
export async function scrapeEbaySoldListings(params: EbaySearchParams): Promise<RecentCompsData> {
  const query = buildSearchQuery(params);

  try {
    // Try original search
    let items = await scrapeEbaySoldPage(params);

    // Fallback strategies if no results
    if (items.length === 0 && params.parallelType) {
      console.log("🔄 Trying alternative parallel types...");
      const alternatives = getParallelAlternatives(params.parallelType);

      for (const alt of alternatives.slice(1)) {
        items = await scrapeEbaySoldPage({ ...params, parallelType: alt });
        if (items.length > 0) break;

        // Rate limiting between attempts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Try without parallel type
      if (items.length === 0) {
        console.log("🔄 Trying without parallel type...");
        const noParallel = { ...params };
        delete noParallel.parallelType;
        items = await scrapeEbaySoldPage(noParallel);
      }
    }

    // Fallback: Remove set
    if (items.length === 0 && params.set) {
      console.log("🔄 Trying without set...");
      const noSet = { ...params };
      delete noSet.set;
      delete noSet.parallelType;
      items = await scrapeEbaySoldPage(noSet);
    }

    // Fallback: Player + year only
    if (items.length === 0 && params.year) {
      console.log("🔄 Trying player + year only...");
      items = await scrapeEbaySoldPage({
        player: params.player,
        year: params.year,
      });
    }

    // Calculate stats
    const prices = filterOutliers(items.map(i => i.price));
    const stats = calculatePriceStats(prices);

    return {
      status: items.length > 0 ? "ok" : "unavailable",
      count: items.length,
      low: stats.low,
      median: stats.median,
      high: stats.high,
      items: items.slice(0, 20), // Limit to 20 items
      cachedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Scraper failed:", error);

    return {
      status: "unavailable",
      count: 0,
      low: 0,
      median: 0,
      high: 0,
      items: [],
      error: error instanceof Error ? error.message : "Unknown error",
      cachedAt: new Date().toISOString(),
    };
  }
}
