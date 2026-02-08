// eBay Browse API client for active listings (forSale)
// Uses OAuth 2.0 Client Credentials flow

import type { EbaySearchParams, ForSaleItem, ForSaleData, EbayOAuthToken } from "./types";
import {
  buildSearchQuery,
  calculatePriceStats,
  filterOutliers,
  isLotOrBundle,
  titleMatchesPlayer,
  normalizeSetName,
  INSERT_KEYWORDS,
} from "./utils";
import { classifyListingSet, matchesSelectedSet, resolveSetTaxonomy } from "./set-taxonomy";

const LISTING_DEBUG = process.env.NODE_ENV === "development";

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

  // Fetch more items from the API for better filtering coverage.
  // The caller's `params.limit` controls how many we RETURN, not how many we fetch.
  const apiFetchLimit = 100;

  // Build search URL with filters
  const url = new URL(EBAY_BROWSE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("category_ids", "212"); // Sports Trading Cards
  url.searchParams.set("limit", String(apiFetchLimit));
  // NOTE: No explicit sort — eBay defaults to "bestMatch" (relevance ranking).
  // This avoids the "sort by price ascending" bias that returns the cheapest
  // (often wrong) items first — e.g. base Prizm at $16 instead of Silver Prizm at $110.

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
  const selectedSet = params.set ? resolveSetTaxonomy(params.set) : null;

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

      // Set matching - enforce hard product-line separation via taxonomy
      if (params.set) {
        if (selectedSet) {
          const classified = classifyListingSet(titleLower);
          if (classified && classified.slug !== selectedSet.slug) {
            continue;
          }
          if (!classified && !matchesSelectedSet(titleLower, selectedSet)) {
            continue;
          }
        } else {
          const normalizedSet = normalizeSetName(params.set);
          const setTokens = normalizedSet.split(/\s+/).filter(Boolean);
          if (setTokens.length > 0) {
            const matchesAllTokens = setTokens.every((token) => titleLower.includes(token));
            if (!matchesAllTokens) continue;
          } else {
            const setLower = params.set.toLowerCase();
            if (!titleLower.includes(setLower)) continue;
          }
        }
      }

      // Parallel type matching - strict when user selected a parallel
      if (params.parallelType) {
        const parallelLower = params.parallelType.toLowerCase();
        if (hasDisallowedInsert(titleLower, parallelLower)) {
          continue;
        }
        if (!matchesParallelStrict(titleLower, parallelLower)) {
          continue;
        }
      }

      // NOTE: Card number and grade constraints are applied in listingTitleFilterAndRank
      // (post-processing) rather than here. Applying them here is too aggressive —
      // it can eliminate all items from the API response, leaving 0 for post-processing.

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

  if (LISTING_DEBUG) {
    console.log(`✅ Browse API: ${items.length} valid after filtering (from ${data.itemSummaries?.length ?? 0} raw)`);
  }

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
 * Multi-pass search strategy with metadata tracking
 * Returns results with pass information for UI feedback
 */
export interface MultiPassResult extends ForSaleData {
  passUsed?: "strict" | "broad" | "minimal";
  totalPasses?: number;
}

/**
 * Search with multi-pass fallback strategies
 * PASS 1 (STRICT CORE): Player + Set + Grader + Grade (optional: year)
 * PASS 2 (BROAD RECALL): Remove year, add synonym expansion, no negative keywords
 * PASS 3 (MINIMAL BACKSTOP): Player + Set + Grader + Grade only
 */
export async function searchBrowseAPIWithFallbacks(params: EbaySearchParams): Promise<MultiPassResult> {
  const MIN_RESULTS = 3;
  const isDevMode = process.env.NODE_ENV === "development";
  let passCount = 0;

  // PASS 1: STRICT CORE
  // Required: player, set, grader+grade
  // Optional: year
  // NO negative keywords (handled in post-processing instead)
  passCount++;
  if (isDevMode) {
    console.log("🔍 PASS 1 (STRICT CORE): Full search with all user-provided fields");
  }

  let result = await searchBrowseAPI(params);

  if (result.count >= MIN_RESULTS) {
    if (isDevMode) {
      console.log(`✅ PASS 1 succeeded with ${result.count} results`);
    }
    return { ...result, passUsed: "strict", totalPasses: passCount };
  }

  // PASS 2: BROAD RECALL (if results < MIN_RESULTS)
  // Remove year constraint, keep other fields
  passCount++;
  if (isDevMode) {
    console.log(`⚠️ PASS 1 returned ${result.count} results (< ${MIN_RESULTS}), trying PASS 2 (BROAD RECALL)...`);
  }

  const pass2Params = { ...params };
  delete pass2Params.year; // Remove year for broader recall

  const pass2Result = await searchBrowseAPI(pass2Params);

  if (pass2Result.count >= MIN_RESULTS) {
    if (isDevMode) {
      console.log(`✅ PASS 2 succeeded with ${pass2Result.count} results`);
    }
    return { ...pass2Result, passUsed: "broad", totalPasses: passCount };
  }

  // PASS 3: MINIMAL BACKSTOP (if still low)
  // Query: player + set + grade + parallelType (if any)
  // Parallel type is preserved because it fundamentally changes card identity & price
  // (e.g. Silver Prizm ~$110 vs Base Prizm ~$16)
  passCount++;
  if (isDevMode) {
    console.log(`⚠️ PASS 2 returned ${pass2Result.count} results, trying PASS 3 (MINIMAL BACKSTOP)...`);
  }

  const pass3Params: EbaySearchParams = {
    player: params.player,
    set: params.set,
    grade: params.grade,
    parallelType: params.parallelType,
    cardNumber: params.cardNumber,
  };

  const pass3Result = await searchBrowseAPI(pass3Params);

  if (isDevMode) {
    if (pass3Result.count > 0) {
      console.log(`✅ PASS 3 succeeded with ${pass3Result.count} results`);
    } else {
      console.log(`❌ All ${passCount} passes returned zero results`);
    }
  }

  // Strict cascade: prefer tighter passes that meet threshold, fall back to broader
  let bestResult = result;
  let passLabel: "strict" | "broad" | "minimal" = "strict";

  if (result.count >= MIN_RESULTS) {
    bestResult = result; passLabel = "strict";
  } else if (pass2Result.count >= MIN_RESULTS) {
    bestResult = pass2Result; passLabel = "broad";
  } else if (pass3Result.count > 0) {
    bestResult = pass3Result; passLabel = "minimal";
  } else if (pass2Result.count > 0) {
    bestResult = pass2Result; passLabel = "broad";
  } else {
    bestResult = result; passLabel = "strict";
  }

  return { ...bestResult, passUsed: passLabel, totalPasses: passCount };
}

// INSERT_KEYWORDS imported from ./utils (single source of truth)

function hasDisallowedInsert(titleLower: string, parallelLower: string): boolean {
  const parallelAllowsInsert = INSERT_KEYWORDS.some((keyword) =>
    parallelLower.includes(keyword)
  );
  if (parallelAllowsInsert) return false;
  return INSERT_KEYWORDS.some((keyword) => titleLower.includes(keyword));
}

function matchesParallelStrict(titleLower: string, parallelLower: string): boolean {
  if (!parallelLower.trim()) return true;

  const wantsNoHuddle = parallelLower.includes("no huddle");
  const titleHasNoHuddle = titleLower.includes("no huddle");
  if (wantsNoHuddle !== titleHasNoHuddle) return false;

  const normalized = parallelLower.replace(/prism/g, "prizm");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (token === "prizm") {
      return titleLower.includes("prizm") || titleLower.includes("prism");
    }
    return titleLower.includes(token);
  });
}
