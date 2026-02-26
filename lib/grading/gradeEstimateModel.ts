import type {
  GradeEstimate,
  GradeProbabilities,
  GradeFinding,
  GradeEstimateConfidence,
  GradeEstimateCenteringDetail,
  GradeImageQuality,
} from "@/types";
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

const SURFACE_ISSUE_TYPES = new Set([
  "scratch",
  "scuff",
  "print_line",
  "dent",
  "dimple",
  "stain",
  "smudge",
  "foil_roll",
  "other",
]);
const CORNER_ISSUE_TYPES = new Set([
  "corner_wear",
  "dent",
  "whitening",
  "other",
]);
const EDGE_ISSUE_TYPES = new Set([
  "edge_wear",
  "chipping",
  "rough_cut",
  "whitening",
  "other",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function toInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = toNumber(value);
  if (parsed === null) return fallback;
  return clamp(Math.round(parsed), min, max);
}

function toText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : fallback;
}

function normalizeStatus(value: unknown): GradeEstimateStatus {
  if (value === "ok" || value === "low_confidence" || value === "unable") {
    return value;
  }
  return "low_confidence";
}

function normalizeConfidenceLabel(
  value: unknown,
  score: number
): GradeEstimateConfidence["confidence_label"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function parseRatioPart(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return parsed;
}

function ratioDeviation(ratio: string): number | null {
  const match = ratio.match(/^\s*(\d{1,2}(?:\.\d+)?)\s*\/\s*(\d{1,2}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const left = parseRatioPart(match[1]);
  const right = parseRatioPart(match[2]);
  if (left === null || right === null) return null;
  const total = left + right;
  if (total <= 0) return null;
  const normalizedLeft = (left / total) * 100;
  const normalizedRight = (right / total) * 100;
  return Math.max(normalizedLeft, normalizedRight);
}

function parseFinding(
  raw: unknown,
  allowedIssueTypes: Set<string>,
  fallbackIssue: GradeFinding["issue_type"]
): GradeFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const issueRaw = toText(row.issue_type, fallbackIssue);
  const issue =
    allowedIssueTypes.has(issueRaw) || issueRaw === "other"
      ? issueRaw
      : fallbackIssue;
  return {
    issue_type: issue as GradeFinding["issue_type"],
    location: toText(row.location, "unspecified area"),
    severity_0_3: toInt(row.severity_0_3, 1, 0, 3),
    confidence_0_100: toInt(row.confidence_0_100, 55, 0, 100),
    notes: toText(row.notes, "No additional notes provided."),
  };
}

function parseFindings(
  value: unknown,
  allowedIssueTypes: Set<string>,
  fallbackIssue: GradeFinding["issue_type"]
): GradeFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseFinding(entry, allowedIssueTypes, fallbackIssue))
    .filter((entry): entry is GradeFinding => entry !== null);
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

function mapPsaToOutcomes(psa: GradeProbabilities["psa"]): GradeOutcome[] {
  return normalizeDistribution([
    { label: "PSA 10", probability: psa["10"] },
    { label: "PSA 9", probability: psa["9"] },
    { label: "PSA 8", probability: psa["8"] },
    { label: "PSA 7 or lower", probability: psa["7_or_lower"] },
  ]);
}

function buildRangeLabel(low: number, high: number): string | null {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low === high) return `PSA ${Number.isInteger(low) ? low : low.toFixed(1)}`;
  const lowLabel = Number.isInteger(low) ? low : low.toFixed(1);
  const highLabel = Number.isInteger(high) ? high : high.toFixed(1);
  return `PSA ${lowLabel}-${highLabel}`;
}

function maybeWarnProbabilitySum(label: string, total: number): void {
  const drift = Math.abs(1 - total);
  if (drift > 0.15) {
    console.warn(`[grade-estimate] ${label} probability sum off by ${drift.toFixed(3)}`);
  }
}

