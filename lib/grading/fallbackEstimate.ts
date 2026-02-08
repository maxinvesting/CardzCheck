import type { GradeEstimate, GradeProbabilities } from "@/types";
import { distributionFromRange, type GradeOutcome } from "./gradeProbability";

export type GradeEstimateStatus = "ok" | "low_confidence" | "unable";
export type GradeEstimateWarningCode = "parse_error" | "low_confidence" | "unable";

export interface ImageStats {
  count: number;
  avgBytes: number;
  maxBytes: number;
  minBytes: number;
}

export function buildImageStats(sizes: number[]): ImageStats {
  if (!sizes.length) {
    return { count: 0, avgBytes: 0, maxBytes: 0, minBytes: 0 };
  }
  const total = sizes.reduce((sum, value) => sum + value, 0);
  return {
    count: sizes.length,
    avgBytes: total / sizes.length,
    maxBytes: Math.max(...sizes),
    minBytes: Math.min(...sizes),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMap<T extends Record<string, number>>(map: T): T {
  const total = Object.values(map).reduce((sum, value) => sum + value, 0);
  if (!total) return map;
  const normalized = Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, value / total])
  ) as T;
  return normalized;
}

function mapOutcomesToPsa(outcomes: GradeOutcome[]): GradeProbabilities["psa"] {
  const map = { "10": 0, "9": 0, "8": 0, "7_or_lower": 0 };
  outcomes.forEach((outcome) => {
    const label = outcome.label.toUpperCase();
    if (label.includes("10")) map["10"] += outcome.probability;
    else if (label.includes("9")) map["9"] += outcome.probability;
    else if (label.includes("8")) map["8"] += outcome.probability;
    else map["7_or_lower"] += outcome.probability;
  });
  return normalizeMap(map);
}

function mapPsaToBgs(psa: GradeProbabilities["psa"]): GradeProbabilities["bgs"] {
  return normalizeMap({
    "9.5": psa["10"],
    "9": psa["9"],
    "8.5": psa["8"],
    "8_or_lower": psa["7_or_lower"],
  });
}

function derivePhotoQuality(stats: ImageStats): number {
  if (stats.count === 0) return 0.35;

  const countScore = clamp((stats.count - 1) / 4, 0, 1);
  const sizeScore = clamp(stats.avgBytes / (1.2 * 1024 * 1024), 0, 1);
  return clamp(0.45 * countScore + 0.55 * sizeScore, 0, 1);
}

function deriveConfidence(quality: number): GradeProbabilities["confidence"] {
  if (quality >= 0.7) return "high";
  if (quality >= 0.45) return "medium";
  return "low";
}

function rangeForQuality(quality: number): { low: number; high: number } {
  if (quality >= 0.8) return { low: 8, high: 9 };
  if (quality >= 0.6) return { low: 7, high: 9 };
  if (quality >= 0.4) return { low: 6, high: 8 };
  return { low: 5, high: 7 };
}

function jitterFromStats(stats: ImageStats): number {
  const seed = Math.round(stats.avgBytes) + stats.count * 97 + Math.round(stats.maxBytes / 1024);
  const hash = Math.sin(seed) * 10000;
  const fraction = hash - Math.floor(hash);
  return (fraction - 0.5) * 0.08;
}

function applyJitter(psa: GradeProbabilities["psa"], jitter: number): GradeProbabilities["psa"] {
  if (jitter === 0) return psa;
  const adjusted = { ...psa };
  const delta = clamp(Math.abs(jitter), 0, 0.05);

  if (adjusted["9"] > 0 && adjusted["8"] > 0) {
    if (jitter > 0) {
      const shift = Math.min(delta, adjusted["8"]);
      adjusted["8"] -= shift;
      adjusted["9"] += shift;
    } else {
      const shift = Math.min(delta, adjusted["9"]);
      adjusted["9"] -= shift;
      adjusted["8"] += shift;
    }
  } else if (adjusted["8"] > 0 && adjusted["7_or_lower"] > 0) {
    if (jitter > 0) {
      const shift = Math.min(delta, adjusted["7_or_lower"]);
      adjusted["7_or_lower"] -= shift;
      adjusted["8"] += shift;
    } else {
      const shift = Math.min(delta, adjusted["8"]);
      adjusted["8"] -= shift;
      adjusted["7_or_lower"] += shift;
    }
  }

  return normalizeMap(adjusted);
}

export function buildFallbackGradeEstimate(options: {
  imageStats: ImageStats;
  status?: GradeEstimateStatus;
  reason?: string;
  warningCode?: GradeEstimateWarningCode;
}): GradeEstimate {
  const quality = derivePhotoQuality(options.imageStats);
  const confidence = deriveConfidence(quality);
  const range = rangeForQuality(quality);
  const rangeLabel = `PSA ${range.low}-${range.high}`;
  const outcomes = distributionFromRange(rangeLabel, confidence);
  const psa = applyJitter(mapOutcomesToPsa(outcomes), jitterFromStats(options.imageStats));
  const bgs = mapPsaToBgs(psa);

  return {
    estimated_grade_low: range.low,
    estimated_grade_high: range.high,
    centering: "Image quality limits a precise centering read; estimate is conservative.",
    corners: "Corner detail is partially obscured; estimate reflects potential wear.",
    surface: "Surface clarity is limited; estimate assumes potential defects.",
    edges: "Edges are difficult to confirm at this resolution; estimate is cautious.",
    grade_notes:
      "Conservative probability estimate due to limited clarity or uncertainty in the analysis.",
    grade_probabilities: {
      psa,
      bgs,
      confidence,
    },
    analysis_status: options.status ?? "unable",
    analysis_reason: options.reason,
    analysis_warning_code: options.warningCode ?? "unable",
  };
}
