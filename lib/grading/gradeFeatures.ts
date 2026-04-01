import type {
  GradeEstimate,
  GradeEstimateCenteringDetail,
  GradeEstimateConfidence,
  GradeFinding,
  GradeImageQuality,
  GradeScanPhotoKind,
} from "@/types";
import type { GradeEstimateStatus, ImageStats } from "@/lib/grading/fallbackEstimate";

export const GRADE_FEATURE_VERSION = "v1";

export type GradeScanFeatureVector = Record<
  string,
  number | string | boolean | null
>;

export type GradeScanCardMeta = {
  game?: string | null;
  sport?: string | null;
  player_name?: string | null;
  title?: string | null;
  year?: string | number | null;
  set_name?: string | null;
  chrome?: boolean | null;
};

export type GradeScanFindingsByCategory = {
  surface?: GradeFinding[];
  corners?: GradeFinding[];
  edges?: GradeFinding[];
};

export type GradeScoreSnapshot = {
  centering_score: number;
  surface_score: number;
  corners_score: number;
  edges_score: number;
  weighted_evidence_score: number;
  calibrated_score: number;
  worst_axis_deviation: number;
};

export type GradeScanFeatureVectorInput = {
  estimate: GradeEstimate;
  imageQuality?: GradeImageQuality | null;
  centeringDetail?: GradeEstimateCenteringDetail | null;
  findings?: GradeScanFindingsByCategory | null;
  scanPhotoKinds?: GradeScanPhotoKind[];
  imageStats?: ImageStats | null;
  parseIncompleteFlag?: boolean;
  limitedVisibilityFlag?: boolean;
  analysisStatus?: GradeEstimateStatus | GradeEstimate["analysis_status"];
  cardMeta?: GradeScanCardMeta | null;
  scoreSnapshot?: Partial<GradeScoreSnapshot> | null;
  featureVersion?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseRatioPart(value: string): number | null {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return parsed;
}

export function ratioDeviation(ratio: string): number | null {
  const match = ratio.match(
    /^\s*(\d{1,2}(?:\.\d+)?)\s*\/\s*(\d{1,2}(?:\.\d+)?)\s*$/
  );
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

function hasAssessmentBlockedLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  const blockedPhrases = [
    "unable to assess",
    "unassessable",
    "cannot assess",
    "cannot be assessed",
    "difficult to assess",
    "blocked by glare",
    "obscured by glare",
    "too blurry to assess",
    "image blur prevents",
    "not visible due to",
  ];
  return blockedPhrases.some((phrase) => lower.includes(phrase));
}

export function scoreFromFindings(
  findings: GradeFinding[],
  summaryText: string,
  baselineScore: number
): number {
  if (findings.length === 0) {
    return hasAssessmentBlockedLanguage(summaryText)
      ? baselineScore - 10
      : baselineScore;
  }

  const weightedPenalty =
    findings.reduce((sum, finding) => {
      const confidenceFactor = clamp(finding.confidence_0_100 / 100, 0.2, 1);
      return sum + finding.severity_0_3 * 20 * confidenceFactor;
    }, 0) / findings.length;

  return clamp(100 - weightedPenalty, 5, 100);
}

export function scoreCentering(
  centering: GradeEstimateCenteringDetail,
  worstAxisOverride?: number
): number {
  const worstAxis =
    worstAxisOverride ??
    Math.max(
      ratioDeviation(centering.left_right_ratio) ?? 50,
      ratioDeviation(centering.top_bottom_ratio) ?? 50
    );
  const axisPenalty = clamp((worstAxis - 50) * 4, 0, 60);
  const severityPenalty = centering.centering_severity_0_3 * 9;
  const confidenceBoost = (centering.centering_confidence_score - 50) * 0.25;
  return clamp(100 - axisPenalty - severityPenalty + confidenceBoost, 5, 100);
}

function meanFindingSeverity(findings: GradeFinding[]): number {
  if (!findings.length) return 0;
  return (
    findings.reduce((sum, finding) => sum + finding.severity_0_3, 0) /
    findings.length
  );
}

function encodeConfidenceLabel(
  label: GradeEstimateConfidence["confidence_label"] | string | undefined
): { high: number; medium: number; low: number } {
  return {
    high: label === "high" ? 1 : 0,
    medium: label === "medium" ? 1 : 0,
    low: label === "low" ? 1 : 0,
  };
}

function encodeAnalysisStatus(
  status: GradeEstimateStatus | GradeEstimate["analysis_status"] | undefined
): { ok: number; low_confidence: number; unable: number } {
  return {
    ok: status === "ok" ? 1 : 0,
    low_confidence: status === "low_confidence" ? 1 : 0,
    unable: status === "unable" ? 1 : 0,
  };
}

function toYearNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function hasCornerCloseups(scanPhotoKinds: GradeScanPhotoKind[]): boolean {
  return scanPhotoKinds.some(
    (kind) =>
      kind === "corner_tl" ||
      kind === "corner_tr" ||
      kind === "corner_bl" ||
      kind === "corner_br"
  );
}

function hasEdgesCloseup(scanPhotoKinds: GradeScanPhotoKind[]): boolean {
  return scanPhotoKinds.includes("edges");
}

function hasSurfaceCloseup(scanPhotoKinds: GradeScanPhotoKind[]): boolean {
  return scanPhotoKinds.includes("surface");
}

function countCloseups(scanPhotoKinds: GradeScanPhotoKind[]): number {
  return scanPhotoKinds.filter((kind) => kind !== "front" && kind !== "back").length;
}

function readScoreFromEstimate(
  estimate: GradeEstimate,
  key: keyof GradeScoreSnapshot
): number | null {
  const metadata = estimate.analysis_metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata[key as keyof typeof metadata];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readBooleanFlagFromEstimate(
  estimate: GradeEstimate,
  key: "parse_incomplete_flag" | "limited_visibility_flag"
): boolean {
  const metadata = estimate.analysis_metadata;
  if (!metadata || typeof metadata !== "object") return false;
  return metadata[key] === true;
}

export function getGradeScanFeatureVector(
  input: GradeScanFeatureVectorInput
): GradeScanFeatureVector {
  const featureVersion = input.featureVersion ?? GRADE_FEATURE_VERSION;
  const estimate = input.estimate;
  const centering = input.centeringDetail ?? estimate.centering_detail;
  const imageQuality = input.imageQuality ?? estimate.image_quality;

  const surfaceFindings =
    input.findings?.surface ?? estimate.surface_findings ?? [];
  const cornersFindings =
    input.findings?.corners ?? estimate.corners_findings ?? [];
  const edgesFindings = input.findings?.edges ?? estimate.edges_findings ?? [];

  const scanPhotoKinds = Array.isArray(input.scanPhotoKinds)
    ? input.scanPhotoKinds
    : [];

  const worstAxisDeviation = centering
    ? Math.max(
        ratioDeviation(centering.left_right_ratio) ?? 50,
        ratioDeviation(centering.top_bottom_ratio) ?? 50
      )
    : 50;

  const centeringScore =
    input.scoreSnapshot?.centering_score ??
    readScoreFromEstimate(estimate, "centering_score") ??
    (centering ? scoreCentering(centering, worstAxisDeviation) : 50);

  const surfaceScore =
    input.scoreSnapshot?.surface_score ??
    readScoreFromEstimate(estimate, "surface_score") ??
    scoreFromFindings(surfaceFindings, estimate.surface ?? "", 64);

  const cornersScore =
    input.scoreSnapshot?.corners_score ??
    readScoreFromEstimate(estimate, "corners_score") ??
    scoreFromFindings(cornersFindings, estimate.corners ?? "", 74);

  const edgesScore =
    input.scoreSnapshot?.edges_score ??
    readScoreFromEstimate(estimate, "edges_score") ??
    scoreFromFindings(edgesFindings, estimate.edges ?? "", 74);

  const weightedEvidenceScore =
    input.scoreSnapshot?.weighted_evidence_score ??
    readScoreFromEstimate(estimate, "weighted_evidence_score") ??
    centeringScore * 0.4 +
      surfaceScore * 0.3 +
      cornersScore * 0.15 +
      edgesScore * 0.15;

  const confidenceScore = toFinite(
    estimate.confidence?.overall_confidence_score,
    55
  );
  const imageOverallScore = toFinite(imageQuality?.overall_image_score, 50);

  const calibratedScore =
    input.scoreSnapshot?.calibrated_score ??
    readScoreFromEstimate(estimate, "calibrated_score") ??
    clamp(
      weightedEvidenceScore +
        (imageOverallScore - 50) * 0.05 +
        (confidenceScore - 50) * 0.06,
      0,
      100
    );

  const confidenceLabel = estimate.confidence?.confidence_label ?? "medium";
  const encodedConfidence = encodeConfidenceLabel(confidenceLabel);

  const parseIncompleteFlag =
    input.parseIncompleteFlag ?? readBooleanFlagFromEstimate(estimate, "parse_incomplete_flag");
  const inferredLimitedVisibility = countCloseups(scanPhotoKinds) === 0;
  const limitedVisibilityFlag =
    input.limitedVisibilityFlag ??
    (readBooleanFlagFromEstimate(estimate, "limited_visibility_flag") ||
      inferredLimitedVisibility);

  const analysisStatus =
    input.analysisStatus ?? estimate.analysis_status ?? "low_confidence";
  const encodedStatus = encodeAnalysisStatus(analysisStatus);

  const cornerCloseups = hasCornerCloseups(scanPhotoKinds);
  const edgesCloseup = hasEdgesCloseup(scanPhotoKinds);
  const surfaceCloseup = hasSurfaceCloseup(scanPhotoKinds);
  const closeupsTotal = countCloseups(scanPhotoKinds);

  const cardMeta = input.cardMeta ?? null;
  const cardYear = toYearNumber(cardMeta?.year ?? null);

  const featureVector: GradeScanFeatureVector = {
    feature_version: featureVersion,

    v1_centering_score: centeringScore,
    v1_surface_score: surfaceScore,
    v1_corners_score: cornersScore,
    v1_edges_score: edgesScore,
    v1_weighted_evidence_score: weightedEvidenceScore,
    v1_calibrated_score: calibratedScore,

    v1_worst_axis_deviation: worstAxisDeviation,
    v1_centering_severity_0_3: toFinite(
      centering?.centering_severity_0_3,
      1
    ),
    v1_centering_confidence_score: toFinite(
      centering?.centering_confidence_score,
      50
    ),

    v1_image_quality_overall: imageOverallScore,
    v1_image_focus_sharpness: toFinite(
      imageQuality?.subscores.focus_sharpness,
      12
    ),
    v1_image_lighting_glare_control: toFinite(
      imageQuality?.subscores.lighting_glare_control,
      12
    ),
    v1_image_coverage_angles: toFinite(
      imageQuality?.subscores.coverage_angles,
      12
    ),
    v1_image_resolution_distance: toFinite(
      imageQuality?.subscores.resolution_distance,
      12
    ),

    v1_confidence_overall_score: confidenceScore,
    v1_confidence_label: confidenceLabel,
    v1_confidence_label_high: encodedConfidence.high,
    v1_confidence_label_medium: encodedConfidence.medium,
    v1_confidence_label_low: encodedConfidence.low,

    v1_has_corner_closeups: cornerCloseups ? 1 : 0,
    v1_has_edges_closeup: edgesCloseup ? 1 : 0,
    v1_has_surface_closeup: surfaceCloseup ? 1 : 0,
    v1_num_closeups_total: closeupsTotal,

    v1_surface_findings_count: surfaceFindings.length,
    v1_corners_findings_count: cornersFindings.length,
    v1_edges_findings_count: edgesFindings.length,

    v1_surface_findings_severity_avg: meanFindingSeverity(surfaceFindings),
    v1_corners_findings_severity_avg: meanFindingSeverity(cornersFindings),
    v1_edges_findings_severity_avg: meanFindingSeverity(edgesFindings),

    v1_limited_visibility_flag: limitedVisibilityFlag ? 1 : 0,
    v1_parse_incomplete_flag: parseIncompleteFlag ? 1 : 0,

    v1_analysis_status: analysisStatus,
    v1_analysis_status_ok: encodedStatus.ok,
    v1_analysis_status_low_confidence: encodedStatus.low_confidence,
    v1_analysis_status_unable: encodedStatus.unable,

    v1_estimated_grade_low: toFinite(estimate.estimated_grade_low, 7),
    v1_estimated_grade_high: toFinite(estimate.estimated_grade_high, 8),
  };

  if (input.imageStats) {
    featureVector.v1_image_stats_count = toFinite(input.imageStats.count, 0);
    featureVector.v1_image_stats_avg_bytes = toFinite(input.imageStats.avgBytes, 0);
    featureVector.v1_image_stats_max_bytes = toFinite(input.imageStats.maxBytes, 0);
    featureVector.v1_image_stats_min_bytes = toFinite(input.imageStats.minBytes, 0);
  }

  if (cardMeta?.sport) {
    featureVector.v1_card_meta_sport = cardMeta.sport;
  }
  if (cardMeta?.game) {
    featureVector.v1_card_meta_game = cardMeta.game;
  }
  if (cardYear !== null) {
    featureVector.v1_card_meta_year = cardYear;
  }
  if (cardMeta?.set_name) {
    featureVector.v1_card_meta_set_name = cardMeta.set_name;
  }
  if (typeof cardMeta?.chrome === "boolean") {
    featureVector.v1_card_meta_chrome = cardMeta.chrome ? 1 : 0;
  }

  return featureVector;
}