function applyCenteringGate(
  psa: GradeProbabilities["psa"],
  centering: GradeEstimateCenteringDetail,
  status: GradeEstimateStatus
): GradeProbabilities["psa"] {
  const gated = { ...psa };
  const worstAxis = Math.max(
    ratioDeviation(centering.left_right_ratio) ?? 50,
    ratioDeviation(centering.top_bottom_ratio) ?? 50
  );
  const severity = centering.centering_severity_0_3;

  let maxPsa10 = 0.18;
  if (status !== "ok") maxPsa10 = 0.08;
  if (severity >= 2 || worstAxis > 60) maxPsa10 = Math.min(maxPsa10, 0.02);
  if (worstAxis >= 65 || severity >= 3) maxPsa10 = 0.01;

  if (gated["10"] > maxPsa10) {
    const excess = gated["10"] - maxPsa10;
    gated["10"] = maxPsa10;
    gated["8"] += excess * 0.4;
    gated["7_or_lower"] += excess * 0.6;
  }

  if (worstAxis >= 65 || severity >= 3) {
    const maxPsa9 = 0.25;
    if (gated["9"] > maxPsa9) {
      const excess = gated["9"] - maxPsa9;
      gated["9"] = maxPsa9;
      gated["8"] += excess * 0.45;
      gated["7_or_lower"] += excess * 0.55;
    }
  }

  return normalizeProbabilityMap(gated);
}

function applyConfidencePenalty(
  psa: GradeProbabilities["psa"],
  confidence: GradeEstimateConfidence["confidence_label"]
): GradeProbabilities["psa"] {
  if (confidence === "high") return psa;
  const adjusted = { ...psa };
  const shift = confidence === "medium" ? 0.08 : 0.16;
  const from10 = Math.min(adjusted["10"], shift * 0.6);
  const from9 = Math.min(adjusted["9"], shift * 0.4);
  adjusted["10"] -= from10;
  adjusted["9"] -= from9;
  adjusted["8"] += (from10 + from9) * 0.45;
  adjusted["7_or_lower"] += (from10 + from9) * 0.55;
  return normalizeProbabilityMap(adjusted);
}

