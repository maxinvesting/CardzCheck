import type { GradeEstimate, GradeProbabilities } from "@/types";
import {
  buildFallbackGradeEstimate,
  type GradeEstimateStatus,
  type GradeEstimateWarningCode,
  type ImageStats,
} from "@/lib/grading/fallbackEstimate";
import { parseJsonWithRepair } from "@/lib/grading/gradeEstimateParser";
import {
  distributionFromRange,
  normalizeDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";

type GradeEstimateEvidence = {
  centering: string;
  corners: string;
  surface: string;
  edges: string;
  grade_notes: string;
};

type GradeEstimateModelParseResult = {
  estimate: GradeEstimate;
  probabilities: GradeOutcome[] | null;
  evidence: GradeEstimateEvidence;
  preliminaryRange: string | null;
};

function normalizeStatus(value: unknown): GradeEstimateStatus {
  if (value === "ok" || value === "low_confidence" || value === "unable") {
    return value;
  }
  return "ok";
}

function toNumber(value: unknown, fallback: number): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeProbability(value: number, isPercent: boolean): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = isPercent ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}

function normalizeOutcomeArray(value: unknown): GradeOutcome[] | null {
  if (!Array.isArray(value)) return null;
  const raw = value
    .map((item) => ({
      label: typeof item?.label === "string" ? item.label : "",
      probability:
        typeof item?.probability === "number"
          ? item.probability
          : Number(item?.probability),
    }))
    .filter((item) => item.label.length > 0 && Number.isFinite(item.probability));

  if (!raw.length) return null;
  const usesPercent = raw.some((item) => item.probability > 1);
  const normalized = raw.map((item) => ({
    label: item.label,
    probability: normalizeProbability(item.probability, usesPercent),
  }));
  return normalizeDistribution(normalized);
}

function normalizeProbabilityMap<T extends Record<string, number>>(map: T): T {
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
  return normalizeProbabilityMap(map);
}

function mapOutcomesToBgs(outcomes: GradeOutcome[]): GradeProbabilities["bgs"] {
  const map = { "9.5": 0, "9": 0, "8.5": 0, "8_or_lower": 0 };
  outcomes.forEach((outcome) => {
    const label = outcome.label.toUpperCase();
    if (label.includes("9.5")) map["9.5"] += outcome.probability;
    else if (label.includes("9")) map["9"] += outcome.probability;
    else if (label.includes("8.5")) map["8.5"] += outcome.probability;
    else map["8_or_lower"] += outcome.probability;
  });
  return normalizeProbabilityMap(map);
}

function mapPsaToBgs(psa: GradeProbabilities["psa"]): GradeProbabilities["bgs"] {
  return normalizeProbabilityMap({
    "9.5": psa["10"],
    "9": psa["9"],
    "8.5": psa["8"],
    "8_or_lower": psa["7_or_lower"],
  });
}

function buildRangeLabel(low: number, high: number): string | null {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low === high) return `PSA ${Number.isInteger(low) ? low : low.toFixed(1)}`;
  const lowLabel = Number.isInteger(low) ? low : low.toFixed(1);
  const highLabel = Number.isInteger(high) ? high : high.toFixed(1);
  return `PSA ${lowLabel}-${highLabel}`;
}

