// eBay Dual-Signal Search
// Combines Browse API (forSale) + Price Estimator (estimatedSaleRange)
// NO SCRAPING - uses only official Browse API data

import type { EbaySearchParams, ForSaleData } from "./types";
import { buildSearchQuery, normalizeQueryForCache } from "./utils";
import { searchBrowseAPIWithFallbacks } from "./browse-api";
import { estimateSaleRange, type PriceEstimateResult, type EstimateParams } from "./price-estimator";
import { getCachedForSale, cacheForSale } from "./cache";
import { waitForRateLimit, recordSuccess, recordError } from "./rate-limiter";

function inferRookieRequired(params: EbaySearchParams): boolean {
  const q = buildSearchQuery(params).toLowerCase();
  if (/\brc\b/.test(q) || /\brookie\b/.test(q)) return true;
  const kw = (params.keywords ?? []).join(" ").toLowerCase();
  return /\brc\b/.test(kw) || /\brookie\b/.test(kw);
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface EbayPricingResponse {
  query: string;
  normalizedQuery: string;
  forSale: ForSaleData;
  estimatedSaleRange: PriceEstimateResult;
  disclaimers: string[];
}

// ============================================================================
// DISCLAIMER GENERATION
// ============================================================================

function generateDisclaimers(forSale: ForSaleData, estimate: PriceEstimateResult): string[] {
  const disclaimers: string[] = [];

  if (estimate.pricingAvailable) {
    disclaimers.push("Estimated from active listings (Beta). Not actual sales.");
    disclaimers.push("Directional pricing only - verify before buying/selling.");
  }

  if (forSale.count < 3) {
    disclaimers.push("Limited listing data available. Estimates may be less accurate.");
  }

  if (estimate.pricingAvailable && estimate.notes) {
    for (const note of estimate.notes) {
      if (!disclaimers.includes(note)) disclaimers.push(note);
    }
  }

  if (!estimate.pricingAvailable) {
    disclaimers.push(estimate.reason);
  }

  return disclaimers;
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Main search function
 * Returns forSale (Browse API) + estimatedSaleRange (calculated from forSale)
 */
export async function searchEbayDualSignal(params: EbaySearchParams): Promise<EbayPricingResponse> {
  const query = buildSearchQuery(params);
  const normalizedQuery = normalizeQueryForCache(params);

  console.log(`🔍 eBay search: "${query}"`);

  // --- STEP 1: Get forSale data from Browse API ---
  let forSale: ForSaleData;

  const cachedForSale = getCachedForSale(params);
  if (cachedForSale) {
    forSale = cachedForSale;
    console.log("✅ Using cached forSale data");
  } else {
    try {
      await waitForRateLimit("browse_api");
      forSale = await searchBrowseAPIWithFallbacks(params);
      cacheForSale(params, forSale);
      recordSuccess("browse_api");
    } catch (error) {
      console.error("❌ Browse API failed:", error);
      recordError("browse_api", error instanceof Response ? error.status : undefined);

      // Return minimal response if API fails
      forSale = {
        count: 0,
        low: 0,
        median: 0,
        high: 0,
        items: [],
        cachedAt: new Date().toISOString(),
      };
    }
  }

  // --- STEP 2: Calculate estimated sale range from forSale data ---
  const estimateParams: EstimateParams = {
    playerName: params.player,
    year: params.year,
    set: params.set,
    grade: params.grade,
    rookieRequired: inferRookieRequired(params),
  };
  const estimatedSaleRange = estimateSaleRange(forSale.items, estimateParams);

  if (estimatedSaleRange.pricingAvailable) {
    console.log(`📊 Estimated sale range: $${estimatedSaleRange.estimatedSaleRange.low} - $${estimatedSaleRange.estimatedSaleRange.high} (${estimatedSaleRange.estimatedSaleRange.confidence} confidence)`);
  } else {
    console.log(`⚠️ Pricing unavailable: ${estimatedSaleRange.reason}`);
  }

  // --- STEP 3: Generate disclaimers ---
  const disclaimers = generateDisclaimers(forSale, estimatedSaleRange);

  return {
    query,
    normalizedQuery,
    forSale,
    estimatedSaleRange,
    disclaimers,
  };
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy compatibility wrapper - returns data in old format
 * Used by existing API routes that expect the old response shape
 */
export async function searchEbayLegacy(params: EbaySearchParams): Promise<{
  comps: Array<{ title: string; price: number; date: string; link: string; image?: string; source: "ebay" }>;
  stats: { cmv: number; avg: number; low: number; high: number; count: number };
  query: string;
}> {
  const result = await searchEbayDualSignal(params);

  // Convert forSale items to legacy comps format
  const comps = result.forSale.items.map(item => ({
    title: item.title,
    price: item.price,
    date: new Date().toISOString().split("T")[0],
    link: item.url,
    image: item.image,
    source: "ebay" as const,
  }));

  // Use estimated sale range for CMV if available, otherwise use median ask
  let cmv = result.forSale.median;
  if (result.estimatedSaleRange.pricingAvailable) {
    // Use midpoint of estimated range as CMV
    const { low, high } = result.estimatedSaleRange.estimatedSaleRange;
    cmv = Math.round(((low + high) / 2) * 100) / 100;
  }

  const avg = result.forSale.count > 0
    ? Math.round((comps.reduce((sum, c) => sum + c.price, 0) / comps.length) * 100) / 100
    : 0;

  return {
    comps,
    stats: {
      cmv,
      avg,
      low: result.forSale.low,
      high: result.forSale.high,
      count: result.forSale.count,
    },
    query: result.query,
  };
}