function buildEstimateFromParsed(
  result: Record<string, unknown>,
  imageStats: ImageStats,
  parsedWarning: boolean
): GradeEstimate {
  const fallback = buildFallbackGradeEstimate({
    imageStats,
    status: "unable",
    reason: "Fallback estimate used due to incomplete data.",
    warningCode: "parse_error",
  });

  const status = normalizeStatus(result.status);
  const reason = toText(result.reason, fallback.analysis_reason ?? "Limited confidence.");

  const estimatedLow = toNumber(result.estimated_grade_low) ?? fallback.estimated_grade_low;
  const estimatedHigh = toNumber(result.estimated_grade_high) ?? fallback.estimated_grade_high;
  const normalizedLow = Math.min(estimatedLow, estimatedHigh);
  const normalizedHigh = Math.max(estimatedLow, estimatedHigh);

  const rawImageQuality =
    result.image_quality && typeof result.image_quality === "object"
      ? (result.image_quality as Record<string, unknown>)
      : {};
  const imageQuality: GradeImageQuality = {
    overall_image_score: toInt(
      rawImageQuality.overall_image_score,
      fallback.image_quality?.overall_image_score ?? 48,
      0,
      100
    ),
    subscores: {
      focus_sharpness: toInt(
        (rawImageQuality.subscores as Record<string, unknown> | undefined)?.focus_sharpness,
        fallback.image_quality?.subscores.focus_sharpness ?? 12,
        0,
        25
      ),
      lighting_glare_control: toInt(
        (rawImageQuality.subscores as Record<string, unknown> | undefined)
          ?.lighting_glare_control,
        fallback.image_quality?.subscores.lighting_glare_control ?? 12,
        0,
        25
      ),
      coverage_angles: toInt(
        (rawImageQuality.subscores as Record<string, unknown> | undefined)?.coverage_angles,
        fallback.image_quality?.subscores.coverage_angles ?? 12,
        0,
        25
      ),
      resolution_distance: toInt(
        (rawImageQuality.subscores as Record<string, unknown> | undefined)
          ?.resolution_distance,
        fallback.image_quality?.subscores.resolution_distance ?? 12,
        0,
        25
      ),
    },
    key_issues: toStringArray(rawImageQuality.key_issues, fallback.image_quality?.key_issues ?? []),
    retake_tips: toStringArray(rawImageQuality.retake_tips, [
      ...(fallback.image_quality?.retake_tips ?? []),
      "Better photos = more accurate grading.",
    ]),
  };
  if (
    !imageQuality.retake_tips.some((tip) =>
      tip.toLowerCase().includes("better photos = more accurate grading")
    )
  ) {
    imageQuality.retake_tips.push("Better photos = more accurate grading.");
  }

  const rawConfidence =
    result.confidence && typeof result.confidence === "object"
      ? (result.confidence as Record<string, unknown>)
      : {};
  const confidenceScore = toInt(
    rawConfidence.overall_confidence_score,
    fallback.confidence?.overall_confidence_score ?? 52,
    0,
    100
  );
  const confidence: GradeEstimateConfidence = {
    overall_confidence_score: confidenceScore,
    confidence_label: normalizeConfidenceLabel(rawConfidence.confidence_label, confidenceScore),
    limiting_factors: toStringArray(
      rawConfidence.limiting_factors,
      fallback.confidence?.limiting_factors ?? []
    ),
    what_was_clear: toStringArray(rawConfidence.what_was_clear, fallback.confidence?.what_was_clear ?? []),
  };

  const rawCentering =
    result.centering && typeof result.centering === "object"
      ? (result.centering as Record<string, unknown>)
      : {};
  const centeringDetail: GradeEstimateCenteringDetail = {
    left_right_ratio: toText(
      rawCentering.left_right_ratio,
      fallback.centering_detail?.left_right_ratio ?? "58/42"
    ),
    top_bottom_ratio: toText(
      rawCentering.top_bottom_ratio,
      fallback.centering_detail?.top_bottom_ratio ?? "58/42"
    ),
    centering_confidence_score: toInt(
      rawCentering.centering_confidence_score,
      fallback.centering_detail?.centering_confidence_score ?? 50,
      0,
      100
    ),
    centering_severity_0_3: toInt(
      rawCentering.centering_severity_0_3,
      fallback.centering_detail?.centering_severity_0_3 ?? 1,
      0,
      3
    ),
    centering_notes: toText(
      rawCentering.centering_notes,
      fallback.centering_detail?.centering_notes ??
        "Centering assessment is estimated from available photos."
    ),
  };

  const surfaceFindings = parseFindings(
    result.surface_findings,
    SURFACE_ISSUE_TYPES,
    "other"
  );
  const cornersFindings = parseFindings(
    result.corners_findings,
    CORNER_ISSUE_TYPES,
    "corner_wear"
  );
  const edgesFindings = parseFindings(
    result.edges_findings,
    EDGE_ISSUE_TYPES,
    "edge_wear"
  );

  let parseWasIncomplete = parsedWarning;
  if (
    Object.keys(rawImageQuality).length === 0 ||
    Object.keys(rawConfidence).length === 0 ||
    Object.keys(rawCentering).length === 0
  ) {
    parseWasIncomplete = true;
  }

  const analysisStatus: GradeEstimateStatus =
    status === "unable"
      ? "unable"
      : parseWasIncomplete || confidence.confidence_label === "low"
      ? "low_confidence"
      : status;

  const estimate: GradeEstimate = {
    estimated_grade_low: normalizedLow,
    estimated_grade_high: normalizedHigh,
    centering: `${centeringDetail.left_right_ratio} L/R, ${centeringDetail.top_bottom_ratio} T/B. ${centeringDetail.centering_notes}`,
    corners: toText(result.corners, fallback.corners),
    surface: toText(result.surface, fallback.surface),
    edges: toText(result.edges, fallback.edges),
    grade_notes: toText(result.grade_notes, fallback.grade_notes),
    image_quality: imageQuality,
    confidence,
    centering_detail: centeringDetail,
    surface_findings:
      surfaceFindings.length > 0
        ? surfaceFindings
        : fallback.surface_findings ?? [],
    corners_findings:
      cornersFindings.length > 0
        ? cornersFindings
        : fallback.corners_findings ?? [],
    edges_findings:
      edgesFindings.length > 0
        ? edgesFindings
        : fallback.edges_findings ?? [],
    analysis_status: analysisStatus,
    analysis_reason: reason,
    analysis_warning_code: (analysisStatus === "unable"
      ? "unable"
      : parseWasIncomplete
      ? "parse_error"
      : analysisStatus === "low_confidence"
      ? "low_confidence"
      : undefined) as GradeEstimateWarningCode | undefined,
  };

  const psaOutcomesRaw = normalizeOutcomeArray(result.probabilities);
  const bgsOutcomesRaw = normalizeOutcomeArray(result.bgs_probabilities);
  const rangeLabel =
    buildRangeLabel(estimate.estimated_grade_low, estimate.estimated_grade_high) ?? "PSA 6-8";

  let psa = psaOutcomesRaw
    ? mapOutcomesToPsa(psaOutcomesRaw)
    : mapOutcomesToPsa(
        distributionFromRange(rangeLabel, confidence.confidence_label)
      );
  psa = applyCenteringGate(psa, centeringDetail, analysisStatus);
  psa = applyConfidencePenalty(psa, confidence.confidence_label);
  maybeWarnProbabilitySum(
    "PSA",
    Object.values(psa).reduce((sum, value) => sum + value, 0)
  );

  let bgs = bgsOutcomesRaw ? mapOutcomesToBgs(bgsOutcomesRaw) : mapPsaToBgs(psa);
  maybeWarnProbabilitySum(
    "BGS",
    Object.values(bgs).reduce((sum, value) => sum + value, 0)
  );
  bgs = normalizeProbabilityMap(bgs);

  estimate.grade_probabilities = {
    psa,
    bgs,
    confidence: confidence.confidence_label,
  };

  return estimate;
}

