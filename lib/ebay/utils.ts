// eBay utility functions

import type { EbaySearchParams } from "./types";
import { getSetProfile, resolveSetTaxonomy } from "./set-taxonomy";
import crypto from "crypto";

const EXCLUSION_OPERATOR_PATTERN = /(^|\s)-(?:"[^"]+"|\S+)/g;

function stripExclusionOperators(value: string): string {
  return value
    .replace(EXCLUSION_OPERATOR_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushPositivePart(parts: string[], value?: string | null): void {
  if (!value) return;
  const cleaned = stripExclusionOperators(value);
  if (cleaned) parts.push(cleaned);
}

/**
 * Build eBay search query from params. Positive identifiers only.
 * No negative keywords or exclusion operators; filtering happens after retrieval.
 */
export function buildSearchQuery(params: EbaySearchParams): string {
  const parts: string[] = [];
  pushPositivePart(parts, params.player);
  pushPositivePart(parts, params.year);
  const selectedSet = params.set ? resolveSetTaxonomy(params.set) : null;
  const selectedProfile = params.set ? getSetProfile(params.set) : null;
  if (params.set) {
    let set = stripExclusionOperators(params.set);
    if (!set) {
      set = params.set.trim();
    }
    const setLower = set.toLowerCase();
    if (setLower.includes("prism") && !setLower.includes("prizm")) {
      set = set.replace(/prism/gi, "Prizm");
    }
    pushPositivePart(parts, set);
    if (selectedSet) {
      for (const term of selectedSet.requiredTerms) {
        if (!parts.some((part) => part.toLowerCase().includes(term.toLowerCase()))) {
          pushPositivePart(parts, term);
        }
      }
    }
    if (selectedProfile) {
      for (const term of selectedProfile.requiredAll) {
        if (!parts.some((part) => part.toLowerCase().includes(term.toLowerCase()))) {
          pushPositivePart(parts, term);
        }
      }
      if (selectedProfile.requiredAny.length > 0) {
        pushPositivePart(parts, `(${selectedProfile.requiredAny.join(" OR ")})`);
      }
    }
  }
  pushPositivePart(parts, params.grade);
  pushPositivePart(parts, params.cardNumber);
  if (params.parallelType) {
    let parallel = stripExclusionOperators(params.parallelType);
    if (!parallel) {
      parallel = params.parallelType;
    }
    const parallelLower = parallel.toLowerCase();
    if (parallelLower.includes("prism") && !parallelLower.includes("prizm")) {
      parallel = parallel.replace(/prism/gi, "Prizm");
    }
    if (parallelLower.includes("silver") && (parallelLower.includes("prism") || parallelLower.includes("prizm"))) {
      pushPositivePart(parts, "silver");
      pushPositivePart(parts, "prizm");
    } else {
      pushPositivePart(parts, parallel);
    }
  }
  if (params.serialNumber) pushPositivePart(parts, `/${params.serialNumber}`);
  pushPositivePart(parts, params.variation);
  if (params.autograph) pushPositivePart(parts, "Auto");
  if (params.relic) pushPositivePart(parts, "Relic");
  if (params.keywords?.length) {
    for (const keyword of params.keywords) {
      pushPositivePart(parts, keyword);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Terms that indicate a listing is junk; reject if title contains any (case-insensitive). */
const JUNK_TITLE_TERMS = [
  "lot",
  "lots",
  "break",
  "case",
  "box",
  "pack",
  "blaster",
  "hobby box",
  "digital",
  "reprint",
  "replica",
  "proxy",
  "custom",
];

/**
 * Reject listing if title contains any junk term (case-insensitive).
 * Applied after retrieval, before price extraction.
 */
export function isJunkListing(title: string): boolean {
  const lower = title.toLowerCase();
  return JUNK_TITLE_TERMS.some((term) => lower.includes(term));
}

/**
 * Normalize query for caching (lowercase, trim, standardize)
 */
export function normalizeQueryForCache(params: EbaySearchParams): string {
  const parts: string[] = [];

  // Player name - lowercase, trim extra spaces
  parts.push(params.player.toLowerCase().trim().replace(/\s+/g, " "));

  // Year - just the number
  if (params.year) {
    const yearMatch = params.year.match(/\d{4}/);
    if (yearMatch) parts.push(yearMatch[0]);
  }

  // Set - normalized
  if (params.set) {
    parts.push(normalizeSetName(params.set));
  }

  // Grade - standardized format
  if (params.grade) {
    parts.push(normalizeGrade(params.grade));
  }

  // Parallel type
  if (params.parallelType) {
    parts.push(params.parallelType.toLowerCase().trim());
  }

  // Card number
  if (params.cardNumber) {
    parts.push(params.cardNumber.replace(/^#/, "").trim());
  }

  // Limit (for cache key differentiation)
  if (params.limit !== undefined) {
    parts.push(`limit:${params.limit}`);
  }

  return parts.join("|");
}

/**
 * Generate a hash for cache key
 */
export function hashQuery(normalizedQuery: string): string {
  return crypto.createHash("md5").update(normalizedQuery).digest("hex");
}

/**
 * Normalize set name for better matching
 */
export function normalizeSetName(setName: string): string {
  let normalized = setName.toLowerCase().trim();
  // Remove common sport suffixes
  normalized = normalized.replace(/\s+(football|basketball|baseball|hockey|soccer)\b/gi, "");
  // Remove leading brand
  normalized = normalized.replace(/^panini\s+/i, "");
  // Standardize common variations
  normalized = normalized.replace(/prizm/gi, "prizm");
  normalized = normalized.replace(/optic/gi, "optic");
  normalized = normalized.replace(/select/gi, "select");
  normalized = normalized.replace(/mosaic/gi, "mosaic");
  return normalized.trim();
}

/**
 * Normalize grade format (PSA 10, BGS 9.5, etc)
 */
export function normalizeGrade(grade: string): string {
  const upper = grade.toUpperCase().trim();
  // Already normalized format
  if (/^(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?$/i.test(upper)) {
    return upper.replace(/\s+/g, " ");
  }
  // Just a number - assume PSA
  if (/^\d+(\.\d+)?$/.test(upper)) {
    return `PSA ${upper}`;
  }
  return upper;
}

/**
 * Build eBay search URL for active listings
 */
export function buildActiveListingsUrl(params: EbaySearchParams): string {
  const query = buildSearchQuery(params);
  const encodedQuery = encodeURIComponent(query);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=212&_sop=15&_ipg=60`;
}

/**
 * Build eBay search URL for sold listings
 */
export function buildSoldListingsUrl(params: EbaySearchParams): string {
  const query = buildSearchQuery(params);
  const encodedQuery = encodeURIComponent(query);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=212&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
}

/**
 * Calculate median from array of numbers
 */
export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate stats from prices
 */
export function calculatePriceStats(prices: number[]): { low: number; median: number; high: number } {
  if (prices.length === 0) {
    return { low: 0, median: 0, high: 0 };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    low: sorted[0],
    median: calculateMedian(sorted),
    high: sorted[sorted.length - 1],
  };
}

/**
 * Filter out outlier prices (beyond 2 standard deviations or obvious junk)
 */
export function filterOutliers(prices: number[]): number[] {
  if (prices.length < 3) return prices;

  // Remove obvious junk (< $0.50 or > $50,000)
  let filtered = prices.filter(p => p >= 0.5 && p <= 50000);

  if (filtered.length < 3) return filtered;

  // Calculate mean and std dev
  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const variance = filtered.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / filtered.length;
  const stdDev = Math.sqrt(variance);

  // Remove items beyond 2 standard deviations
  const lowerBound = mean - 2 * stdDev;
  const upperBound = mean + 2 * stdDev;

  return filtered.filter(p => p >= lowerBound && p <= upperBound);
}

/**
 * Check if title indicates a lot/bundle (not single card)
 */
export function isLotOrBundle(title: string): boolean {
  const lower = title.toLowerCase();
  const lotPatterns = [
    /\blot\b/,
    /\bbundle\b/,
    /\b\d+\s*cards?\b/,
    /\b\d+x\b/,
    /\bcollection\b/,
    /\bset\b(?!\s+name)/,
    /\bgroup\b/,
    /\bmixed\b/,
    /\brandom\b/,
    /\bpick\b/,
    /\bchoose\b/,
    /\byou\s+pick\b/,
  ];
  return lotPatterns.some(pattern => pattern.test(lower));
}

/**
 * Check if a listing title matches the requested set (e.g. Prizm vs Phoenix).
 * Used to validate comps before returning (e.g. watchlist single-comp).
 * Rejects e.g. "Panini Phoenix ... Silver Hyper Prizm" when user asked for Prizm (set).
 */
export function listingMatchesRequestedSet(title: string, set: string | null | undefined): boolean {
  if (!set || !set.trim()) return true;
  const titleLower = title.toLowerCase();
  const setLower = set.toLowerCase().trim();

  if (setLower.includes("prizm") || setLower.includes("prism")) {
    if (!titleLower.includes("prizm") && !titleLower.includes("prism")) return false;
    if (titleLower.includes("phoenix")) return false;
    if (titleLower.includes("optic")) return false;
    if (titleLower.includes("mosaic")) return false;
    if (titleLower.includes("select")) return false;
    return true;
  }
  if (setLower.includes("mosaic")) {
    if (!titleLower.includes("mosaic")) return false;
    if (titleLower.includes("phoenix")) return false;
    if (titleLower.includes("optic")) return false;
    if (titleLower.includes("select")) return false;
    return true;
  }
  if (setLower.includes("optic")) {
    if (!titleLower.includes("optic")) return false;
    if (titleLower.includes("phoenix")) return false;
    if (titleLower.includes("mosaic")) return false;
    if (titleLower.includes("select")) return false;
    return true;
  }
  if (setLower.includes("select")) {
    if (!titleLower.includes("select")) return false;
    if (titleLower.includes("phoenix")) return false;
    if (titleLower.includes("mosaic")) return false;
    if (titleLower.includes("optic")) return false;
    return true;
  }
  if (setLower.includes("phoenix")) {
    if (!titleLower.includes("phoenix")) return false;
    if (titleLower.includes("mosaic")) return false;
    if (titleLower.includes("optic")) return false;
    if (titleLower.includes("select")) return false;
    return true;
  }
  return true;
}

/**
 * Check if title matches the player we're searching for
 * Also validates set name if provided to avoid mismatches (e.g., Prizm vs Mosaic)
 * Made more flexible to allow variations (e.g., "Silver Hyper Prizm" matches "Silver Prizm")
 */
export function titleMatchesPlayer(title: string, playerName: string, set?: string, parallelType?: string): boolean {
  const titleLower = title.toLowerCase();
  const nameParts = playerName.toLowerCase().split(/\s+/);

  // Check if all name parts are in the title
  const playerMatches = nameParts.every(part => titleLower.includes(part));
  if (!playerMatches) return false;

  // If set is provided, ensure it matches (critical for Prizm vs Mosaic distinction)
  if (set) {
    const setLower = set.toLowerCase();
    const titleSet = titleLower;
    
    // If searching for Prizm, reject Mosaic cards (but allow Prizm variations)
    if (setLower.includes("prizm") && !setLower.includes("mosaic")) {
      if (titleSet.includes("mosaic") && !titleSet.includes("prizm")) {
        return false; // This is a Mosaic card, not Prizm
      }
      // Allow Prizm variations (Prizm, Prism, etc.) - don't require exact match
      if (!titleSet.includes("prizm") && !titleSet.includes("prism")) {
        return false; // Must have some form of Prizm/Prism
      }
    }
    
    // If searching for Mosaic, reject Prizm cards
    if (setLower.includes("mosaic")) {
      if (titleSet.includes("prizm") && !titleSet.includes("mosaic")) {
        return false; // This is a Prizm card, not Mosaic
      }
    }
  }

  // If parallel type is specified, be more flexible with variations
  if (parallelType) {
    const parallelLower = parallelType.toLowerCase();
    // For "silver prism" or "silver prizm", allow variations like "silver hyper prizm", "silver patch", etc.
    if (parallelLower.includes("silver") && (parallelLower.includes("prism") || parallelLower.includes("prizm"))) {
      // Must have "silver" and some form of "prizm/prism"
      if (!titleLower.includes("silver")) {
        return false;
      }
      // Allow variations: prizm, prism, hyper prizm, patch prizm, etc.
      if (!titleLower.includes("prizm") && !titleLower.includes("prism")) {
        return false;
      }
      // Don't reject "hyper", "patch", "wave" variations - these are still silver prizm cards
    } else if (parallelLower.includes("silver")) {
      // Just "silver" - must have silver in title
      if (!titleLower.includes("silver")) {
        return false;
      }
    } else if (!titleLower.includes(parallelLower)) {
      // For other parallel types, require exact match
      return false;
    }
  }

  return true;
}

// ============================================================================
// LISTING FIELD EXTRACTION (used by browse-api + dual-signal for hard constraints)
// ============================================================================

/**
 * Extract card numbers from a listing title.
 * Matches #349, # 349, No. 349, No 349, Card 349
 * but NOT /349 (serial) or bare 2024 (year).
 */
export function extractCardNumbers(title: string): string[] {
  const results: string[] = [];
  let m;

  // Pattern 1: #349, # 349
  const hashPattern = /#\s*(\d+)\b/g;
  while ((m = hashPattern.exec(title)) !== null) {
    results.push(m[1]);
  }

  // Pattern 2: "No. 349", "No 349", "no. 349"
  const noPattern = /\bno\.?\s*(\d+)\b/gi;
  while ((m = noPattern.exec(title)) !== null) {
    results.push(m[1]);
  }

  // Pattern 3: "Card 349", "card 349" — exclude 4-digit years (19xx/20xx)
  const cardPattern = /\bcard\s+(\d+)\b/gi;
  while ((m = cardPattern.exec(title)) !== null) {
    if (/^(19|20)\d{2}$/.test(m[1])) continue;
    results.push(m[1]);
  }

  return [...new Set(results)];
}

/**
 * Returns true if the listing title does NOT contradict the wanted grade.
 *
 * Rules:
 * - If we can't parse the wanted grade → allow (true)
 * - If the title has no grading info → allow (true)
 * - If the title mentions the SAME grading company with a DIFFERENT numeric grade → reject (false)
 * - Otherwise → allow (true)
 */
export function titleMatchesGrade(titleLower: string, wantedGrade: string): boolean {
  if (!wantedGrade) return true;

  // Parse wanted: "PSA 9" → grader = "psa", value = "9"
  const wantedMatch = wantedGrade.toLowerCase().match(/\b(psa|bgs|sgc|cgc)\s*(\d+\.?\d*)\b/);
  if (!wantedMatch) return true;
  const wantedGrader = wantedMatch[1];
  const wantedValue = wantedMatch[2];

  // Find all grading references in the title
  const gradePattern = new RegExp(`\\b(psa|bgs|sgc|cgc)\\s*(\\d+\\.?\\d*)\\b`, "gi");
  let m;
  while ((m = gradePattern.exec(titleLower)) !== null) {
    if (m[1].toLowerCase() === wantedGrader && m[2] !== wantedValue) {
      return false; // Same grading company, different numeric grade
    }
  }
  return true;
}

/**
 * Canonical list of insert / sub-set keywords for sports trading cards.
 * Used to reject insert listings when the user searched for a non-insert parallel.
 * Keep in sync: this is the single source of truth; browse-api and dual-signal both import it.
 */
/**
 * Terms that identify ACTUAL insert sub-sets (not generic parallel descriptors).
 *
 * IMPORTANT: Do NOT add generic words like "variation", "refractor", "prizmatic"
 * here — eBay sellers commonly include these in titles for SEO and they will
 * cause false-positive rejections of legitimate parallel listings.
 */
export const INSERT_KEYWORDS: string[] = [
  // Panini Prizm / Optic insert sub-sets
  "emergent",
  "instant impact",
  "fireworks",
  "stargazing",
  "downtown",
  "kaboom",
  "color blast",
  "colorblast",
  "color-blast",
  "color wheel",
  "stained glass",
  "color wave",
  "illumination",
  "intro",
  "sophomore stars",
  "all americans",
  "all-americans",
  "draft picks",
  "no huddle",
  // Common sub-set / insert lines (must be specific insert names)
  "rookie gear",
  "deca brilliance",
  "next level",
  "sensational",
  "widescreen",
  "instant classic",
  "game breaker",
  "rookie revolution",
  "color pop",
  "rookie patch",
  "flashback rookie",
];

/**
 * Get parallel type alternatives for fallback searches
 */
export function getParallelAlternatives(parallelType: string): string[] {
  const lower = parallelType.toLowerCase();
  const alternatives: string[] = [parallelType];

  const mappings: Record<string, string[]> = {
    "holo": ["Holographic", "Holo Prizm", "Holo"],
    "holographic": ["Holo", "Holo Prizm"],
    "refractor": ["Refractor", "Chrome Refractor"],
    "silver prizm": ["Silver", "Silver Prizm", "Prizm Silver"],
    "gold prizm": ["Gold", "Gold Prizm", "Prizm Gold"],
    "red prizm": ["Red", "Red Prizm", "Prizm Red"],
    "blue prizm": ["Blue", "Blue Prizm", "Prizm Blue"],
    "green prizm": ["Green", "Green Prizm", "Prizm Green"],
    "orange prizm": ["Orange", "Orange Prizm", "Prizm Orange"],
    "purple prizm": ["Purple", "Purple Prizm", "Prizm Purple"],
    "black prizm": ["Black", "Black Prizm", "Prizm Black"],
    "shimmer": ["Shimmer", "Shimmer Prizm"],
    "cracked ice": ["Cracked Ice", "Ice"],
    "mojo": ["Mojo", "Mojo Prizm"],
    "wave": ["Wave", "Wave Prizm"],
  };

  if (mappings[lower]) {
    alternatives.push(...mappings[lower]);
  } else {
    for (const [key, values] of Object.entries(mappings)) {
      if (lower.includes(key) || key.includes(lower)) {
        alternatives.push(...values);
      }
    }
  }

  return [...new Set(alternatives)];
}
