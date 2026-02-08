// eBay Dual-Signal Search
// Combines Browse API (forSale) + Price Estimator (estimatedSaleRange)
// NO SCRAPING - uses only official Browse API data

import type { EbaySearchParams, ForSaleData } from "./types";
import {
  buildSearchQuery,
  normalizeQueryForCache,
  calculatePriceStats,
  filterOutliers,
  extractCardNumbers,
  titleMatchesGrade,
  INSERT_KEYWORDS,
} from "./utils";
import { classifyListingSet, getSetProfile, matchesSelectedSet, resolveSetTaxonomy } from "./set-taxonomy";
import { searchBrowseAPIWithFallbacks, type MultiPassResult } from "./browse-api";
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
  passUsed?: "strict" | "broad" | "minimal"; // Which search pass succeeded
  totalPasses?: number; // How many passes were attempted
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
  let forSale: MultiPassResult;
  let passUsed: "strict" | "broad" | "minimal" | undefined;
  let totalPasses: number | undefined;

  const cachedForSale = getCachedForSale(params);
  if (cachedForSale) {
    forSale = cachedForSale;
    console.log("✅ Using cached forSale data");
  } else {
    try {
      await waitForRateLimit("browse_api");
      forSale = await searchBrowseAPIWithFallbacks(params);
      passUsed = forSale.passUsed;
      totalPasses = forSale.totalPasses;
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

  // --- STEP 2: Filter + rank listings before CMV ---
  forSale = listingTitleFilterAndRank(forSale, params);

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
    passUsed,
    totalPasses,
  };
}

const LISTING_DEBUG = process.env.NODE_ENV === "development";

