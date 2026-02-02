import type { GradeEstimate, GradeProbabilities } from "@/types";

type Distribution = Record<string, number>;

const PSA_DEFAULTS: Record<string, Distribution> = {
  "10": { "10": 0.55, "9": 0.4, "8": 0.05, "7_or_lower": 0 },
  "9": { "10": 0.12, "9": 0.65, "8": 0.2, "7_or_lower": 0.03 },
  "8": { "10": 0.03, "9": 0.22, "8": 0.6, "7_or_lower": 0.15 },
  "7_or_lower": { "10": 0.01, "9": 0.09, "8": 0.3, "7_or_lower": 0.6 },
};

const BGS_DEFAULTS: Record<string, Distribution> = {
  "9.5": { "9.5": 0.55, "9": 0.4, "8.5": 0.05, "8_or_lower": 0 },
  "9": { "9.5": 0.12, "9": 0.65, "8.5": 0.2, "8_or_lower": 0.03 },
  "8.5": { "9.5": 0.03, "9": 0.22, "8.5": 0.6, "8_or_lower": 0.15 },
  "8_or_lower": { "9.5": 0.01, "9": 0.09, "8.5": 0.3, "8_or_lower": 0.6 },
};

function normalizeDistribution<T extends Distribution>(dist: T): T {
  const total = Object.values(dist).reduce((sum, value) => sum + value, 0);
  if (!total) return dist;
  const normalized = Object.fromEntries(
    Object.entries(dist).map(([key, value]) => [key, value / total])
  ) as T;
  return normalized;
}

function getPredictedBucket(estimate: GradeEstimate): "10" | "9" | "8" | "7_or_lower" {
  const avg = (estimate.estimated_grade_low + estimate.estimated_grade_high) / 2;
  if (avg >= 9.5) return "10";
  if (avg >= 8.5) return "9";
  if (avg >= 7.5) return "8";
  return "7_or_lower";
}

function getConfidence(estimate: GradeEstimate): "high" | "medium" | "low" {
  const spread = Math.abs(estimate.estimated_grade_high - estimate.estimated_grade_low);
  const notes = estimate.grade_notes?.toLowerCase() ?? "";
  const mentionsQuality =
    notes.includes("photo") ||
    notes.includes("image") ||
    notes.includes("lighting") ||
    notes.includes("blurry");

  if (mentionsQuality) return "low";
  if (spread <= 1) return "high";
  if (spread <= 2) return "medium";
  return "low";
}

export function buildGradeProbabilities(estimate: GradeEstimate): GradeProbabilities {
  const bucket = getPredictedBucket(estimate);
  return {
    psa: normalizeDistribution(PSA_DEFAULTS[bucket]) as GradeProbabilities["psa"],
    bgs: normalizeDistribution(BGS_DEFAULTS[bucket]) as GradeProbabilities["bgs"],
    confidence: getConfidence(estimate),
  };
}

export function normalizeGradeProbabilities(
  probabilities: GradeProbabilities
): GradeProbabilities {
  return {
    psa: normalizeDistribution(probabilities.psa),
    bgs: normalizeDistribution(probabilities.bgs),
    confidence: probabilities.confidence,
  };
}
