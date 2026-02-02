import { scrapeEbaySoldListings } from "@/lib/ebay/scraper";
import { normalizeGrade } from "@/lib/ebay/utils";
import { normalizeText } from "@/lib/smartSearch/normalize";
import type { EbaySearchParams, CompItem } from "@/lib/ebay/types";
import type { GradeCmv, GradeProbabilities, WorthGradingResult } from "@/types";
import { cacheGradeCmv, getCachedGradeCmv } from "./cache";
import { DEFAULT_COMPS_WINDOW_DAYS, DEFAULT_GRADE_FEES } from "./constants";

type GradeKey = "raw" | "psa10" | "psa9" | "psa8" | "bgs95" | "bgs9" | "bgs85";

export interface GradeEstimatorCardInput {
  player_name: string;
  year?: string;
  set_name?: string;
  card_number?: string;
  parallel_type?: string;
  variation?: string;
  insert?: string;
}

const GRADED_REGEX = /\b(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?\b/i;

function isGradedTitle(title: string): boolean {
  return GRADED_REGEX.test(title) || /\bgraded\b/i.test(title);
}

function extractGrade(title: string): string | null {
  const match = title.match(/\b(PSA|BGS|SGC|CGC)\s*(\d+(\.\d+)?)\b/i);
  if (!match) return null;
  return normalizeGrade(`${match[1]} ${match[2]}`);
}

function filterByGrade(items: CompItem[], targetGrade: string | null): CompItem[] {
  if (!targetGrade) {
    return items.filter((item) => !isGradedTitle(item.title));
  }
  const normalized = normalizeGrade(targetGrade);
  return items.filter((item) => extractGrade(item.title) === normalized);
}

function filterRecentComps(items: CompItem[], windowDays: number): CompItem[] {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const ts = new Date(item.date).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function trimmedMean(values: number[], trimPct = 0.15): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (!trimmed.length) return null;
  const sum = trimmed.reduce((acc, value) => acc + value, 0);
  return sum / trimmed.length;
}

function buildGradeCmv(items: CompItem[]): GradeCmv {
  const prices = items.map((item) => item.price).filter((price) => Number.isFinite(price));
  const lastSoldAt = items
    .map((item) => item.date)
    .sort()
    .at(-1);

  if (prices.length >= 3) {
    const med = median(prices);
    if (med !== null) {
      return {
        price: Math.round(med * 100) / 100,
        n: prices.length,
        lastSoldAt,
        method: "median",
      };
    }
  }

  if (prices.length > 0) {
    const trimmed = trimmedMean(prices);
    if (trimmed !== null) {
      return {
        price: Math.round(trimmed * 100) / 100,
        n: prices.length,
        lastSoldAt,
        method: "trimmedMean",
      };
    }
  }

  return { price: null, n: prices.length, method: "none", lastSoldAt };
}

function buildFingerprint(card: GradeEstimatorCardInput): string {
  const parts = [
    card.year,
    card.set_name,
    card.player_name,
    card.variation,
    card.card_number,
    card.parallel_type,
    card.insert,
  ].filter(Boolean);
  return normalizeText(parts.join(" "));
}

function buildSearchParams(card: GradeEstimatorCardInput, grade?: string): EbaySearchParams {
  return {
    player: card.player_name,
    year: card.year,
    set: card.set_name,
    grade,
    cardNumber: card.card_number,
    parallelType: card.parallel_type,
    variation: card.variation,
    keywords: card.insert ? [card.insert] : undefined,
    limit: 30,
  };
}

export async function fetchGradeCmv(
  card: GradeEstimatorCardInput,
  gradeKey: GradeKey,
  windowDays = DEFAULT_COMPS_WINDOW_DAYS
): Promise<GradeCmv> {
  const grade =
    gradeKey === "raw"
      ? null
      : gradeKey === "psa10"
      ? "PSA 10"
      : gradeKey === "psa9"
      ? "PSA 9"
      : gradeKey === "psa8"
      ? "PSA 8"
      : gradeKey === "bgs95"
      ? "BGS 9.5"
      : gradeKey === "bgs9"
      ? "BGS 9"
      : "BGS 8.5";

  const fingerprint = buildFingerprint(card);
  const cacheKey = `${fingerprint}|${gradeKey}|${windowDays}d`;
  const cached = getCachedGradeCmv(cacheKey);
  if (cached) return cached;

  const params = buildSearchParams(card, grade ?? undefined);
  const response = await scrapeEbaySoldListings(params);
  const filtered = filterRecentComps(
    filterByGrade(response.items, grade),
    windowDays
  );
  const cmv = buildGradeCmv(filtered);
  cacheGradeCmv(cacheKey, cmv);
  return cmv;
}

function pickFallback(
  target: number,
  gradeMap: Record<number, number | null>,
  rawPrice: number
): { price: number; usedFallback: boolean } {
  const direct = gradeMap[target];
  if (typeof direct === "number") return { price: direct, usedFallback: false };

  const gradeValues = Object.keys(gradeMap)
    .map((val) => Number(val))
    .filter((val) => Number.isFinite(val))
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target));

  for (const value of gradeValues) {
    const candidate = gradeMap[value];
    if (typeof candidate === "number") {
      return { price: candidate, usedFallback: true };
    }
  }

  return { price: rawPrice, usedFallback: true };
}

