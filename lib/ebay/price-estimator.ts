// Price Estimator - Estimated Sale Range from Active Listings
// Uses ONLY Browse API data to simulate directional pricing
// NOT actual sold prices - always labeled "Estimated from active listings (Beta)"

import type { ForSaleItem } from "./types";
import { normalizeSetName } from "./utils";

// ============================================================================
// TYPES
// ============================================================================

export interface EstimateParams {
  playerName: string;
  year?: string;
  set?: string;
  grade?: string;
  rookieRequired?: boolean;
}

export interface MarketAsk {
  count: number;
  medianAsk: number;
  p20: number;
  p80: number;
}

export interface EstimatedSaleRange {
  low: number;
  high: number;
  discountApplied: number;
  confidence: "high" | "medium" | "low";
  spreadPct: number;
}

export interface PriceEstimate {
  pricingAvailable: true;
  marketAsk: MarketAsk;
  estimatedSaleRange: EstimatedSaleRange;
  notes: string[];
  dataQuality: {
    totalListings: number;
    afterFiltering: number;
    afterOutliers: number;
    auctionPct: number;
  };
}

export interface PriceEstimateUnavailable {
  pricingAvailable: false;
  reason: string;
  notes: string[];
}

export type PriceEstimateResult = PriceEstimate | PriceEstimateUnavailable;

// ============================================================================
// RELEVANCE FILTERING
// ============================================================================

const JUNK_KEYWORDS = [
  /\blot\b/i,
  /\bbulk\b/i,
  /\bbundle\b/i,
  /\bx\s*[2-9]\b/i,
  /\bx\s*\d{2,}\b/i,
  /\b\d+\s*cards?\b/i,
  /\bcollection\b/i,
  /\brandom\b/i,
  /\bpick\b/i,
  /\bchoose\b/i,
  /\brepack\b/i,
  /\bmystery\b/i,
];

/** Set families that conflict (e.g. Prizm vs Optic, Prizm vs Phoenix). Query set implies exclude conflicting sets. */
const SET_FAMILIES = ["prizm", "optic", "mosaic", "select", "phoenix"] as const;

function getSetFamily(normalized: string): (typeof SET_FAMILIES)[number] | null {
  const n = normalized.toLowerCase();
  for (const f of SET_FAMILIES) {
    if (n.includes(f)) return f;
  }
  return null;
}

function isJunkListing(title: string): boolean {
  return JUNK_KEYWORDS.some((p) => p.test(title));
}

function matchesPlayer(title: string, playerName: string): boolean {
  const titleLower = title.toLowerCase();
  const parts = playerName.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.every((part) => titleLower.includes(part));
}

function matchesYear(title: string, year: string): boolean {
  const y = year.replace(/\D/g, "").slice(0, 4);
  if (!y) return true;
  return new RegExp(`\\b${y}\\b`).test(title);
}

function matchesSetAndExcludeMismatch(title: string, querySet: string): boolean {
  const q = normalizeSetName(querySet);
  const qFamily = getSetFamily(q);
  const titleLower = title.toLowerCase();

  // Title must contain query set (prizm/prism, optic, etc.)
  if (qFamily === "prizm") {
    if (!titleLower.includes("prizm") && !titleLower.includes("prism")) return false;
  } else if (qFamily) {
    if (!titleLower.includes(qFamily)) return false;
  } else {
    // Generic set token
    const tok = q.split(/\s+/)[0];
    if (tok && !titleLower.includes(tok)) return false;
  }

  // Hard exclude conflicting sets. When query is Prizm, reject Phoenix/Optic/Mosaic/Select
  // even if title has "prizm" (e.g. "Panini Phoenix ... Silver Hyper Prizm" — Prizm is parallel).
  if (qFamily === "prizm") {
    if (titleLower.includes("phoenix")) return false;
    if (titleLower.includes("optic")) return false;
    if (titleLower.includes("mosaic")) return false;
    if (titleLower.includes("select")) return false;
  }
  if (qFamily === "optic") {
    if ((titleLower.includes("prizm") || titleLower.includes("prism")) && !titleLower.includes("optic"))
      return false;
    if (titleLower.includes("mosaic") && !titleLower.includes("optic")) return false;
    if (titleLower.includes("phoenix") && !titleLower.includes("optic")) return false;
    if (titleLower.includes("select") && !titleLower.includes("optic")) return false;
  }
  if (qFamily === "mosaic") {
    if ((titleLower.includes("prizm") || titleLower.includes("prism")) && !titleLower.includes("mosaic"))
      return false;
    if (titleLower.includes("optic") && !titleLower.includes("mosaic")) return false;
    if (titleLower.includes("phoenix") && !titleLower.includes("mosaic")) return false;
    if (titleLower.includes("select") && !titleLower.includes("mosaic")) return false;
  }
  if (qFamily === "select") {
    if ((titleLower.includes("prizm") || titleLower.includes("prism")) && !titleLower.includes("select"))
      return false;
    if (titleLower.includes("optic") && !titleLower.includes("select")) return false;
    if (titleLower.includes("mosaic") && !titleLower.includes("select")) return false;
    if (titleLower.includes("phoenix") && !titleLower.includes("select")) return false;
  }
  if (qFamily === "phoenix") {
    if ((titleLower.includes("prizm") || titleLower.includes("prism")) && !titleLower.includes("phoenix"))
      return false;
    if (titleLower.includes("optic") && !titleLower.includes("phoenix")) return false;
    if (titleLower.includes("mosaic") && !titleLower.includes("phoenix")) return false;
    if (titleLower.includes("select") && !titleLower.includes("phoenix")) return false;
  }

  return true;
}

