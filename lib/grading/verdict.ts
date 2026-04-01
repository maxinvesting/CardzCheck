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
  suggested_grader: VerdictGrader;
  reasoning: string;
  disclaimer: string;
  expectedOutcome: string;
  strategyTip: string;
}

export const VERDICT_DISCLAIMER =
  "AI estimate only. Not a professional grade. Final grades are determined by official grading companies such as PSA, BGS, SGC, or TAG.";

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

// Detects GENUINE photo quality problems that make the scan unusable or unreliable.
// This should return true only for real quality failures (blur, glare, darkness, etc.),
// NOT for missing optional detail photos.
//
// Intentionally excludes:
//   "limited visibility" — injected by our own pipeline when close-ups are absent;
//                          it does NOT indicate a quality failure.
//   "lighting"           — too broad; matches legitimate mentions of good lighting.
//
// To add or remove quality failure signals, edit the `tokens` array below.
function hasPhotoQualityFlags(estimate: GradeEstimate): boolean {
  const noteText = [
    estimate.grade_notes,
    estimate.analysis_reason,
    ...(estimate.image_quality?.key_issues ?? []),
    // Note: visibility_notes and confidence.limiting_factors are excluded because our
    // own pipeline injects advisory text into them for missing close-ups, which would
    // cause false positives here.
  ]
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join(" ")
    .toLowerCase();

  const tokens = [
    "blur",
    "blurry",
    "out of focus",
    "heavy glare",
    "severe glare",
    "too dark",
    "resolution too low",
    "cannot assess",
    "unable to assess",
    "obscured",
    "not fully assess",
    "card is cropped",
    "card not visible",
  ];

  return (
    universalTokens.some((token) => allText.includes(token)) ||
    negativeFieldOnlyTokens.some((token) => negativeFieldsText.includes(token))
  );
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
      { label: "PSA 10", probability: 0.10 },
      { label: "PSA 9", probability: 0.38 },
      { label: "PSA 8", probability: 0.28 },
      { label: "PSA 7 or lower", probability: 0.24 },
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
  vintageOverride?: boolean | null;
  preferTag?: boolean;
  p10: number;
  bgs95: number;
  confidence: "high" | "medium" | "low";
  recommendation: VerdictRecommendation;
}): VerdictGrader {
  const isVintage =
    options.vintageOverride === true ||
    (options.vintageOverride !== false && options.year !== null && options.year <= 1989);
  if (isVintage) return "SGC";

  // Suggest BGS when PSA 10 probability is meaningful OR BGS 9.5 probability is non-trivial.
  // Old threshold (p10 >= 0.30) never triggered because PSA 10 was hard-capped at 18%.
  // Now that the cap is evidence-based, we lower the trigger and also key off BGS 9.5 directly.
  if ((options.p10 >= 0.20 || options.bgs95 >= 0.08) && options.confidence !== "low") return "BGS";

  const isModern = options.year !== null && options.year >= 2018;
  if (options.preferTag && isModern && options.recommendation !== "Rescan Needed") {
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
  closeupsMissing: boolean;
}): string {
  // Advisory suffix appended when close-ups are absent but quality is otherwise fine.
  const closeupAdvisory = options.closeupsMissing
    ? " Close-up photos of corners, edges, and surface would improve accuracy."
    : "";

  if (options.recommendation === "Rescan Needed") {
    return `Confidence is ${options.confidence} (${options.confidenceScore}/100) — photo quality limits reliable assessment of centering, corners, edges, or surface. Retake photos with better lighting, focus, and framing for a more accurate estimate. Current distribution leads with ${options.likelyLabel} at ${formatPercent(options.likelyProb)}.`;
  }

  if (options.recommendation === "Grade") {
    return `Centering, corners, edges, and surface evidence support grading, with PSA 9/10 probability at ${formatPercent(options.highGradeProb)} and expected grade EV ${options.ev.toFixed(1)}. The strongest projected outcome is ${options.likelyLabel} at ${formatPercent(options.likelyProb)}.${closeupAdvisory}`;
  }

  if (options.recommendation === "Sell Raw") {
    return `Distribution is weighted to lower outcomes (${formatPercent(options.lowGradeProb)} at PSA 7 or lower), limiting grading upside. Evidence on centering/corners/edges/surface suggests raw sale is likely the safer move right now.${closeupAdvisory}`;
  }

  return `The probability mix is balanced (PSA 9/10 at ${formatPercent(options.highGradeProb)} vs PSA 7 or lower at ${formatPercent(options.lowGradeProb)}), making this a borderline submit. Evidence quality supports a cautious strategy rather than an immediate full-commit grade submission.${closeupAdvisory}`;
}

