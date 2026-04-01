import type { ForSaleItem } from "@/lib/ebay/types";
import { extractCardNumbers, isJunkListing, isLotOrBundle, listingMatchesRequestedSet, titleMatchesPlayer } from "@/lib/ebay/utils";
import type { CmvMethod } from "@/lib/market-discount/types";

export type CompCategory = "exact" | "similar" | "support" | "rejected";

export type IncludeReasonCode =
  | "exact_identity_match"
  | "exact_sold_comp"
  | "recent_sale"
  | "same_grade"
  | "strong_title_match"
  | "supporting_similar_comp"
  | "fallback_active_support"
  | "acceptable_adjacent_grade"
  | "limited_market_support";

export type ExcludeReasonCode =
  | "wrong_parallel"
  | "wrong_grade"
  | "raw_graded_mismatch"
  | "low_identity_confidence"
  | "stale_comp"
  | "likely_bundle_or_lot"
  | "likely_non_exact_variant"
  | "suspicious_outlier"
  | "duplicate_or_relist"
  | "active_only_not_primary"
  | "broad_fallback_too_weak"
  | "insufficient_metadata"
  | "custom_or_reprint_risk";

export type DisclaimerState =
  | "fallback_only_estimate"
  | "active_listing_heavy_estimate"
  | "low_sample_estimate"
  | "wide_spread_estimate"
  | "grade_mismatch_support"
  | "sparse_rare_card_estimate"
  | "identity_uncertainty"
  | "no_trustworthy_exact_comps";

export interface CompQueryContext {
  player: string;
  year?: string;
  set?: string;
  grade?: string;
  cardNumber?: string;
  parallelType?: string;
  serialNumber?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
}

export interface EvaluatedComp {
  item: ForSaleItem;
  included: boolean;
  category: CompCategory;
  includeReasonCodes: IncludeReasonCode[];
  excludeReasonCodes: ExcludeReasonCode[];
  includeReasonsText: string[];
  excludeReasonsText: string[];
  matchConfidence: number;
  identityConfidence: number;
  valuationWeight: number;
  qualityScore: number;
}

export interface CompEvaluationResult {
  exactComps: EvaluatedComp[];
  similarComps: EvaluatedComp[];
  supportComps: EvaluatedComp[];
  rejectedComps: EvaluatedComp[];
  confidenceScore: number;
  confidenceBand: "high" | "medium" | "low" | "very_low";
  confidenceExplanation: string;
  valuationSource:
    | "exact_sold"
    | "mixed_sold"
    | "active_directional"
    | "insufficient_exact_comps";
  usedCompCount: number;
  exactCompCount: number;
  similarCompCount: number;
  supportCompCount: number;
  rejectedCompCount: number;
  spreadPct: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  midpoint: number | null;
  disclaimerStates: DisclaimerState[];
  disclaimerMessages: string[];
  includeReasonSummary: string[];
  excludeReasonSummary: string[];
}

interface BuildEvaluationInput {
  items: ForSaleItem[];
  query: CompQueryContext;
  passUsed?: "strict" | "broad" | "minimal";
  marketMethod?: CmvMethod;
  soldCount?: number;
}

const INCLUDE_REASON_TEXT: Record<IncludeReasonCode, string> = {
  exact_identity_match: "Exact identity match",
  exact_sold_comp: "Exact sold comp",
  recent_sale: "Recent market activity",
  same_grade: "Same grade match",
  strong_title_match: "Strong title match",
  supporting_similar_comp: "Used as supporting similar comp",
  fallback_active_support: "Used as active listing support",
  acceptable_adjacent_grade: "Adjacent grade support",
  limited_market_support: "Limited market support only",
};