function listingTitleFilterAndRank(
  forSale: ForSaleData,
  params: EbaySearchParams
): ForSaleData {
  if (!forSale.items.length) return forSale;

  const selectedSet = params.set ? resolveSetTaxonomy(params.set) : null;
  const selectedSlug = selectedSet?.slug ?? normalizeSetSlug(params.set);
  const selectedProfile = params.set ? getSetProfile(params.set) : null;
  const parallelLower = params.parallelType?.toLowerCase().trim() ?? "";
  const wantsSilverPrizm = parallelLower.includes("silver") && parallelLower.includes("prizm");
  const wantsNoHuddle = parallelLower.includes("no huddle");
  const wantsInsert = INSERT_KEYWORDS.some((kw) => parallelLower.includes(kw));
  const cardNumber = params.cardNumber?.replace(/^#/, "").trim();
  const gradeLower = params.grade?.toLowerCase().trim() ?? "";
  const wantsPsa10 = gradeLower.includes("psa") && gradeLower.includes("10");

  const debugLog: Array<{ title: string; accepted: boolean; reason?: string; score?: number; parsedCard?: string; parsedGrade?: string }> = [];

  // ── Core filtering: set + parallel are always-hard constraints ──
  // Card number, grade, and insert checks are progressive — relaxed if they
  // produce 0 results so we never show "no listings found" when eBay returned items.

  type FilterOpts = {
    enforceCardNumber: boolean;
    enforceGrade: boolean;
    enforceInsertCheck: boolean;
  };

  function applyFilters(items: typeof forSale.items, opts: FilterOpts) {
    return items.filter((item) => {
      const title = (item.title || "").toLowerCase();
      if (!title) return false;

      // ── SET / PRODUCT LINE (always hard) ──
      if (selectedProfile) {
        if (selectedProfile.requiredAll.length > 0) {
          if (!selectedProfile.requiredAll.every((term) => title.includes(term))) return false;
        }
        if (selectedProfile.requiredAny.length > 0) {
          if (!selectedProfile.requiredAny.some((term) => title.includes(term))) return false;
        }
        if (selectedProfile.forbidden.some((term) => title.includes(term))) return false;
      } else if (selectedSlug === "panini-prizm") {
        if (!title.includes("prizm")) return false;
        if (hasDraftPicksSignals(title)) return false;
      } else if (selectedSlug === "panini-prizm-draft-picks") {
        if (!title.includes("prizm")) return false;
        if (!hasDraftPicksSignals(title)) return false;
      } else if (selectedSet) {
        const classified = classifyListingSet(title);
        if (classified && classified.slug !== selectedSet.slug) return false;
        if (!classified && !matchesSelectedSet(title, selectedSet)) return false;
      }

      // ── PARALLEL TYPE (always hard) ──
      if (parallelLower) {
        if (!wantsNoHuddle && title.includes("no huddle")) return false;
        if (opts.enforceInsertCheck && !wantsInsert && hasInsertSignal(title)) return false;
        if (!matchesParallelStrict(title, parallelLower)) return false;
      }
      if (!parallelLower && opts.enforceInsertCheck && hasInsertSignal(title)) return false;

      // ── CARD NUMBER (progressive) ──
      if (opts.enforceCardNumber && cardNumber) {
        const foundNums = extractCardNumbers(title);
        if (foundNums.length > 0 && !foundNums.includes(cardNumber)) return false;
      }

      // ── GRADE (progressive) ──
      if (opts.enforceGrade && gradeLower && !titleMatchesGrade(title, gradeLower)) return false;

      return true;
    });
  }

  // ── Progressive constraint relaxation ──
  // 1. All constraints on → 2. Drop card number → 3. Drop grade → 4. Drop insert check
  const CONSTRAINT_LEVELS: FilterOpts[] = [
    { enforceCardNumber: true, enforceGrade: true, enforceInsertCheck: true },
    { enforceCardNumber: false, enforceGrade: true, enforceInsertCheck: true },
    { enforceCardNumber: false, enforceGrade: false, enforceInsertCheck: true },
    { enforceCardNumber: false, enforceGrade: false, enforceInsertCheck: false },
  ];

  let filtered: typeof forSale.items = [];
  let constraintLevel = 0;
  for (let i = 0; i < CONSTRAINT_LEVELS.length; i++) {
    filtered = applyFilters(forSale.items, CONSTRAINT_LEVELS[i]);
    constraintLevel = i;
    if (filtered.length > 0) break;
  }

  if (LISTING_DEBUG && constraintLevel > 0) {
    const labels = ["strict", "no-cardNum", "no-cardNum-grade", "relaxed-all"];
    console.log(`⚠️ listingTitleFilterAndRank: relaxed to level ${constraintLevel} (${labels[constraintLevel]}) — ${filtered.length} items survive`);
  }

  // ── Build debug log for the winning filter level ──
  if (LISTING_DEBUG) {
    for (const item of forSale.items) {
      const title = (item.title || "").toLowerCase();
      const isAccepted = filtered.includes(item);
      if (!isAccepted) {
        // Determine rejection reason (simplified)
        let reason = "unknown";
        if (parallelLower && !matchesParallelStrict(title, parallelLower)) reason = "parallel:no match";
        else if (gradeLower && !titleMatchesGrade(title, gradeLower)) reason = `grade:mismatch (wanted ${gradeLower})`;
        else if (cardNumber) {
          const found = extractCardNumbers(title);
          if (found.length > 0 && !found.includes(cardNumber)) reason = `cardNumber:wanted #${cardNumber} found #${found.join(",")}`;
        }
        debugLog.push({ title: item.title || "", accepted: false, reason });
      }
    }
  }

  // ── RANK by match score (not by price) ──
  const scored = filtered.map((item) => {
    const score = scoreListingTitle(item.title || "", {
      wantsSilverPrizm,
      wantsPsa10,
      wantsNoHuddle,
      wantsInsert,
      cardNumber,
      selectedSet: params.set,
      selectedParallel: params.parallelType,
    });
    if (LISTING_DEBUG) {
      const t = (item.title || "").toLowerCase();
      debugLog.push({
        title: item.title,
        accepted: true,
        score,
        parsedCard: extractCardNumbers(t).join(",") || "-",
        parsedGrade: gradeLower || "-",
      });
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // ── DEBUG summary ──
  if (LISTING_DEBUG && debugLog.length > 0) {
    const accepted = debugLog.filter((d) => d.accepted);
    const rejected = debugLog.filter((d) => !d.accepted);
    console.log(`🔎 listingTitleFilterAndRank: ${accepted.length} accepted, ${rejected.length} rejected out of ${forSale.items.length}`);
    for (const r of rejected.slice(0, 5)) {
      console.log(`   ✗ ${r.reason} | ${r.title?.slice(0, 80)}`);
    }
    if (rejected.length > 5) console.log(`   ... and ${rejected.length - 5} more rejected`);
    for (const a of accepted.slice(0, 5)) {
      console.log(`   ✓ score=${a.score} card=#${a.parsedCard} | ${a.title?.slice(0, 80)}`);
    }
  }

  const ranked = scored.map((entry) => entry.item);
  const maxItems = params.limit ?? 20;
  const limited = ranked.slice(0, maxItems);
  const prices = filterOutliers(limited.map((i) => i.price));
  const stats = calculatePriceStats(prices);

  return {
    count: limited.length,
    low: stats.low,
    median: stats.median,
    high: stats.high,
    items: limited,
    cachedAt: forSale.cachedAt,
  };
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

function normalizeSetSlug(setName?: string): string | null {
  if (!setName) return null;
  return setName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function hasDraftPicksSignals(title: string): boolean {
  if (title.includes("draft picks")) return true;
  if (title.includes("draftpick")) return true;
  if (/\bdp\b/.test(title)) return true;
  if (title.includes("draft")) return true;
  if (title.includes("college")) return true;
  if (title.includes("ncaa")) return true;
  if (title.includes("lsu")) return true;
  return false;
}

function hasInsertSignal(title: string): boolean {
  return INSERT_KEYWORDS.some((kw) => title.includes(kw));
}

/**
 * Score listing relevance based on user intent
 *
 * SCORING WEIGHTS (documented for maintainability):
 * +10 - Grader + Grade match (PSA 10, GEM MT 10, etc.)
 * +8  - Set token match (optic, prizm, select, mosaic)
 * +6  - Card number match (if provided)
 * +5  - Parallel or synonym match (holo, silver, holo prizm, purple, /75)
 * +4  - "Rated Rookie" / "RR" match
 * -8  - Wrong set strongly implied (title says Prizm but NOT Optic when Optic selected)
 * -5  - Junk signals (lot, break, digital, custom, reprint)
 *
 * IMPORTANT SYNONYMS:
 * - "Holo Prizm" is treated as valid Optic Holo synonym
 * - "Rated Rookie" / "RR" / "Rated Rookies" are interchangeable
 * - Parallel variants (refractor, /75, purple, etc.) boost score but not required
 */
export function scoreListingTitle(
  title: string,
  params: {
    wantsSilverPrizm: boolean;
    wantsPsa10: boolean;
    wantsNoHuddle: boolean;
    wantsInsert: boolean;
    cardNumber?: string;
    selectedSet?: string; // e.g., "optic", "prizm"
    selectedParallel?: string; // e.g., "holo", "silver"
  }
): number {
  const lower = title.toLowerCase();
  let score = 0;

  // +10 Grader + Grade match
  if (params.wantsPsa10 && (lower.includes("psa 10") || lower.includes("psa10") || lower.includes("gem mint") || lower.includes("gem mt"))) {
    score += 10;
  }

  // +8 Set token match
  const setLower = params.selectedSet?.toLowerCase() || "";
  if (setLower && lower.includes(setLower)) {
    score += 8;
  }

  // +6 Card number match, -3 if expected but missing
  if (params.cardNumber) {
    if (lower.includes(`#${params.cardNumber}`)) {
      score += 6;
    } else if (extractCardNumbers(lower).length === 0) {
      score -= 3;
    }
  }

  // +5 Parallel or synonym match
  const parallelLower = params.selectedParallel?.toLowerCase() || "";
  if (parallelLower) {
    // Exact parallel match
    if (lower.includes(parallelLower)) {
      score += 5;
    }
    // "Holo Prizm" is a valid Optic Holo synonym
    if (parallelLower.includes("holo") && lower.includes("holo prizm")) {
      score += 5;
    }
    // Silver Prizm special case (legacy behavior)
    if (params.wantsSilverPrizm && lower.includes("silver") && lower.includes("prizm")) {
      score += 5;
    }
  }

  // +4 "Rated Rookie" / "RR" match
  if (lower.includes("rated rookie") || lower.includes("rated rookies") || /\brr\b/.test(lower)) {
    score += 4;
  }

  // -8 Wrong set strongly implied
  // Example: User selected Optic, but title says "Prizm" WITHOUT "Optic"
  if (setLower === "optic" && lower.includes("prizm") && !lower.includes("optic") && !lower.includes("holo prizm")) {
    score -= 8;
  }
  if (setLower === "prizm" && lower.includes("optic") && !lower.includes("prizm")) {
    score -= 8;
  }

  // -5 Junk signals
  const junkSignals = ["lot of", "card lot", "break", "digital", "custom", "reprint", "rp", "copy"];
  if (junkSignals.some(signal => lower.includes(signal))) {
    score -= 5;
  }

  // Legacy insert penalties (reduced weight)
  if (!params.wantsNoHuddle && lower.includes("no huddle")) {
    score -= 5;
  }
  if (!params.wantsInsert && hasInsertSignal(lower)) {
    score -= 5;
  }

  return score;
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