function buildStrategyTip(
  recommendation: VerdictRecommendation,
  suggestedGrader: VerdictGrader,
  closeupsMissing: boolean
): string {
  if (recommendation === "Rescan Needed") {
    // Rescan is only triggered by genuinely bad photo quality (blur, glare, etc.),
    // not by missing close-ups. The tip should guide the user to retake the core photos.
    return "Retake photos with better lighting, focus, and framing";
  }

  if (recommendation === "Sell Raw") {
    return closeupsMissing
      ? "List raw · Add close-up photos for a more precise estimate"
      : "List raw on marketplace";
  }

  if (recommendation === "Borderline") {
    return closeupsMissing
      ? "Add close-up photos for corner/edge detail, then reassess"
      : "Wait for market timing";
  }

  // Grade recommendation
  if (closeupsMissing) {
    return `Add close-up photos for corner/edge detail before submitting to ${suggestedGrader}`;
  }
  if (suggestedGrader === "PSA") return "Submit to PSA Value";
  if (suggestedGrader === "BGS") return "Submit to BGS for high-end upside";
  if (suggestedGrader === "SGC") return "Submit to SGC for vintage turnaround";
  return "Submit to TAG for modern AI-focused grading";
}

export function buildGradeVerdict(
  estimate: GradeEstimate,
  cardIdentity?: VerdictCardIdentity,
  options?: {
    preferTag?: boolean;
    vintageOverride?: boolean | null;
  }
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
  const photoFlags = hasPhotoQualityFlags(estimate);

  // closeupsMissing: true when no close-up detail photos were provided.
  // This is ADVISORY only — it reduces confidence modestly and adds a tip,
  // but does NOT trigger "Rescan Needed". Close-ups are optional; front/back is sufficient
  // for a usable estimate.
  const closeupsMissing =
    estimate.analysis_metadata?.missing_closeups_flag === true ||
    estimate.analysis_metadata?.limited_visibility_flag === true;

  // Thresholds that control "Rescan Needed":
  //   confidence === "low"     → model or pipeline judged the evidence very weak
  //   confidenceScore < 50    → numerical confidence below usable threshold
  //   photoFlags               → genuine quality signals (blur, severe glare, etc.)
  //   analysis_status "unable" → model could not produce an estimate
  //
  // Notable EXCLUSION: closeupsMissing is NOT a Rescan trigger. Missing detail photos
  // reduce confidence and add an advisory tip, but front/back images are sufficient
  // for an estimate.
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
  const bgs95 = estimate.grade_probabilities?.bgs?.["9.5"] ?? 0;
  const suggestedGrader = getSuggestedGrader({
    year,
    vintageOverride: options?.vintageOverride ?? null,
    preferTag: options?.preferTag ?? false,
    p10,
    bgs95,
    confidence,
    recommendation,
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
    closeupsMissing,
  });

  return {
    recommendation,
    suggestedGrader,
    suggested_grader: suggestedGrader,
    reasoning,
    disclaimer: VERDICT_DISCLAIMER,
    expectedOutcome: `${likelyLabel} (${formatPercent(likelyProb)})`,
    strategyTip: buildStrategyTip(recommendation, suggestedGrader, closeupsMissing),
  };
}