const EXCLUDE_REASON_TEXT: Record<ExcludeReasonCode, string> = {
  wrong_parallel: "Wrong parallel/variation",
  wrong_grade: "Wrong grade",
  raw_graded_mismatch: "Raw vs graded mismatch",
  low_identity_confidence: "Identity confidence too low",
  stale_comp: "Comp is stale",
  likely_bundle_or_lot: "Likely lot/bundle listing",
  likely_non_exact_variant: "Likely non-exact variant",
  suspicious_outlier: "Suspicious price outlier",
  duplicate_or_relist: "Likely duplicate/relisted item",
  active_only_not_primary: "Active listing support is not primary",
  broad_fallback_too_weak: "Fallback match is too weak",
  insufficient_metadata: "Insufficient metadata",
  custom_or_reprint_risk: "Custom/reprint risk",
};

const DISCLAIMER_TEXT: Record<DisclaimerState, string> = {
  fallback_only_estimate:
    "This estimate is based mostly on similar cards and fallback search results, not strong exact sold comps. Treat this as directional, not precise.",
  active_listing_heavy_estimate:
    "Recent sold data is limited. This estimate relies partly on active listings, which reflect asking prices rather than confirmed market sales.",
  low_sample_estimate:
    "Very few relevant comps were found. Confidence is limited, and the true market value may vary materially.",
  wide_spread_estimate:
    "Recent comps vary widely, which suggests a less stable market for this card. Use the displayed range more than the midpoint.",
  grade_mismatch_support:
    "Some supporting comps are from similar cards or adjacent grades, not exact matches.",
  sparse_rare_card_estimate:
    "This appears to be a rare or low-liquidity card. Pricing is inherently less certain due to limited market activity.",
  identity_uncertainty:
    "Some card details could not be confirmed with high confidence, so the estimate may include weaker matches.",
  no_trustworthy_exact_comps:
    "We could not find enough trustworthy exact comps to produce a strong market-value estimate.",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: string | undefined | null): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9/\s.#-]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCardNumber(value: string | undefined): string {
  return (value ?? "").replace(/^#/, "").trim().toLowerCase();
}

function titleHasCustomReprintRisk(title: string): boolean {
  return /\bcustom\b|\breprint\b|\bproxy\b|\breplica\b|\bcopy\b|\bfake\b/i.test(title);
}

function parseGrade(grade: string | undefined): { company: string; value: number } | null {
  if (!grade) return null;
  const match = grade.toLowerCase().match(/\b(psa|bgs|sgc|cgc)\s*(\d+(\.\d+)?)\b/);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  return { company: match[1], value };
}

function extractTitleGrade(title: string): { company: string; value: number } | null {
  const match = title.toLowerCase().match(/\b(psa|bgs|sgc|cgc)\s*(\d+(\.\d+)?)\b/);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isFinite(value)) return null;
  return { company: match[1], value };
}

function isRawGradeQuery(grade: string | undefined): boolean {
  if (!grade) return false;
  return /\braw\b|\bungraded\b/i.test(grade);
}

function getParallelTokens(parallel: string | undefined): string[] {
  if (!parallel) return [];
  const cleaned = normalize(parallel).replace(/prism/g, "prizm");
  return cleaned.split(" ").filter(Boolean);
}

function titleMatchesParallel(title: string, parallel: string | undefined): boolean {
  const tokens = getParallelTokens(parallel);
  if (tokens.length === 0) return true;
  const titleLower = normalize(title).replace(/prism/g, "prizm");
  return tokens.every((token) => titleLower.includes(token));
}

function isLikelyRareQuery(query: CompQueryContext): boolean {
  if (query.serialNumber && query.serialNumber.trim()) return true;
  const parallel = normalize(query.parallelType);
  if (!parallel) return false;
  return /\b1\/1\b|\bgold\b|\bblack\b|\bfinite\b|\bsuperfractor\b|\bcolor blast\b|\bkaboom\b/.test(parallel);
}

function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const clamped = clamp(p, 0, 1);
  const idx = clamped * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] ?? sorted[sorted.length - 1] ?? 0;
  const hiVal = sorted[hi] ?? sorted[sorted.length - 1] ?? 0;
  if (lo === hi) return loVal;
  return loVal + (hiVal - loVal) * (idx - lo);
}