function computeRating(netGain: number, roi: number): "strong_yes" | "yes" | "maybe" | "no" {
  if (netGain >= 60 && roi >= 0.25) return "strong_yes";
  if (netGain >= 30 && roi >= 0.15) return "yes";
  if (netGain >= 10 || roi >= 0.08) return "maybe";
  return "no";
}

function buildExplanation(
  option: "psa" | "bgs" | "none",
  rating: "strong_yes" | "yes" | "maybe" | "no",
  netGain: number,
  roi: number
): string {
  if (option === "none") {
    return "Insufficient comps to estimate post-grading value.";
  }
  if (rating === "no") {
    return "Not worth grading: expected net gain is low after fees.";
  }
  const label = option.toUpperCase();
  const gainText = netGain >= 0 ? `+$${netGain.toFixed(0)}` : `-$${Math.abs(netGain).toFixed(0)}`;
  return `${label} looks best: expected ${gainText} net gain (${(roi * 100).toFixed(0)}% ROI) after fees.`;
}

export function computeWorthGrading(
  raw: GradeCmv,
  psa: { "10": GradeCmv; "9": GradeCmv; "8": GradeCmv },
  bgs: { "9.5": GradeCmv; "9": GradeCmv; "8.5": GradeCmv },
  probabilities: GradeProbabilities,
  estimatorConfidence: "high" | "medium" | "low" = "medium",
  fees: { psa: number; bgs: number } = DEFAULT_GRADE_FEES
): WorthGradingResult {
  if (raw.price === null) {
    return {
      raw,
      psa: { ...psa, ev: 0, netGain: 0, roi: 0 },
      bgs: { ...bgs, ev: 0, netGain: 0, roi: 0 },
      bestOption: "none",
      rating: "no",
      confidence: "low",
      explanation: "Insufficient raw comps to estimate post-grading value.",
    };
  }

  const rawPrice = raw.price;
  const psaMap: Record<number, number | null> = {
    10: psa["10"].price,
    9: psa["9"].price,
    8: psa["8"].price,
  };
  const bgsMap: Record<number, number | null> = {
    9.5: bgs["9.5"].price,
    9: bgs["9"].price,
    8.5: bgs["8.5"].price,
  };

  const psa10 = pickFallback(10, psaMap, rawPrice);
  const psa9 = pickFallback(9, psaMap, rawPrice);
  const psa8 = pickFallback(8, psaMap, rawPrice);
  const bgs95 = pickFallback(9.5, bgsMap, rawPrice);
  const bgs9 = pickFallback(9, bgsMap, rawPrice);
  const bgs85 = pickFallback(8.5, bgsMap, rawPrice);

  const psaEv =
    probabilities.psa["10"] * psa10.price +
    probabilities.psa["9"] * psa9.price +
    probabilities.psa["8"] * psa8.price +
    probabilities.psa["7_or_lower"] * rawPrice;
  const bgsEv =
    probabilities.bgs["9.5"] * bgs95.price +
    probabilities.bgs["9"] * bgs9.price +
    probabilities.bgs["8.5"] * bgs85.price +
    probabilities.bgs["8_or_lower"] * rawPrice;

  const psaNet = psaEv - rawPrice - fees.psa;
  const bgsNet = bgsEv - rawPrice - fees.bgs;

  const psaRoi = rawPrice + fees.psa > 0 ? psaNet / (rawPrice + fees.psa) : 0;
  const bgsRoi = rawPrice + fees.bgs > 0 ? bgsNet / (rawPrice + fees.bgs) : 0;

  const bestOption = psaNet >= bgsNet ? "psa" : "bgs";
  const bestNet = bestOption === "psa" ? psaNet : bgsNet;
  const bestRoi = bestOption === "psa" ? psaRoi : bgsRoi;

  let confidence: "high" | "medium" | "low" = estimatorConfidence;
  const bestCompsN =
    bestOption === "psa"
      ? Math.max(psa["10"].n, psa["9"].n, psa["8"].n)
      : Math.max(bgs["9.5"].n, bgs["9"].n, bgs["8.5"].n);

  if (raw.n < 5 || bestCompsN < 3) {
    confidence = "low";
  }

  const usedFallback =
    psa10.usedFallback || psa9.usedFallback || psa8.usedFallback || bgs95.usedFallback || bgs9.usedFallback || bgs85.usedFallback;
  if (usedFallback && confidence === "high") {
    confidence = "medium";
  }

  let rating = computeRating(bestNet, bestRoi);
  if (confidence === "low" && rating !== "no") {
    rating = "maybe";
  }

  return {
    raw,
    psa: {
      ...psa,
      ev: Math.round(psaEv * 100) / 100,
      netGain: Math.round(psaNet * 100) / 100,
      roi: Math.round(psaRoi * 1000) / 1000,
    },
    bgs: {
      ...bgs,
      ev: Math.round(bgsEv * 100) / 100,
      netGain: Math.round(bgsNet * 100) / 100,
      roi: Math.round(bgsRoi * 1000) / 1000,
    },
    bestOption,
    rating,
    confidence,
    explanation: buildExplanation(bestOption, rating, bestNet, bestRoi),
  };
}

