import type { GradeEstimate } from "@/types";
import {
  distributionFromRange,
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";

export type VerdictRecommendation =
  | "Grade"
  | "Borderline"
  | "Sell Raw"
  | "Rescan Needed";

export type VerdictGrader = "PSA" | "BGS" | "SGC" | "TAG";

export interface GradeVerdict {
  recommendation: VerdictRecommendation;
  suggestedGrader: VerdictGrader;
  reasoning: string;
  expectedOutcome: string;
  strategyTip: string;
}

export const VERDICT_DISCLAIMER =
  "AI Estimate Disclaimer:\nCardzCheck provides AI-generated grading estimates based on submitted images.\nThis is not a professional grade. Final grades are determined by official grading companies such as PSA, BGS, SGC, or TAG.";

type VerdictCardIdentity = {
  year?: string;
} | null | undefined;

function parseYear(cardIdentity?: VerdictCardIdentity): number | null {
  if (!cardIdentity?.year) return null;
  const numeric = Number(cardIdentity.year);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildRangeLabel(estimate: GradeEstimate): string | null {
  const low = estimate.estimated_grade_low;
  const high = estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low === high) return `PSA ${formatGradeNumber(low)}`;
  return `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function hasPhotoQualityFlags(estimate: GradeEstimate): boolean {
  const noteText = [
    estimate.grade_notes,
    estimate.analysis_reason,
    ...(estimate.visibility_notes ?? []),
    ...(estimate.image_quality?.key_issues ?? []),
    ...(estimate.confidence?.limiting_factors ?? []),
  ]
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join(" ")
    .toLowerCase();

  const tokens = [
    "blur",
    "blurry",
    "glare",
    "lighting",
    "out of focus",
    "resolution",
    "limited visibility",
    "unclear",
    "obscured",
    "not fully assess",
  ];
  return tokens.some((token) => noteText.includes(token));
}

function getPsaOutcomes(estimate: GradeEstimate): GradeOutcome[] {
  if (estimate.grade_probabilities?.psa) {
    return normalizePsaDistribution(
      [
        { label: "PSA 10", probability: estimate.grade_probabilities.psa["10"] },
        { label: "PSA 9", probability: estimate.grade_probabilities.psa["9"] },
        { label: "PSA 8", probability: estimate.grade_probabilities.psa["8"] },
        {
          label: "PSA 7 or lower",
          probability: estimate.grade_probabilities.psa["7_or_lower"],
        },
      ],
      { allowPsa10Override: true }
    );
  }

  const rangeLabel = buildRangeLabel(estimate);
  if (!rangeLabel) {
    return normalizePsaDistribution([
      { label: "PSA 10", probability: 0.08 },
      { label: "PSA 9", probability: 0.32 },
      { label: "PSA 8", probability: 0.34 },
      { label: "PSA 7 or lower", probability: 0.26 },
    ]);
  }
  return normalizePsaDistribution(
    distributionFromRange(rangeLabel, estimate.grade_probabilities?.confidence),
    { allowPsa10Override: true }
  );
}

function getOutcomeProbability(outcomes: GradeOutcome[], label: string): number {
  return outcomes.find((outcome) => outcome.label === label)?.probability ?? 0;
}

function getMostLikely(outcomes: GradeOutcome[]): GradeOutcome | null {
  if (outcomes.length === 0) return null;
  return outcomes.reduce((max, outcome) =>
    outcome.probability > max.probability ? outcome : max
  );
}

function getSuggestedGrader(options: {
  year: number | null;
  p10: number;
  confidence: "high" | "medium" | "low";
  recommendation: VerdictRecommendation;
  imageScore: number;
}): VerdictGrader {
  const isVintage = options.year !== null && options.year <= 1989;
  if (isVintage) return "SGC";

  if (options.p10 >= 0.3 && options.confidence !== "low") return "BGS";

  const isModern = options.year !== null && options.year >= 2018;
  if (
    isModern &&
    options.imageScore >= 78 &&
    options.recommendation !== "Rescan Needed"
  ) {
    return "TAG";
  }

  return "PSA";
}

function buildReasoning(options: {
  recommendation: VerdictRecommendation;
  highGradeProb: number;
  lowGradeProb: number;
  ev: number;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  likelyLabel: string;
  likelyProb: number;
}): string {
  if (options.recommendation === "Rescan Needed") {
    return `Confidence is ${options.confidence} (${options.confidenceScore}/100) with photo-quality limits on centering, corners, edges, or surface, so the scan should be retaken first. Current distribution leads with ${options.likelyLabel} at ${formatPercent(options.likelyProb)} and may shift with better close-ups.`;
  }

  if (options.recommendation === "Grade") {
    return `Centering, corners, edges, and surface evidence support grading, with PSA 9/10 probability at ${formatPercent(options.highGradeProb)} and expected grade EV ${options.ev.toFixed(1)}. The strongest projected outcome is ${options.likelyLabel} at ${formatPercent(options.likelyProb)}.`;
  }

  if (options.recommendation === "Sell Raw") {
    return `Distribution is weighted to lower outcomes (${formatPercent(options.lowGradeProb)} at PSA 7 or lower), limiting grading upside. Evidence on centering/corners/edges/surface suggests raw sale is likely the safer move right now.`;
  }

  return `The probability mix is balanced (PSA 9/10 at ${formatPercent(options.highGradeProb)} vs PSA 7 or lower at ${formatPercent(options.lowGradeProb)}), making this a borderline submit. Evidence quality supports a cautious strategy rather than an immediate full-commit grade submission.`;
}

function buildStrategyTip(
  recommendation: VerdictRecommendation,
  suggestedGrader: VerdictGrader
): string {
  if (recommendation === "Rescan Needed") return "Upload additional close-up photos";
  if (recommendation === "Sell Raw") return "List raw on marketplace";
  if (recommendation === "Borderline") return "Wait for market timing";

  if (suggestedGrader === "PSA") return "Submit to PSA Value";
  if (suggestedGrader === "BGS") return "Submit to BGS for high-end upside";
  if (suggestedGrader === "SGC") return "Submit to SGC for vintage turnaround";
  return "Submit to TAG for modern AI-focused grading";
}

export function buildGradeVerdict(
  estimate: GradeEstimate,
  cardIdentity?: VerdictCardIdentity
): GradeVerdict {
  const outcomes = getPsaOutcomes(estimate);
  const p10 = getOutcomeProbability(outcomes, "PSA 10");
  const p9 = getOutcomeProbability(outcomes, "PSA 9");
  const p7OrLower = getOutcomeProbability(outcomes, "PSA 7 or lower");
  const highGradeProb = p10 + p9;
  const lowGradeProb = p7OrLower;
  const likely = getMostLikely(outcomes);
  const likelyLabel = likely?.label ?? "PSA 8";
  const likelyProb = likely?.probability ?? 0;
  const confidence =
    estimate.grade_probabilities?.confidence ??
    estimate.confidence?.confidence_label ??
    "medium";
  const confidenceScore =
    estimate.confidence?.overall_confidence_score ??
    (confidence === "high" ? 82 : confidence === "low" ? 38 : 60);
  const imageScore = estimate.image_quality?.overall_image_score ?? 60;
  const photoFlags = hasPhotoQualityFlags(estimate);

  let recommendation: VerdictRecommendation;
  if (
    confidence === "low" ||
    confidenceScore < 50 ||
    photoFlags ||
    estimate.analysis_status === "unable"
  ) {
    recommendation = "Rescan Needed";
  } else if (lowGradeProb >= 0.45 || (lowGradeProb + getOutcomeProbability(outcomes, "PSA 8")) >= 0.75) {
    recommendation = "Sell Raw";
  } else if (highGradeProb >= 0.62) {
    recommendation = "Grade";
  } else {
    recommendation = "Borderline";
  }

  const year = parseYear(cardIdentity);
  const suggestedGrader = getSuggestedGrader({
    year,
    p10,
    confidence,
    recommendation,
    imageScore,
  });

  const ev =
    outcomes.reduce((sum, outcome) => {
      const map: Record<string, number> = {
        "PSA 10": 10,
        "PSA 9": 9,
        "PSA 8": 8,
        "PSA 7 or lower": 7,
      };
      return sum + (map[outcome.label] ?? 0) * outcome.probability;
    }, 0) || 0;

  const reasoning = buildReasoning({
    recommendation,
    highGradeProb,
    lowGradeProb,
    ev,
    confidence,
    confidenceScore,
    likelyLabel,
    likelyProb,
  });

  return {
    recommendation,
    suggestedGrader,
    reasoning,
    expectedOutcome: `${likelyLabel} (${formatPercent(likelyProb)})`,
    strategyTip: buildStrategyTip(recommendation, suggestedGrader),
  };
}