function weightedQuantile(values: number[], weights: number[], q: number): number | null {
  if (values.length === 0 || values.length !== weights.length) return null;
  const zipped = values
    .map((value, idx) => ({ value, weight: Math.max(0, weights[idx] ?? 0) }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (zipped.length === 0) return null;
  const totalWeight = zipped.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  const target = clamp(q, 0, 1) * totalWeight;
  let running = 0;
  for (const entry of zipped) {
    running += entry.weight;
    if (running >= target) return entry.value;
  }
  return zipped[zipped.length - 1]?.value ?? null;
}

function weightedMedian(values: number[], weights: number[]): number | null {
  return weightedQuantile(values, weights, 0.5);
}

function toPrice(item: ForSaleItem): number {
  const shipping = typeof item.shipping === "number" && Number.isFinite(item.shipping) && item.shipping > 0
    ? item.shipping
    : 0;
  return item.price + shipping;
}

function mapUniqueReasonText<T extends string>(codes: T[], dictionary: Record<T, string>): string[] {
  return Array.from(new Set(codes)).map((code) => dictionary[code]);
}

function summarizeReasonCodes<T extends string>(codes: T[], dictionary: Record<T, string>): string[] {
  const counts = new Map<T, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code, count]) => `${dictionary[code]} (${count})`);
}

function bandFromScore(score: number): "high" | "medium" | "low" | "very_low" {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  if (score >= 35) return "low";
  return "very_low";
}

function buildConfidenceExplanation(input: {
  band: "high" | "medium" | "low" | "very_low";
  exactCompCount: number;
  similarCompCount: number;
  supportCompCount: number;
  soldCount: number;
  spreadPct: number | null;
  passUsed?: "strict" | "broad" | "minimal";
}): string {
  const spread =
    typeof input.spreadPct === "number" && Number.isFinite(input.spreadPct)
      ? `${Math.round(input.spreadPct * 100)}%`
      : "unknown";

  if (input.band === "high") {
    return `High confidence: ${input.exactCompCount} exact comps and ${input.soldCount} sold observations with controlled spread (${spread}).`;
  }
  if (input.band === "medium") {
    return `Medium confidence: usable exact comps exist, but spread (${spread}) or market depth is moderate.`;
  }
  if (input.band === "low") {
    const fallbackNote = input.passUsed && input.passUsed !== "strict" ? " Fallback search was required." : "";
    return `Low confidence: limited exact comps and higher dispersion (${spread}).${fallbackNote}`;
  }
  return "Very low confidence: insufficient exact comps and heavy reliance on fallback or weak matches.";
}

function getValuationSource(method: CmvMethod | undefined, exactCompCount: number, usedCompCount: number):
  | "exact_sold"
  | "mixed_sold"
  | "active_directional"
  | "insufficient_exact_comps" {
  if (method === "sold_median" && exactCompCount >= 1) return "exact_sold";
  if (method === "sold_median" && usedCompCount >= 1) return "mixed_sold";
  if (usedCompCount >= 2) return "active_directional";
  return "insufficient_exact_comps";
}

function applyOutlierRejection(comps: EvaluatedComp[]): void {
  const included = comps.filter((comp) => comp.included);
  if (included.length < 3) return;

  const prices = included.map((comp) => toPrice(comp.item)).sort((a, b) => a - b);
  const median = quantile(prices, 0.5);
  if (median === null || median <= 0) return;

  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const iqr =
    q1 !== null && q3 !== null && Number.isFinite(q1) && Number.isFinite(q3)
      ? Math.max(0, q3 - q1)
      : null;

  for (const comp of included) {
    const price = toPrice(comp.item);
    let isOutlier = false;
    if (prices.length >= 6 && iqr !== null) {
      const low = q1! - 1.8 * iqr;
      const high = q3! + 1.8 * iqr;
      isOutlier = price < low || price > high;
    } else {
      isOutlier = price < median * 0.45 || price > median * 2.2;
    }
    if (!isOutlier) continue;
    comp.included = false;
    comp.category = "rejected";
    comp.excludeReasonCodes.push("suspicious_outlier");
    comp.excludeReasonsText = mapUniqueReasonText(comp.excludeReasonCodes, EXCLUDE_REASON_TEXT);
    comp.valuationWeight = 0;
    comp.qualityScore = Math.min(comp.qualityScore, 25);
  }
}