export function parseGradeEstimateModelOutput(options: {
  modelText: string | null;
  imageStats: ImageStats;
}): GradeEstimateModelParseResult {
  const noResponseFallback = buildFallbackGradeEstimate({
    imageStats: options.imageStats,
    status: "unable",
    reason: "No response from grade estimation service.",
    warningCode: "unable",
  });

  if (!options.modelText) {
    return {
      estimate: noResponseFallback,
      probabilities: mapPsaToOutcomes(noResponseFallback.grade_probabilities!.psa),
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
    const fallback = buildFallbackGradeEstimate({
      imageStats: options.imageStats,
      status: "low_confidence",
      reason: "Unable to parse AI response.",
      warningCode: "parse_error",
    });
    return {
      estimate: fallback,
      probabilities: mapPsaToOutcomes(fallback.grade_probabilities!.psa),
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

  const estimate = buildEstimateFromParsed(
    parsed.value ?? {},
    options.imageStats,
    Boolean(parsed.warning)
  );
  const probabilities = estimate.grade_probabilities?.psa
    ? mapPsaToOutcomes(estimate.grade_probabilities.psa)
    : null;

  return {
    estimate,
    probabilities,
    evidence: {
      centering: estimate.centering,
      corners: estimate.corners,
      surface: estimate.surface,
      edges: estimate.edges,
      grade_notes: estimate.grade_notes,
    },
    preliminaryRange: buildRangeLabel(
      estimate.estimated_grade_low,
      estimate.estimated_grade_high
    ),
  };
}

export type { GradeEstimateEvidence, GradeEstimateModelParseResult };