export function normalizeProbabilities(
  probabilities: GradeProbabilities
): GradeProbabilities {
  const sumPsa =
    probabilities.psa["10"] +
    probabilities.psa["9"] +
    probabilities.psa["8"] +
    probabilities.psa["7_or_lower"];
  const sumBgs =
    probabilities.bgs["9.5"] +
    probabilities.bgs["9"] +
    probabilities.bgs["8.5"] +
    probabilities.bgs["8_or_lower"];
  const psaTotal = sumPsa || 1;
  const bgsTotal = sumBgs || 1;

  return {
    psa: {
      "10": probabilities.psa["10"] / psaTotal,
      "9": probabilities.psa["9"] / psaTotal,
      "8": probabilities.psa["8"] / psaTotal,
      "7_or_lower": probabilities.psa["7_or_lower"] / psaTotal,
    },
    bgs: {
      "9.5": probabilities.bgs["9.5"] / bgsTotal,
      "9": probabilities.bgs["9"] / bgsTotal,
      "8.5": probabilities.bgs["8.5"] / bgsTotal,
      "8_or_lower": probabilities.bgs["8_or_lower"] / bgsTotal,
    },
    confidence: probabilities.confidence,
  };
}

export function isRawListing(title: string): boolean {
  return !isGradedTitle(title);
}