export function buildCompEvaluation(input: BuildEvaluationInput): CompEvaluationResult {
  const passUsed = input.passUsed ?? "strict";
  const query = input.query;
  const seenKeys = new Set<string>();

  const wantedGrade = parseGrade(query.grade);
  const rawGradeQuery = isRawGradeQuery(query.grade);
  const wantedCardNumber = normalizeCardNumber(query.cardNumber);

  const comps: EvaluatedComp[] = input.items.map((item) => {
    const includeReasonCodes: IncludeReasonCode[] = [];
    const excludeReasonCodes: ExcludeReasonCode[] = [];

    const title = item.title ?? "";
    const titleLower = title.toLowerCase();
    const candidate: EvaluatedComp = {
      item,
      included: true,
      category: "support",
      includeReasonCodes,
      excludeReasonCodes,
      includeReasonsText: [],
      excludeReasonsText: [],
      matchConfidence: 0.35,
      identityConfidence: 0.35,
      valuationWeight: 0,
      qualityScore: 0,
    };

    if (isLotOrBundle(title) || isJunkListing(title)) {
      excludeReasonCodes.push("likely_bundle_or_lot");
    }
    if (titleHasCustomReprintRisk(title)) {
      excludeReasonCodes.push("custom_or_reprint_risk");
    }

    const playerMatch = titleMatchesPlayer(title, query.player);
    if (!playerMatch) {
      excludeReasonCodes.push("low_identity_confidence");
    } else {
      includeReasonCodes.push("strong_title_match");
      candidate.matchConfidence += 0.24;
      candidate.identityConfidence += 0.24;
    }

    const setMatch = listingMatchesRequestedSet(title, query.set);
    if (!setMatch) {
      excludeReasonCodes.push("likely_non_exact_variant");
    } else {
      candidate.matchConfidence += query.set ? 0.18 : 0.1;
      candidate.identityConfidence += query.set ? 0.18 : 0.1;
    }

    const parallelMatch = titleMatchesParallel(title, query.parallelType);
    if (!parallelMatch) {
      excludeReasonCodes.push("wrong_parallel");
    } else if (query.parallelType) {
      candidate.matchConfidence += 0.16;
      candidate.identityConfidence += 0.16;
    }

    const titleGrade = extractTitleGrade(title);
    if (rawGradeQuery && titleGrade) {
      excludeReasonCodes.push("raw_graded_mismatch");
    } else if (wantedGrade) {
      if (!titleGrade) {
        includeReasonCodes.push("limited_market_support");
        candidate.matchConfidence += 0.04;
      } else if (wantedGrade.company !== titleGrade.company) {
        excludeReasonCodes.push("wrong_grade");
      } else if (wantedGrade.value === titleGrade.value) {
        includeReasonCodes.push("same_grade");
        candidate.matchConfidence += 0.2;
        candidate.identityConfidence += 0.12;
      } else if (Math.abs(wantedGrade.value - titleGrade.value) <= 1) {
        includeReasonCodes.push("acceptable_adjacent_grade");
        candidate.matchConfidence += 0.08;
      } else {
        excludeReasonCodes.push("wrong_grade");
      }
    } else if (query.grade) {
      includeReasonCodes.push("limited_market_support");
    }

    if (wantedCardNumber) {
      const found = extractCardNumbers(titleLower).map((value) => value.toLowerCase());
      if (found.length === 0) {
        excludeReasonCodes.push("insufficient_metadata");
      } else if (!found.includes(wantedCardNumber)) {
        excludeReasonCodes.push("likely_non_exact_variant");
      } else {
        candidate.matchConfidence += 0.14;
        candidate.identityConfidence += 0.14;
      }
    }

    const dedupeKey = `${normalize(title)}|${Math.round(toPrice(item) * 100)}`;
    if (seenKeys.has(dedupeKey)) {
      excludeReasonCodes.push("duplicate_or_relist");
    } else {
      seenKeys.add(dedupeKey);
    }

    candidate.matchConfidence = clamp(candidate.matchConfidence, 0, 1);
    candidate.identityConfidence = clamp(candidate.identityConfidence, 0, 1);

    const hasHardReject = excludeReasonCodes.length > 0;
    if (hasHardReject) {
      candidate.included = false;
      candidate.category = "rejected";
      candidate.valuationWeight = 0;
      candidate.qualityScore = Math.round(candidate.matchConfidence * 45);
    } else {
      const gradeExact =
        wantedGrade && titleGrade
          ? wantedGrade.company === titleGrade.company && wantedGrade.value === titleGrade.value
          : !wantedGrade;
      const exact =
        setMatch &&
        parallelMatch &&
        playerMatch &&
        (!wantedCardNumber || !candidate.excludeReasonCodes.includes("insufficient_metadata")) &&
        gradeExact &&
        candidate.identityConfidence >= 0.72;

      const similar = !exact && candidate.identityConfidence >= 0.58;
      candidate.category = exact ? "exact" : similar ? "similar" : "support";
      if (exact) {
        includeReasonCodes.push("exact_identity_match");
      } else if (similar) {
        includeReasonCodes.push("supporting_similar_comp");
      } else {
        includeReasonCodes.push("limited_market_support");
      }
      includeReasonCodes.push("fallback_active_support");
    }

    candidate.includeReasonsText = mapUniqueReasonText(includeReasonCodes, INCLUDE_REASON_TEXT);
    candidate.excludeReasonsText = mapUniqueReasonText(excludeReasonCodes, EXCLUDE_REASON_TEXT);
    return candidate;
  });

  applyOutlierRejection(comps);

  const passMultiplier = passUsed === "strict" ? 1 : passUsed === "broad" ? 0.72 : 0.55;
  for (const comp of comps) {
    if (!comp.included) continue;
    const baseWeight = comp.category === "exact" ? 1 : comp.category === "similar" ? 0.45 : 0.2;
    const gradeReason = comp.includeReasonCodes.includes("same_grade")
      ? 1
      : comp.includeReasonCodes.includes("acceptable_adjacent_grade")
      ? 0.75
      : 0.55;
    const weight = baseWeight * gradeReason * passMultiplier * clamp(comp.identityConfidence, 0.2, 1);
    comp.valuationWeight = Math.round(weight * 1000) / 1000;
    comp.qualityScore = Math.round(clamp(weight * 100, 5, 98));
  }

  const included = comps.filter((comp) => comp.included);
  const exactComps = included.filter((comp) => comp.category === "exact");
  const similarComps = included.filter((comp) => comp.category === "similar");
  const supportComps = included.filter((comp) => comp.category === "support");
  const rejectedComps = comps.filter((comp) => !comp.included || comp.category === "rejected");

  const valuationComps = included.filter((comp) => comp.valuationWeight > 0);
  const prices = valuationComps.map((comp) => toPrice(comp.item));
  const weights = valuationComps.map((comp) => comp.valuationWeight);
  const midpoint = weightedMedian(prices, weights);
  const rangeLow = weightedQuantile(prices, weights, 0.25);
  const rangeHigh = weightedQuantile(prices, weights, 0.75);

  const spreadPct =
    midpoint !== null && midpoint > 0 && rangeLow !== null && rangeHigh !== null
      ? Math.max(0, (rangeHigh - rangeLow) / midpoint)
      : null;

  const soldCount = input.soldCount ?? 0;
  const avgIdentity =
    included.length > 0
      ? included.reduce((sum, comp) => sum + comp.identityConfidence, 0) / included.length
      : 0;

  let confidenceScore = 18;
  confidenceScore += Math.min(33, exactComps.length * 11);
  confidenceScore += Math.min(12, similarComps.length * 4);
  confidenceScore += Math.min(18, soldCount * 1.8);
  confidenceScore += avgIdentity * 20;

  if (passUsed === "broad") confidenceScore -= 18;
  if (passUsed === "minimal") confidenceScore -= 28;
  if (input.marketMethod !== "sold_median") confidenceScore -= 10;
  if (included.length < 3) confidenceScore -= 14;
  if (exactComps.length === 0) confidenceScore -= 16;
  if (spreadPct !== null && spreadPct > 0.9) confidenceScore -= 22;
  else if (spreadPct !== null && spreadPct > 0.6) confidenceScore -= 12;

  confidenceScore = Math.round(clamp(confidenceScore, 0, 100));
  const confidenceBand = bandFromScore(confidenceScore);

  const disclaimerStates: DisclaimerState[] = [];
  if (passUsed !== "strict" && exactComps.length === 0) disclaimerStates.push("fallback_only_estimate");
  if (input.marketMethod !== "sold_median") disclaimerStates.push("active_listing_heavy_estimate");
  if (included.length < 3) disclaimerStates.push("low_sample_estimate");
  if (spreadPct !== null && spreadPct > 0.6) disclaimerStates.push("wide_spread_estimate");
  if (similarComps.length > 0 && exactComps.length === 0) disclaimerStates.push("grade_mismatch_support");
  if (isLikelyRareQuery(query) && included.length < 4) disclaimerStates.push("sparse_rare_card_estimate");
  if (avgIdentity < 0.62) disclaimerStates.push("identity_uncertainty");
  if (exactComps.length === 0) disclaimerStates.push("no_trustworthy_exact_comps");

  const dedupedStates = Array.from(new Set(disclaimerStates));
  const disclaimerMessages = dedupedStates.map((state) => DISCLAIMER_TEXT[state]);

  return {
    exactComps,
    similarComps,
    supportComps,
    rejectedComps,
    confidenceScore,
    confidenceBand,
    confidenceExplanation: buildConfidenceExplanation({
      band: confidenceBand,
      exactCompCount: exactComps.length,
      similarCompCount: similarComps.length,
      supportCompCount: supportComps.length,
      soldCount,
      spreadPct,
      passUsed,
    }),
    valuationSource: getValuationSource(input.marketMethod, exactComps.length, included.length),
    usedCompCount: included.length,
    exactCompCount: exactComps.length,
    similarCompCount: similarComps.length,
    supportCompCount: supportComps.length,
    rejectedCompCount: rejectedComps.length,
    spreadPct,
    rangeLow: rangeLow !== null ? Math.round(rangeLow * 100) / 100 : null,
    rangeHigh: rangeHigh !== null ? Math.round(rangeHigh * 100) / 100 : null,
    midpoint: midpoint !== null ? Math.round(midpoint * 100) / 100 : null,
    disclaimerStates: dedupedStates,
    disclaimerMessages,
    includeReasonSummary: summarizeReasonCodes(
      included.flatMap((comp) => comp.includeReasonCodes),
      INCLUDE_REASON_TEXT
    ),
    excludeReasonSummary: summarizeReasonCodes(
      rejectedComps.flatMap((comp) => comp.excludeReasonCodes),
      EXCLUDE_REASON_TEXT
    ),
  };
}

export function convertEvaluatedCompToApiComp(comp: EvaluatedComp) {
  return {
    title: comp.item.title,
    price: comp.item.price,
    date: new Date().toISOString().split("T")[0],
    link: comp.item.url,
    image: comp.item.image,
    source: "ebay" as const,
    included: comp.included,
    category: comp.category,
    include_reason_codes: comp.includeReasonCodes,
    exclude_reason_codes: comp.excludeReasonCodes,
    include_reasons_text: comp.includeReasonsText,
    exclude_reasons_text: comp.excludeReasonsText,
    match_confidence: Math.round(comp.matchConfidence * 100) / 100,
    identity_confidence: Math.round(comp.identityConfidence * 100) / 100,
    valuation_weight: comp.valuationWeight,
    quality_score: comp.qualityScore,
  };
}