function buildGradeEstimate(
  result: Record<string, unknown>,
  imageStats: ImageStats,
  parsedWarning: boolean
): GradeEstimate {
  const status = normalizeStatus(result.status);
  const reason = typeof result.reason === "string" ? result.reason : undefined;

  if (status === "unable") {
    return buildFallbackGradeEstimate({
      imageStats,
      status,
      reason,
      warningCode: "unable",
    });
  }

  const fallback = buildFallbackGradeEstimate({
    imageStats,
    status: "unable",
    reason: "Fallback estimate used due to incomplete data.",
    warningCode: "parse_error",
  });

  const estimatedLow = toNumber(result.estimated_grade_low, fallback.estimated_grade_low);
  const estimatedHigh = toNumber(result.estimated_grade_high, fallback.estimated_grade_high);
  const normalizedLow = Math.min(estimatedLow, estimatedHigh);
  const normalizedHigh = Math.max(estimatedLow, estimatedHigh);

  const estimate: GradeEstimate = {
    estimated_grade_low: normalizedLow,
    estimated_grade_high: normalizedHigh,
    centering: toString(result.centering, fallback.centering),
    corners: toString(result.corners, fallback.corners),
    surface: toString(result.surface, fallback.surface),
    edges: toString(result.edges, fallback.edges),
    grade_notes: toString(result.grade_notes, fallback.grade_notes),
    analysis_status: status,
    analysis_reason: reason,
    analysis_warning_code: (parsedWarning
      ? "parse_error"
      : status === "low_confidence"
      ? "low_confidence"
      : undefined) as GradeEstimateWarningCode | undefined,
  };

  const modelConfidence =
    result.confidence === "high" || result.confidence === "medium" || result.confidence === "low"
      ? result.confidence
      : undefined;

  const psaOutcomesRaw = normalizeOutcomeArray(result.probabilities);
  const psaOutcomes =
    psaOutcomesRaw && psaOutcomesRaw.some((outcome) => outcome.probability > 0)
      ? psaOutcomesRaw
      : null;
  const bgsOutcomesRaw = normalizeOutcomeArray(result.bgs_probabilities);
  const bgsOutcomes =
    bgsOutcomesRaw && bgsOutcomesRaw.some((outcome) => outcome.probability > 0)
      ? bgsOutcomesRaw
      : null;

  let gradeProbabilities: GradeProbabilities | undefined;

  if (psaOutcomes) {
    const psa = mapOutcomesToPsa(psaOutcomes);
    const bgs = bgsOutcomes ? mapOutcomesToBgs(bgsOutcomes) : mapPsaToBgs(psa);
    gradeProbabilities = {
      psa,
      bgs,
      confidence:
        status === "low_confidence"
          ? "low"
          : modelConfidence ?? fallback.grade_probabilities?.confidence,
    };
  } else {
    const rangeLabel = `PSA ${normalizedLow}-${normalizedHigh}`;
    const derived = distributionFromRange(
      rangeLabel,
      status === "low_confidence"
        ? "low"
        : modelConfidence ?? fallback.grade_probabilities?.confidence
    );
    const psa = mapOutcomesToPsa(derived);
    gradeProbabilities = {
      psa,
      bgs: mapPsaToBgs(psa),
      confidence:
        status === "low_confidence"
          ? "low"
          : modelConfidence ?? fallback.grade_probabilities?.confidence,
    };
  }

  estimate.grade_probabilities = gradeProbabilities ?? fallback.grade_probabilities;

  return estimate;
}

export function parseGradeEstimateModelOutput(options: {
  modelText: string | null;
  imageStats: ImageStats;
}): GradeEstimateModelParseResult {
  const fallback = buildFallbackGradeEstimate({
    imageStats: options.imageStats,
    status: "unable",
    reason: "Unable to parse AI response.",
    warningCode: "parse_error",
  });

  const noResponseFallback = buildFallbackGradeEstimate({
    imageStats: options.imageStats,
    status: "unable",
    reason: "No response from grade estimation service.",
    warningCode: "unable",
  });

  if (!options.modelText) {
    return {
      estimate: noResponseFallback,
      probabilities: null,
      evidence: {
        centering: noResponseFallback.centering,
        corners: noResponseFallback.corners,
        surface: noResponseFallback.surface,
        edges: noResponseFallback.edges,
        grade_notes: noResponseFallback.grade_notes,
      },
      preliminaryRange: buildRangeLabel(
        noResponseFallback.estimated_grade_low,
        noResponseFallback.estimated_grade_high
      ),
    };
  }

  const parsed = parseJsonWithRepair<Record<string, unknown>>(options.modelText);
  if (!parsed) {
    return {
      estimate: fallback,
      probabilities: null,
      evidence: {
        centering: fallback.centering,
        corners: fallback.corners,
        surface: fallback.surface,
        edges: fallback.edges,
        grade_notes: fallback.grade_notes,
      },
      preliminaryRange: buildRangeLabel(
        fallback.estimated_grade_low,
        fallback.estimated_grade_high
      ),
    };
  }

  const result = parsed.value ?? {};
  const estimate = buildGradeEstimate(result, options.imageStats, !!parsed.warning);
  const evidence = {
    centering: estimate.centering,
    corners: estimate.corners,
    surface: estimate.surface,
    edges: estimate.edges,
    grade_notes: estimate.grade_notes,
  };

  let probabilities: GradeOutcome[] | null = null;
  if (estimate.grade_probabilities?.psa) {
    probabilities = normalizeDistribution([
      { label: "PSA 10", probability: estimate.grade_probabilities.psa["10"] },
      { label: "PSA 9", probability: estimate.grade_probabilities.psa["9"] },
      { label: "PSA 8", probability: estimate.grade_probabilities.psa["8"] },
      {
        label: "PSA 7 or lower",
        probability: estimate.grade_probabilities.psa["7_or_lower"],
      },
    ]);
  }

  return {
    estimate,
    probabilities,
    evidence,
    preliminaryRange: buildRangeLabel(
      estimate.estimated_grade_low,
      estimate.estimated_grade_high
    ),
  };
}

export type { GradeEstimateEvidence, GradeEstimateModelParseResult };
