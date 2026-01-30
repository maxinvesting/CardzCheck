// eBay Browse API client for active listings (forSale)
// Uses OAuth 2.0 Client Credentials flow

import type { EbaySearchParams, ForSaleItem, ForSaleData, EbayOAuthToken } from "./types";
import { buildSearchQuery, calculatePriceStats, filterOutliers, isLotOrBundle, titleMatchesPlayer } from "./utils";

const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_API_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

// In-memory token cache (will be replaced with Supabase in production)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get OAuth access token using Client Credentials flow
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  console.log("🔑 Requesting new eBay OAuth token...");

  const response = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ OAuth token request failed:", response.status, errorText);
    throw new Error(`Failed to get eBay OAuth token: ${response.status}`);
  }

  const data: EbayOAuthToken = await response.json();

  // Cache the token (expires_in is in seconds)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  console.log("✅ Got new eBay OAuth token, expires in", data.expires_in, "seconds");

  return data.access_token;
}

/**
 * Search eBay Browse API for active listings
 */
export async function searchBrowseAPI(params: EbaySearchParams): Promise<ForSaleData> {
  const query = buildSearchQuery(params);
  console.log(`🔍 Browse API: Searching for "${query}"`);

  const accessToken = await getAccessToken();

  const limit = Math.min(50, Math.max(1, params.limit ?? 50));

  // Build search URL with filters
  const url = new URL(EBAY_BROWSE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("category_ids", "212"); // Sports Trading Cards
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "price"); // Sort by price ascending

  // Filter for Buy It Now only (no auctions)
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Browse API request failed:", response.status, errorText);

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error("eBay API rate limited. Please try again later.");
    }

    throw new Error(`eBay Browse API error: ${response.status}`);
  }

  const data = await response.json();
  const items: ForSaleItem[] = [];

  if (data.itemSummaries && Array.isArray(data.itemSummaries)) {
    for (const item of data.itemSummaries) {
      // Skip lots/bundles
      if (isLotOrBundle(item.title || "")) {
        continue;
      }

      // Verify title matches player (required)
      // Set and parallel type matching is more lenient to allow variations
      const titleLower = (item.title || "").toLowerCase();
      const nameParts = params.player.toLowerCase().split(/\s+/);
      const playerMatches = nameParts.every(part => titleLower.includes(part));
      
      if (!playerMatches) {
        continue;
      }

      // Set matching - strict matching to avoid wrong sets
      // When user asks for Prizm, reject Phoenix/Optic/Mosaic/Select even if title has "prizm"
      // (e.g. "Panini Phoenix ... Silver Hyper Prizm" — Prizm is the parallel, not the set)
      if (params.set) {
        const setLower = params.set.toLowerCase();
        const titleSet = titleLower;

        if (setLower.includes("prizm") || setLower.includes("prism")) {
          // Must have Prizm/Prism in title (as set, not just parallel)
          if (!titleSet.includes("prizm") && !titleSet.includes("prism")) {
            continue;
          }
          // Unconditionally reject other Panini SETS when searching for Prizm.
          // Titles like "Panini Phoenix ... Silver Hyper Prizm" have "prizm" as parallel; set is Phoenix.
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
          // Allow "Mosaic Prizm" (parallel); only reject other sets
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
          // Allow "Phoenix ... Silver Hyper Prizm" (parallel)
        }
      }

      // Parallel type matching - very lenient to allow variations
      if (params.parallelType) {
        const parallelLower = params.parallelType.toLowerCase();
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

      const price = parseFloat(item.price?.value || "0");
      if (price <= 0) continue;

      // Get shipping cost if available
      let shipping: number | undefined;
      if (item.shippingOptions?.[0]?.shippingCost?.value) {
        shipping = parseFloat(item.shippingOptions[0].shippingCost.value);
      }

      items.push({
        title: item.title || "",
        price,
        shipping,
        condition: item.condition || undefined,
        url: item.itemWebUrl || "",
        image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || undefined,
        itemId: item.itemId,
      });
    }
  }

  console.log(`✅ Browse API: Found ${items.length} valid active listings`);

  const maxItems = params.limit ?? 20;
  const limited = items.slice(0, maxItems);
  const prices = filterOutliers(limited.map(i => i.price));
  const stats = calculatePriceStats(prices);

  return {
    count: limited.length,
    low: stats.low,
    median: stats.median,
    high: stats.high,
    items: limited,
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Search with fallback strategies if no results
 * Uses less restrictive filtering on fallback searches
 */
export async function searchBrowseAPIWithFallbacks(params: EbaySearchParams): Promise<ForSaleData> {
  // Try original search first
  let result = await searchBrowseAPI(params);

  if (result.count > 0) {
    return result;
  }

  console.log("⚠️ No Browse API results, trying fallback strategies...");

  // Fallback 1: Try with simplified parallel type (e.g., just "silver" instead of "silver prizm")
  if (params.parallelType) {
    const parallelLower = params.parallelType.toLowerCase();
    if (parallelLower.includes("silver") && (parallelLower.includes("prism") || parallelLower.includes("prizm"))) {
      console.log("🔄 Trying with simplified parallel type (silver only)...");
      const simplified = { ...params, parallelType: "silver" };
      result = await searchBrowseAPI(simplified);
      if (result.count > 0) return result;
    }
  }

  // Fallback 2: Remove parallel type
  if (params.parallelType) {
    console.log("🔄 Trying without parallel type...");
    const noParallel = { ...params };
    delete noParallel.parallelType;
    result = await searchBrowseAPI(noParallel);
    if (result.count > 0) return result;
  }

  // Fallback 3: Remove set but keep parallel type
  if (params.set) {
    console.log("🔄 Trying without set...");
    const noSet = { ...params };
    delete noSet.set;
    result = await searchBrowseAPI(noSet);
    if (result.count > 0) return result;
  }

  // Fallback 4: Player + year + parallel type only
  if (params.year && params.parallelType) {
    console.log("🔄 Trying player + year + parallel only...");
    result = await searchBrowseAPI({
      player: params.player,
      year: params.year,
      parallelType: params.parallelType,
    });
    if (result.count > 0) return result;
  }

  // Fallback 5: Player + year only
  if (params.year) {
    console.log("🔄 Trying player + year only...");
    result = await searchBrowseAPI({
      player: params.player,
      year: params.year,
    });
    if (result.count > 0) return result;
  }

  // Return empty result
  return {
    count: 0,
    low: 0,
    median: 0,
    high: 0,
    items: [],
    cachedAt: new Date().toISOString(),
  };
}
