// eBay Browse API client for active listings (forSale)
// Uses OAuth 2.0 Client Credentials flow

import type { EbaySearchParams, ForSaleItem, ForSaleData, EbayOAuthToken } from "./types";
import {
  buildSearchQuery,
  calculatePriceStats,
  filterOutliers,
  isLotOrBundle,
  isJunkListing,
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
 * Search eBay Browse API for active listings.
 * Query is positive terms only; filtering (junk, set, parallel) is post-retrieval.
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
  const candidateItems: ForSaleItem[] = [];
  const selectedSet = params.set ? resolveSetTaxonomy(params.set) : null;

  function parseItem(item: (typeof data.itemSummaries)[0]): ForSaleItem | null {
    const price = parseFloat(item.price?.value || "0");
    if (price <= 0) return null;
    let shipping: number | undefined;
    if (item.shippingOptions?.[0]?.shippingCost?.value) {
      shipping = parseFloat(item.shippingOptions[0].shippingCost.value);
    }
    return {
      title: item.title || "",
      price,
      shipping,
      condition: item.condition || undefined,
      url: item.itemWebUrl || "",
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || undefined,
      itemId: item.itemId,
    };
  }

  if (data.itemSummaries && Array.isArray(data.itemSummaries)) {
    for (const item of data.itemSummaries) {
      const parsed = parseItem(item);
      if (!parsed) continue;
      candidateItems.push(parsed);

      if (isLotOrBundle(item.title || "")) continue;
      if (isJunkListing(item.title || "")) continue;

      const titleLower = (item.title || "").toLowerCase();
      const nameParts = params.player.toLowerCase().split(/\s+/);
      const playerMatches = nameParts.every((part) => titleLower.includes(part));
      if (!playerMatches) continue;

      if (params.set) {
        if (selectedSet) {
          const classified = classifyListingSet(titleLower);
          if (classified && classified.slug !== selectedSet.slug) continue;
          if (!classified && !matchesSelectedSet(titleLower, selectedSet)) continue;
        } else {
          const normalizedSet = normalizeSetName(params.set);
          const setTokens = normalizedSet.split(/\s+/).filter(Boolean);
          if (setTokens.length > 0) {
            if (!setTokens.every((t) => titleLower.includes(t))) continue;
          } else if (!titleLower.includes(params.set.toLowerCase())) {
            continue;
          }
        }
      }

      if (params.parallelType) {
        const parallelLower = params.parallelType.toLowerCase();
        if (hasDisallowedInsert(titleLower, parallelLower)) continue;
        if (!matchesParallelStrict(titleLower, parallelLower)) continue;
      }

      items.push(parsed);
    }
  }

  if (LISTING_DEBUG) {
    console.log(`✅ Browse API: ${items.length} valid (from ${data.itemSummaries?.length ?? 0} raw)`);
  }

  const finalItems = items.length > 0 ? items : candidateItems;
  if (LISTING_DEBUG && items.length === 0 && candidateItems.length > 0) {
    console.log("⚠️ Browse API: strict filtering removed all matches; returning raw eBay candidates.");
  }

  const maxItems = params.limit ?? 20;
  const limited = finalItems.slice(0, maxItems);
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
 * PASS 1 (STRICT CORE): Player + Year + Set + Parallel (+ optional grade/card#)
 * PASS 2 (BROAD RECALL): Drop parallel + card#
 * PASS 3 (MINIMAL BACKSTOP): Drop year
 */
export async function searchBrowseAPIWithFallbacks(params: EbaySearchParams): Promise<MultiPassResult> {
  const isDevMode = process.env.NODE_ENV === "development";
  let passCount = 0;

  // PASS 1: player + year + set + simplified parallel + optional grade (+ card number if provided)
  passCount++;
  if (isDevMode) {
    console.log("🔍 PASS 1 (STRICT CORE): player + year + set + parallel (+grade/card#)");
  }
  const pass1Params: EbaySearchParams = {
    player: params.player,
    year: params.year,
    set: params.set,
    parallelType: simplifyParallelType(params.parallelType),
    grade: params.grade,
    cardNumber: params.cardNumber,
    limit: params.limit,
  };
  let result = await searchBrowseAPI(pass1Params);

  if (result.count > 0) {
    if (isDevMode) {
      console.log(`✅ PASS 1 succeeded with ${result.count} results`);
    }
    return { ...result, passUsed: "strict", totalPasses: passCount };
  }

  // PASS 2: drop parallel and card#
  passCount++;
  if (isDevMode) {
    console.log("⚠️ PASS 1 returned 0 results, trying PASS 2 (drop parallel + card#)...");
  }
  const pass2Params: EbaySearchParams = {
    player: params.player,
    year: params.year,
    set: params.set,
    grade: params.grade,
    limit: params.limit,
  };

  const pass2Result = await searchBrowseAPI(pass2Params);

  if (pass2Result.count > 0) {
    if (isDevMode) {
      console.log(`✅ PASS 2 succeeded with ${pass2Result.count} results`);
    }
    return { ...pass2Result, passUsed: "broad", totalPasses: passCount };
  }

  // PASS 3: drop year as final broadening step
  passCount++;
  if (isDevMode) {
    console.log("⚠️ PASS 2 returned 0 results, trying PASS 3 (drop year)...");
  }

  const pass3Params: EbaySearchParams = {
    player: params.player,
    set: params.set,
    grade: params.grade,
    limit: params.limit,
  };

  const pass3Result = await searchBrowseAPI(pass3Params);

  if (isDevMode) {
    if (pass3Result.count > 0) {
      console.log(`✅ PASS 3 succeeded with ${pass3Result.count} results`);
    } else {
      console.log(`❌ All ${passCount} passes returned zero results`);
    }
  }

  if (pass3Result.count > 0) {
    return { ...pass3Result, passUsed: "minimal", totalPasses: passCount };
  }
  return { ...result, passUsed: "strict", totalPasses: passCount };
}

// INSERT_KEYWORDS imported from ./utils (single source of truth)

function hasDisallowedInsert(titleLower: string, parallelLower: string): boolean {
  const parallelAllowsInsert = INSERT_KEYWORDS.some((keyword) =>
    parallelLower.includes(keyword)
  );
  if (parallelAllowsInsert) return false;
  return INSERT_KEYWORDS.some((keyword) => titleLower.includes(keyword));
}

function simplifyParallelType(parallelType?: string): string | undefined {
  if (!parallelType) return undefined;
  return parallelType
    .replace(/[^\w\s/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Color / refractor modifiers that distinguish parallel variants.
 * When a user searches for a "base compound" like "rookie auto" that does NOT
 * include any of these modifiers, listings containing them are rejected so the
 * results only show the base version (not every rainbow parallel).
 */
const PARALLEL_MODIFIERS_BROWSE = [
  "refractor", "xfractor", "superfractor",
  "gold", "silver", "purple", "orange", "red", "blue", "green", "pink",
  "black", "camo", "shimmer", "mojo", "sepia", "wave", "hyper",
  "cracked ice", "tiger stripe", "atomic", "sapphire", "speckle",
  "disco", "lazer", "neon", "magenta", "aqua", "teal",
  "printing plate", "1/1",
];

function matchesParallelStrict(titleLower: string, parallelLower: string): boolean {
  if (!parallelLower.trim()) return true;

  const wantsNoHuddle = parallelLower.includes("no huddle");
  const titleHasNoHuddle = titleLower.includes("no huddle");
  if (wantsNoHuddle !== titleHasNoHuddle) return false;

  const normalized = parallelLower.replace(/prism/g, "prizm");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const allTokensMatch = tokens.every((token) => {
    if (token === "prizm") {
      return titleLower.includes("prizm") || titleLower.includes("prism");
    }
    return titleLower.includes(token);
  });
  if (!allTokensMatch) return false;

  // If the user's parallel already includes a specific modifier (e.g.
  // "rookie auto refractor"), skip the exclusion — they want that variant.
  const userHasModifier = PARALLEL_MODIFIERS_BROWSE.some((mod) => normalized.includes(mod));
  if (!userHasModifier) {
    // User asked for the base compound (e.g. "rookie auto").
    // Reject listings that contain a color/refractor modifier so we don't
    // mix in Gold Refractor /50, Purple /299, etc.
    for (const mod of PARALLEL_MODIFIERS_BROWSE) {
      if (titleLower.includes(mod)) return false;
    }
  }

  return true;
}