function matchesRookie(title: string): boolean {
  return /\bRC\b/i.test(title) || /\brookie\b/i.test(title);
}

function isGraded(title: string): boolean {
  return /\b(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?/i.test(title);
}

function extractGrade(title: string): string | null {
  const m = title.match(/\b(PSA|BGS|SGC|CGC)\s*(\d+(\.\d+)?)/i);
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2]}`;
}

function isAuction(item: ForSaleItem): boolean {
  const c = (item.condition || "").toLowerCase();
  return c.includes("auction") || c.includes("bid");
}

/**
 * Relevance filter: required tokens = player (first/last), year, set (Prizm vs Optic etc.), rookie if required.
 * Hard exclude set mismatches.
 */
function isRelevant(item: ForSaleItem, params: EstimateParams): boolean {
  if (isJunkListing(item.title)) return false;
  if (!matchesPlayer(item.title, params.playerName)) return false;
  if (params.year && !matchesYear(item.title, params.year)) return false;
  if (params.set && !matchesSetAndExcludeMismatch(item.title, params.set)) return false;
  if (params.rookieRequired && !matchesRookie(item.title)) return false;
  return true;
}

/**
 * Split RAW vs GRADED *before* any stats.
 * RAW = no PSA/BGS/SGC/CGC. GRADED = has grade; if targetGrade, exact match only.
 */
function splitRawVsGraded(
  items: ForSaleItem[],
  targetGrade?: string
): { raw: ForSaleItem[]; graded: ForSaleItem[] } {
  const raw: ForSaleItem[] = [];
  const graded: ForSaleItem[] = [];
  const normGrade = targetGrade ? targetGrade.toUpperCase().replace(/\s+/g, " ").trim() : null;

  for (const item of items) {
    if (isGraded(item.title)) {
      if (normGrade) {
        const g = extractGrade(item.title);
        const ng = g ? g.toUpperCase().replace(/\s+/g, " ").trim() : null;
        if (ng === normGrade) graded.push(item);
      } else {
        graded.push(item);
      }
    } else {
      raw.push(item);
    }
  }
  return { raw, graded };
}

// ============================================================================
// OUTLIER REMOVAL
// ============================================================================

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Outlier removal:
 * - n >= 8: IQR filter (1.5 * IQR).
 * - n < 8: drop outside [0.3 * median, 3 * median].
 */
function removeOutliers(prices: number[]): number[] {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const med = percentile(sorted, 50);

  if (sorted.length >= 8) {
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    return sorted.filter((p) => p >= lo && p <= hi);
  }

  const lo = 0.3 * med;
  const hi = 3 * med;
  return sorted.filter((p) => p >= lo && p <= hi);
}

// ============================================================================
// ROBUST STATS (median, p20, p80 — no min/max for headline)
// ============================================================================

function computeRobustStats(prices: number[]): MarketAsk {
  if (prices.length === 0) {
    return { count: 0, medianAsk: 0, p20: 0, p80: 0 };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianAsk: percentile(sorted, 50),
    p20: percentile(sorted, 20),
    p80: percentile(sorted, 80),
  };
}

// ============================================================================
// DISCOUNT & CONFIDENCE
// ============================================================================

function calculateDiscount(
  marketAsk: MarketAsk,
  auctionPct: number
): { discount: number; spreadPct: number } {
  let discount = 0.12;
  const spreadPct =
    marketAsk.medianAsk > 0 ? (marketAsk.p80 - marketAsk.p20) / marketAsk.medianAsk : 0;
  const spreadDiscount = Math.min(0.12, spreadPct * 0.12);
  discount += spreadDiscount;
  discount += Math.min(0.08, (marketAsk.count / 50) * 0.08);
  if (auctionPct > 0.5) discount += 0.05;
  discount = Math.max(0.1, Math.min(0.3, discount));
  return { discount, spreadPct };
}

/**
 * Confidence. If n < 5 after filtering → always "low".
 */
function calculateConfidence(
  n: number,
  spreadPct: number
): "high" | "medium" | "low" {
  if (n < 5) return "low";
  if (n >= 5 && spreadPct < 0.4) return "high";
  if (n >= 3 && spreadPct < 0.7) return "medium";
  return "low";
}

// ============================================================================
// MAIN ESTIMATOR
// ============================================================================

/**
 * Estimate sale range from active listings.
 * Uses relevance filtering, RAW vs GRADED buckets, robust stats (p20/p50/p80), and IQR/median-based outlier removal.
 */
export function estimateSaleRange(
  items: ForSaleItem[],
  paramsOrPlayer: EstimateParams | string,
  targetGradeOrUndefined?: string
): PriceEstimateResult {
  const params: EstimateParams =
    typeof paramsOrPlayer === "string"
      ? { playerName: paramsOrPlayer, grade: targetGradeOrUndefined }
      : paramsOrPlayer;
  const totalListings = items.length;

  // 1) Relevance filter
  const relevant = items.filter((i) => isRelevant(i, params));

  // 2) Split RAW vs GRADED before any stats
  const { raw, graded } = splitRawVsGraded(relevant, params.grade);
  const bucket = params.grade ? graded : raw.length > 0 ? raw : graded;
  const afterFiltering = bucket.length;

  if (afterFiltering < 2) {
    return {
      pricingAvailable: false,
      reason:
        afterFiltering === 0 ? "No matching listings found" : "Insufficient data (need at least 2 listings)",
      notes: [
        "Unable to estimate pricing",
        "Try broadening your search criteria",
        `Found ${raw.length} raw and ${graded.length} graded listings after relevance filtering`,
      ],
    };
  }

  const prices = bucket.map((i) => i.price);
  const auctionCount = bucket.filter(isAuction).length;
  const auctionPct = auctionCount / bucket.length;

  // 3) Outlier removal
  const cleaned = removeOutliers(prices);
  const afterOutliers = cleaned.length;

  if (afterOutliers < 2) {
    return {
      pricingAvailable: false,
      reason: "Too few listings after outlier removal",
      notes: [
        "Unable to estimate pricing",
        `After filtering: ${afterFiltering} listings; after outlier removal: ${afterOutliers}`,
      ],
    };
  }

  // 4) Robust stats (median, p20, p80; no min/max)
  const marketAsk = computeRobustStats(cleaned);

  // 5) Discount and estimated range
  const { discount, spreadPct } = calculateDiscount(marketAsk, auctionPct);
  let estimatedLow = Math.round(marketAsk.medianAsk * (1 - discount - 0.05) * 100) / 100;
  let estimatedHigh = Math.round(marketAsk.medianAsk * (1 - discount + 0.05) * 100) / 100;

  // 6) Confidence; if n < 5 → low, wider range or unreliable
  const confidence = calculateConfidence(afterOutliers, spreadPct);

  let finalLow = estimatedLow;
  let finalHigh = estimatedHigh;
  if (confidence === "low") {
    const mid = (estimatedLow + estimatedHigh) / 2;
    const wider = (estimatedHigh - estimatedLow) * 2;
    finalLow = Math.round((mid - wider / 2) * 100) / 100;
    finalHigh = Math.round((mid + wider / 2) * 100) / 100;
  } else if (confidence === "medium") {
    const mid = (estimatedLow + estimatedHigh) / 2;
    const wider = (estimatedHigh - estimatedLow) * 1.2;
    finalLow = Math.round((mid - wider / 2) * 100) / 100;
    finalHigh = Math.round((mid + wider / 2) * 100) / 100;
  }
  finalLow = Math.max(0.01, finalLow);

  const notes: string[] = [
    "Estimated from active listings (Beta)",
    "Directional pricing only - verify before buying/selling",
  ];
  if (confidence === "low") {
    notes.push("Low confidence - limited data or wide spread; range may be unreliable");
  }
  if (auctionPct > 0.3) {
    notes.push(`${Math.round(auctionPct * 100)}% of listings are auctions`);
  }

  return {
    pricingAvailable: true,
    marketAsk: {
      count: marketAsk.count,
      medianAsk: Math.round(marketAsk.medianAsk * 100) / 100,
      p20: Math.round(marketAsk.p20 * 100) / 100,
      p80: Math.round(marketAsk.p80 * 100) / 100,
    },
    estimatedSaleRange: {
      low: finalLow,
      high: finalHigh,
      discountApplied: Math.round(discount * 100),
      confidence,
      spreadPct: Math.round(spreadPct * 100),
    },
    notes,
    dataQuality: {
      totalListings,
      afterFiltering,
      afterOutliers,
      auctionPct: Math.round(auctionPct * 100),
    },
  };
}

/**
 * Legacy filterListings export for callers that still use it.
 * Applies relevance + RAW/GRADED split; returns filtered bucket as before.
 */
export function filterListings(
  items: ForSaleItem[],
  playerName: string,
  targetGrade?: string
): { filtered: ForSaleItem[]; raw: ForSaleItem[]; graded: ForSaleItem[] } {
  const params: EstimateParams = { playerName, grade: targetGrade };
  const relevant = items.filter((i) => isRelevant(i, params));
  const { raw, graded } = splitRawVsGraded(relevant, targetGrade);
  const filtered = targetGrade ? graded : raw.length > 0 ? raw : graded;
  return { filtered, raw, graded };
}
