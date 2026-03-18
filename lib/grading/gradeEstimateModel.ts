import type {
  GradeEstimate,
  GradeProbabilities,
  GradeFinding,
  GradeEstimateConfidence,
  GradeEstimateCenteringDetail,
  GradeImageQuality,
  GradeEvidencePhotoSources,
  GradeScanPhotoKind,
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
import {
  GRADE_FEATURE_VERSION,
  getGradeScanFeatureVector,
  ratioDeviation,
  scoreCentering,
  scoreFromFindings,
  type GradeScanCardMeta,
} from "@/lib/grading/gradeFeatures";
import {
  loadActiveModel,
  predictPsaProbabilities,
  PSA_CALIBRATOR_MODEL_KEY,
} from "@/lib/grading/calibrator";
import {
  resolveGradingProfile,
  type GradingCardCategory,
} from "@/lib/grading/grading-profile";

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
const SCAN_PHOTO_KINDS: GradeScanPhotoKind[] = [
  "front",
  "back",
  "corner_tl",
  "corner_tr",
  "corner_bl",
  "corner_br",
  "edges",
  "surface",
  "other",
];
const CORNER_CLOSEUP_KINDS: GradeScanPhotoKind[] = [
  "corner_tl",
  "corner_tr",
  "corner_bl",
  "corner_br",
];
const LIMITED_VISIBILITY_NOTE =
  "Limited visibility: no close-up photos provided for corners, edges, and surface.";

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

function blendProbabilityMaps<T extends Record<string, number>>(
  base: T,
  overlay: T,
  overlayWeight: number
): T {
  const weight = clamp(overlayWeight, 0, 1);
  const blended = Object.fromEntries(
    Object.keys(base).map((key) => [
      key,
      (base[key as keyof T] ?? 0) * (1 - weight) +
        (overlay[key as keyof T] ?? 0) * weight,
    ])
  ) as T;
  return normalizeProbabilityMap(blended);
}

function normalizeEvidenceKinds(value: unknown): GradeScanPhotoKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is GradeScanPhotoKind =>
      typeof item === "string" && SCAN_PHOTO_KINDS.includes(item as GradeScanPhotoKind)
  );
}

function hasCloseupKinds(scanPhotoKinds: GradeScanPhotoKind[]): boolean {
  return scanPhotoKinds.some(
    (kind) => kind !== "front" && kind !== "back"
  );
}

function buildDefaultEvidenceSources(
  scanPhotoKinds: GradeScanPhotoKind[]
): GradeEvidencePhotoSources {
  const available = new Set(scanPhotoKinds);
  const fallback: GradeScanPhotoKind[] = [];
  if (available.has("front")) fallback.push("front");
  if (available.has("back")) fallback.push("back");
  if (fallback.length === 0) fallback.push("front");

  const corners = CORNER_CLOSEUP_KINDS.filter((kind) => available.has(kind));
  const edges = available.has("edges") ? (["edges"] as GradeScanPhotoKind[]) : [];
  const surface = available.has("surface") ? (["surface"] as GradeScanPhotoKind[]) : [];

  return {
    corners: corners.length > 0 ? corners : fallback,
    edges: edges.length > 0 ? edges : fallback,
    surface: surface.length > 0 ? surface : fallback,
  };
}

function parseEvidenceSources(
  value: unknown,
  fallback: GradeEvidencePhotoSources
): GradeEvidencePhotoSources {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  const corners = normalizeEvidenceKinds(row.corners);
  const edges = normalizeEvidenceKinds(row.edges);
  const surface = normalizeEvidenceKinds(row.surface);
  return {
    corners: corners.length > 0 ? corners : fallback.corners,
    edges: edges.length > 0 ? edges : fallback.edges,
    surface: surface.length > 0 ? surface : fallback.surface,
  };
}

function applyLimitedVisibilityAdjustments(
  estimate: GradeEstimate,
  scanPhotoKinds: GradeScanPhotoKind[]
): GradeEstimate {
  if (hasCloseupKinds(scanPhotoKinds)) return estimate;

  const limitedVisibilityNotes = Array.from(
    new Set([...(estimate.visibility_notes ?? []), LIMITED_VISIBILITY_NOTE])
  );
  const confidenceScore = Math.min(
    estimate.confidence?.overall_confidence_score ?? 65,
    65
  );
  const confidenceLabel: GradeEstimateConfidence["confidence_label"] =
    confidenceScore >= 45 ? "medium" : "low";
  const confidence: GradeEstimateConfidence = {
    overall_confidence_score: confidenceScore,
    confidence_label: confidenceLabel,
    limiting_factors: Array.from(
      new Set([
        ...(estimate.confidence?.limiting_factors ?? []),
        "No category-specific close-up photos supplied.",
      ])
    ),
    what_was_clear: estimate.confidence?.what_was_clear ?? [],
  };

  const adjusted: GradeEstimate = {
    ...estimate,
    confidence,
    analysis_status:
      estimate.analysis_status === "unable" ? "unable" : "low_confidence",
    analysis_warning_code:
      estimate.analysis_status === "unable" ? "unable" : "low_confidence",
    grade_notes: `${estimate.grade_notes} ${LIMITED_VISIBILITY_NOTE}`,
    visibility_notes: limitedVisibilityNotes,
    analysis_metadata: {
      ...(estimate.analysis_metadata ?? {}),
      limited_visibility_flag: true,
    },
  };

  if (adjusted.grade_probabilities?.psa) {
    const psa = { ...adjusted.grade_probabilities.psa };
    // Limited visibility should reduce over-confidence, but not force a
    // downward grade shift when evidence is otherwise strong.
    const from10 = Math.min(psa["10"], 0.04);
    psa["10"] -= from10;
    psa["9"] += from10 * 0.7;
    psa["8"] += from10 * 0.3;
    const normalizedPsa = normalizeProbabilityMap(psa);
    adjusted.grade_probabilities = {
      ...adjusted.grade_probabilities,
      psa: normalizedPsa,
      bgs: normalizeProbabilityMap({
        "9.5": normalizedPsa["10"],
        "9": normalizedPsa["9"],
        "8.5": normalizedPsa["8"],
        "8_or_lower": normalizedPsa["7_or_lower"],
      }),
      confidence: confidenceLabel,
    };
  }

  return adjusted;
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
  // BGS 9.5 "Pristine" requires a perfect subgrade on all four categories and is
  // roughly 3-4x harder than PSA 10. Real-world hit rates: PSA 10 ~5-8% of submissions,
  // BGS 9.5 ~1-2%. A 1:1 remap would show wildly inflated BGS 9.5 numbers.
  //
  // Conversion model (coefficients sum to 1.0 per PSA input bucket):
  //   PSA 10  → 30% BGS 9.5 | 65% BGS 9  | 5%  BGS 8.5 | 0%  BGS 8-
  //   PSA 9   → 0%  BGS 9.5 | 78% BGS 9  | 17% BGS 8.5 | 5%  BGS 8-
  //   PSA 8   → 0%  BGS 9.5 | 0%  BGS 9  | 72% BGS 8.5 | 28% BGS 8-
  //   PSA 7-  → 0%  BGS 9.5 | 0%  BGS 9  | 0%  BGS 8.5 | 100% BGS 8-
  const bgs95 = psa["10"] * 0.30;
  const bgs9  = psa["10"] * 0.65 + psa["9"] * 0.78;
  const bgs85 = psa["10"] * 0.05 + psa["9"] * 0.17 + psa["8"] * 0.72;
  const bgs8orLower = psa["9"] * 0.05 + psa["8"] * 0.28 + psa["7_or_lower"];
  return normalizeProbabilityMap({
    "9.5": bgs95,
    "9": bgs9,
    "8.5": bgs85,
    "8_or_lower": bgs8orLower,
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

function mapWeightedScoreToRange(weightedScore: number): { low: number; high: number } {
  if (weightedScore >= 90) return { low: 9, high: 10 };
  if (weightedScore >= 82) return { low: 8, high: 9 };
  if (weightedScore >= 72) return { low: 7, high: 9 };
  if (weightedScore >= 62) return { low: 7, high: 8 };
  if (weightedScore >= 52) return { low: 6, high: 8 };
  return { low: 5, high: 7 };
}


// Breakpoints in descending order. Scores between breakpoints are interpolated
// linearly so the output changes gradually rather than jumping at hard thresholds.
// This makes distributions meaningfully different across similar cards.
const DETERMINISTIC_BREAKPOINTS: Array<{ threshold: number; dist: GradeProbabilities["psa"] }> = [
  { threshold: 97, dist: { "10": 0.55, "9": 0.35, "8": 0.08, "7_or_lower": 0.02 } },
  { threshold: 92, dist: { "10": 0.35, "9": 0.48, "8": 0.13, "7_or_lower": 0.04 } },
  { threshold: 86, dist: { "10": 0.18, "9": 0.52, "8": 0.22, "7_or_lower": 0.08 } },
  { threshold: 78, dist: { "10": 0.07, "9": 0.44, "8": 0.33, "7_or_lower": 0.16 } },
  { threshold: 68, dist: { "10": 0.03, "9": 0.28, "8": 0.40, "7_or_lower": 0.29 } },
  { threshold: 57, dist: { "10": 0.01, "9": 0.16, "8": 0.37, "7_or_lower": 0.46 } },
  { threshold: 0,  dist: { "10": 0.00, "9": 0.08, "8": 0.27, "7_or_lower": 0.65 } },
];

function lerpPsa(
  a: GradeProbabilities["psa"],
  b: GradeProbabilities["psa"],
  t: number
): GradeProbabilities["psa"] {
  return {
    "10": a["10"] + (b["10"] - a["10"]) * t,
    "9": a["9"] + (b["9"] - a["9"]) * t,
    "8": a["8"] + (b["8"] - a["8"]) * t,
    "7_or_lower": a["7_or_lower"] + (b["7_or_lower"] - a["7_or_lower"]) * t,
  };
}

function buildDeterministicPsaFromWeightedScore(
  weightedScore: number
): GradeProbabilities["psa"] {
  const score = clamp(weightedScore, 0, 100);
  const bps = DETERMINISTIC_BREAKPOINTS;

  // Above highest breakpoint
  if (score >= bps[0].threshold) return normalizeProbabilityMap(bps[0].dist);

  // Between breakpoints — interpolate so every score produces a unique distribution
  for (let i = 0; i < bps.length - 1; i++) {
    const upper = bps[i];
    const lower = bps[i + 1];
    if (score >= lower.threshold) {
      const range = upper.threshold - lower.threshold;
      const t = range > 0 ? (score - lower.threshold) / range : 1;
      return normalizeProbabilityMap(lerpPsa(lower.dist, upper.dist, t));
    }
  }

  return normalizeProbabilityMap(bps[bps.length - 1].dist);
}

function blendPsaDistributions(
  deterministic: GradeProbabilities["psa"],
  modelBased: GradeProbabilities["psa"] | null,
  confidence: GradeEstimateConfidence["confidence_label"],
  status: GradeEstimateStatus
): GradeProbabilities["psa"] {
  if (!modelBased) return deterministic;

  // Higher weights give Claude's card-specific read more influence,
  // reducing the repetitive "same distribution on every card" problem.
  let modelWeight = 0.55; // was 0.40
  if (confidence === "high") modelWeight = 0.70; // was 0.55
  if (confidence === "low") modelWeight = 0.30; // was 0.20
  if (status !== "ok") modelWeight = Math.min(modelWeight, 0.30); // was 0.25

  const blended: GradeProbabilities["psa"] = {
    "10": deterministic["10"] * (1 - modelWeight) + modelBased["10"] * modelWeight,
    "9": deterministic["9"] * (1 - modelWeight) + modelBased["9"] * modelWeight,
    "8": deterministic["8"] * (1 - modelWeight) + modelBased["8"] * modelWeight,
    "7_or_lower":
      deterministic["7_or_lower"] * (1 - modelWeight) +
      modelBased["7_or_lower"] * modelWeight,
  };
  return normalizeProbabilityMap(blended);
}

function applyCenteringGate(
  psa: GradeProbabilities["psa"],
  centering: GradeEstimateCenteringDetail,
  status: GradeEstimateStatus,
  category: GradingCardCategory
): GradeProbabilities["psa"] {
  const gated = { ...psa };
  const worstAxis = Math.max(
    ratioDeviation(centering.left_right_ratio) ?? 50,
    ratioDeviation(centering.top_bottom_ratio) ?? 50
  );
  const severity = centering.centering_severity_0_3;

  // PSA 10 ceiling scales with actual centering quality.
  // A near-perfect card should not be hard-capped at 18% — let the evidence speak.
  const tcgStrict = category !== "sports";
  let maxPsa10: number;
  if (status !== "ok") {
    maxPsa10 = 0.08;
  } else if (severity === 0 && worstAxis <= 52) {
    maxPsa10 = tcgStrict ? 0.68 : 0.85; // near-perfect centering
  } else if (severity === 0 && worstAxis <= 55) {
    maxPsa10 = tcgStrict ? 0.4 : 0.65;
  } else if (severity <= 1 && worstAxis <= 58) {
    maxPsa10 = tcgStrict ? 0.2 : 0.42;
  } else if (severity <= 1 && worstAxis <= 60) {
    maxPsa10 = tcgStrict ? 0.08 : 0.2;
  } else {
    maxPsa10 = 0.03;
  }
  // Hard overrides for genuinely bad centering — no matter what else looks good
  if (severity >= 2 || worstAxis > 60) maxPsa10 = Math.min(maxPsa10, 0.03);
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

function summarizeIssueSeverities(
  findings: GradeFinding[],
  issueTypes: Set<string>
): { moderateOrWorse: number; severe: number } {
  let moderateOrWorse = 0;
  let severe = 0;
  for (const finding of findings) {
    if (!issueTypes.has(finding.issue_type)) continue;
    if (finding.severity_0_3 >= 1) moderateOrWorse += 1;
    if (finding.severity_0_3 >= 2) severe += 1;
  }
  return { moderateOrWorse, severe };
}

function applyTcgDefectPenalty(
  psa: GradeProbabilities["psa"],
  category: GradingCardCategory,
  findings: {
    surface: GradeFinding[];
    corners: GradeFinding[];
    edges: GradeFinding[];
  },
  status: GradeEstimateStatus
): GradeProbabilities["psa"] {
  if (category === "sports") return psa;

  const adjusted = { ...psa };

  const whiteningIssues = new Set<string>(["whitening", "corner_wear", "edge_wear", "chipping"]);
  const printSurfaceIssues = new Set<string>(["print_line", "scratch", "scuff", "foil_roll"]);
  const roughCutIssues = new Set<string>(["rough_cut", "chipping"]);

  const whitenCorners = summarizeIssueSeverities(findings.corners, whiteningIssues);
  const whitenEdges = summarizeIssueSeverities(findings.edges, whiteningIssues);
  const printSurface = summarizeIssueSeverities(findings.surface, printSurfaceIssues);
  const roughCuts = summarizeIssueSeverities(findings.edges, roughCutIssues);

  let maxPsa10 = 0.6;
  if (status !== "ok") maxPsa10 = 0.2;

  if (category === "pokemon") {
    if (whitenCorners.moderateOrWorse + whitenEdges.moderateOrWorse >= 2) {
      maxPsa10 = Math.min(maxPsa10, 0.12);
    }
    if (whitenCorners.severe + whitenEdges.severe >= 1) {
      maxPsa10 = Math.min(maxPsa10, 0.05);
    }
    if (printSurface.moderateOrWorse >= 1) {
      maxPsa10 = Math.min(maxPsa10, 0.14);
    }
  } else {
    // One Piece / other TCG
    if (roughCuts.moderateOrWorse >= 1) {
      maxPsa10 = Math.min(maxPsa10, 0.08);
    }
    if (printSurface.moderateOrWorse >= 1) {
      maxPsa10 = Math.min(maxPsa10, 0.16);
    }
    if (whitenCorners.severe + whitenEdges.severe >= 1) {
      maxPsa10 = Math.min(maxPsa10, 0.06);
    }
  }

  if (adjusted["10"] > maxPsa10) {
    const excess = adjusted["10"] - maxPsa10;
    adjusted["10"] = maxPsa10;
    adjusted["8"] += excess * 0.45;
    adjusted["7_or_lower"] += excess * 0.55;
  }

  // If multiple moderate/severe defects exist, cap PSA 9 as well.
  const aggregateModerate =
    whitenCorners.moderateOrWorse +
    whitenEdges.moderateOrWorse +
    printSurface.moderateOrWorse +
    roughCuts.moderateOrWorse;
  const aggregateSevere =
    whitenCorners.severe +
    whitenEdges.severe +
    printSurface.severe +
    roughCuts.severe;

  if (aggregateModerate >= 3 || aggregateSevere >= 1) {
    const maxPsa9 = aggregateSevere >= 2 ? 0.28 : 0.4;
    if (adjusted["9"] > maxPsa9) {
      const excess = adjusted["9"] - maxPsa9;
      adjusted["9"] = maxPsa9;
      adjusted["8"] += excess * 0.48;
      adjusted["7_or_lower"] += excess * 0.52;
    }
  }

  return normalizeProbabilityMap(adjusted);
}

function applyConfidencePenalty(
  psa: GradeProbabilities["psa"],
  confidence: GradeEstimateConfidence["confidence_label"],
  options?: { strengthMultiplier?: number }
): GradeProbabilities["psa"] {
  if (confidence === "high") return psa;
  const adjusted = { ...psa };
  const strengthMultiplier = clamp(options?.strengthMultiplier ?? 1, 0, 1.25);
  const shift = (confidence === "medium" ? 0.05 : 0.09) * strengthMultiplier;

  // Uncertainty should widen outcomes, not systematically bias grades lower.
  // Pull probability mass from extreme tails toward the middle buckets.
  const from10 = Math.min(adjusted["10"], shift);
  const from7 = Math.min(adjusted["7_or_lower"], shift * 0.5);

  adjusted["10"] -= from10;
  adjusted["7_or_lower"] -= from7;

  adjusted["9"] += from10 * 0.65 + from7 * 0.4;
  adjusted["8"] += from10 * 0.35 + from7 * 0.6;

  return normalizeProbabilityMap(adjusted);
}

async function buildEstimateFromParsed(
  result: Record<string, unknown>,
  imageStats: ImageStats,
  parsedWarning: boolean,
  scanPhotoKinds: GradeScanPhotoKind[],
  cardMeta?: GradeScanCardMeta | null
): Promise<GradeEstimate> {
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

  const gradingProfile = resolveGradingProfile(cardMeta ?? null);
  const cardCategory = gradingProfile.category;
  const gradingWeights = gradingProfile.weights;
  const scoreBaselines =
    cardCategory === "sports"
      ? { surface: 82, corners: 88, edges: 88 }
      : cardCategory === "pokemon"
      ? { surface: 80, corners: 84, edges: 82 }
      : { surface: 79, corners: 83, edges: 82 };

  const worstAxisDeviation = Math.max(
    ratioDeviation(centeringDetail.left_right_ratio) ?? 50,
    ratioDeviation(centeringDetail.top_bottom_ratio) ?? 50
  );
  const centeringScore = scoreCentering(centeringDetail, worstAxisDeviation);
  // Baselines represent "no findings reported, no blocked language" — a genuinely
  // clean card should start high, not mediocre. Old values (64/74/74) caused
  // even flawless cards to land at mid-range calibrated scores.
  const surfaceScore = scoreFromFindings(
    surfaceFindings,
    toText(result.surface, ""),
    scoreBaselines.surface
  );
  const cornersScore = scoreFromFindings(
    cornersFindings,
    toText(result.corners, ""),
    scoreBaselines.corners
  );
  const edgesScore = scoreFromFindings(
    edgesFindings,
    toText(result.edges, ""),
    scoreBaselines.edges
  );
  const weightedEvidenceScore =
    centeringScore * gradingWeights.centering +
    surfaceScore * gradingWeights.surface +
    cornersScore * gradingWeights.corners +
    edgesScore * gradingWeights.edges;
  const imageInfluence = (imageQuality.overall_image_score - 50) * 0.12;
  const confidenceInfluence = (confidence.overall_confidence_score - 50) * 0.12;
  const calibratedScore = clamp(
    weightedEvidenceScore + imageInfluence + confidenceInfluence,
    0,
    100
  );
  const mappedRange = mapWeightedScoreToRange(calibratedScore);
  const finalLow = Math.min(normalizedLow, mappedRange.low);
  const finalHigh = Math.max(normalizedHigh, mappedRange.high);
  const limitedVisibilityFlag = !hasCloseupKinds(scanPhotoKinds);

  const defaultEvidenceSources = buildDefaultEvidenceSources(scanPhotoKinds);
  const evidencePhotoSources = parseEvidenceSources(
    result.evidence_sources,
    defaultEvidenceSources
  );
  const visibilityNotes = toStringArray(result.visibility_notes, []);

  const estimate: GradeEstimate = {
    estimated_grade_low: finalLow,
    estimated_grade_high: finalHigh,
    centering: `${centeringDetail.left_right_ratio} L/R, ${centeringDetail.top_bottom_ratio} T/B. ${centeringDetail.centering_notes}`,
    corners: toText(result.corners, fallback.corners),
    surface: toText(result.surface, fallback.surface),
    edges: toText(result.edges, fallback.edges),
    grade_notes: `${toText(result.grade_notes, fallback.grade_notes)} Weighted evidence score ${Math.round(
      calibratedScore
    )}/100 (${gradingProfile.label}; C ${Math.round(
      gradingWeights.centering * 100
    )}% / S ${Math.round(gradingWeights.surface * 100)}% / Co ${Math.round(
      gradingWeights.corners * 100
    )}% / E ${Math.round(gradingWeights.edges * 100)}%).`,
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
    evidence_photo_sources: evidencePhotoSources,
    visibility_notes: visibilityNotes,
    feature_version_used: GRADE_FEATURE_VERSION,
    analysis_metadata: {
      feature_version: GRADE_FEATURE_VERSION,
      grading_profile: gradingProfile.label,
      card_category: cardCategory,
      centering_score: centeringScore,
      surface_score: surfaceScore,
      corners_score: cornersScore,
      edges_score: edgesScore,
      weighted_evidence_score: weightedEvidenceScore,
      calibrated_score: calibratedScore,
      worst_axis_deviation: worstAxisDeviation,
      parse_incomplete_flag: parseWasIncomplete,
      limited_visibility_flag: limitedVisibilityFlag,
    },
  };

  const featureVector = getGradeScanFeatureVector({
    estimate,
    imageQuality,
    centeringDetail,
    findings: {
      surface: estimate.surface_findings,
      corners: estimate.corners_findings,
      edges: estimate.edges_findings,
    },
    scanPhotoKinds,
    imageStats,
    cardMeta: cardMeta ?? null,
    parseIncompleteFlag: parseWasIncomplete,
    limitedVisibilityFlag,
    analysisStatus,
    scoreSnapshot: {
      centering_score: centeringScore,
      surface_score: surfaceScore,
      corners_score: cornersScore,
      edges_score: edgesScore,
      weighted_evidence_score: weightedEvidenceScore,
      calibrated_score: calibratedScore,
      worst_axis_deviation: worstAxisDeviation,
    },
    featureVersion: GRADE_FEATURE_VERSION,
  });

  const psaOutcomesRaw = normalizeOutcomeArray(result.probabilities);
  const bgsOutcomesRaw = normalizeOutcomeArray(result.bgs_probabilities);
  const rangeLabel = buildRangeLabel(finalLow, finalHigh) ?? "PSA 6-8";
  const activeCalibrator = await loadActiveModel(PSA_CALIBRATOR_MODEL_KEY);
  const useSportsCalibrator = cardCategory === "sports";
  const calibratorPsa =
    useSportsCalibrator &&
    activeCalibrator &&
    activeCalibrator.feature_version === GRADE_FEATURE_VERSION
      ? predictPsaProbabilities({
          modelRecord: activeCalibrator,
          features: featureVector,
        })
      : null;

  const modelPsa = psaOutcomesRaw
    ? mapOutcomesToPsa(psaOutcomesRaw)
    : mapOutcomesToPsa(
        distributionFromRange(rangeLabel, confidence.confidence_label)
      );
  const deterministicPsa = buildDeterministicPsaFromWeightedScore(calibratedScore);
  const basePsa = blendPsaDistributions(
    deterministicPsa,
    modelPsa,
    confidence.confidence_label,
    analysisStatus
  );
  let psa = basePsa;
  if (calibratorPsa) {
    // Treat calibrator as an adjustment layer so card-specific evidence still
    // drives variation and we avoid repetitive distributions across scans.
    const calibratorWeight =
      confidence.confidence_label === "high"
        ? 0.45
        : confidence.confidence_label === "medium"
        ? 0.35
        : 0.25;
    psa = blendProbabilityMaps(basePsa, calibratorPsa, calibratorWeight);
  }
  psa = applyCenteringGate(psa, centeringDetail, analysisStatus, cardCategory);
  psa = applyTcgDefectPenalty(
    psa,
    cardCategory,
    {
      surface: surfaceFindings,
      corners: cornersFindings,
      edges: edgesFindings,
    },
    analysisStatus
  );
  psa = applyConfidencePenalty(psa, confidence.confidence_label, {
    strengthMultiplier: calibratorPsa ? 0.35 : gradingProfile.strictTcgDefects ? 1.1 : 1,
  });
  maybeWarnProbabilitySum(
    "PSA",
    Object.values(psa).reduce((sum, value) => sum + value, 0)
  );

  let bgs =
    cardCategory !== "sports" || calibratorPsa
      ? mapPsaToBgs(psa)
      : bgsOutcomesRaw
      ? mapOutcomesToBgs(bgsOutcomesRaw)
      : mapPsaToBgs(psa);
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
  if (calibratorPsa && activeCalibrator) {
    estimate.model_version_used = activeCalibrator.version;
    estimate.feature_version_used = activeCalibrator.feature_version;
  } else if (cardCategory !== "sports") {
    estimate.model_version_used = `rules:${gradingProfile.label}`;
  }

  return applyLimitedVisibilityAdjustments(estimate, scanPhotoKinds);
}

export async function parseGradeEstimateModelOutput(options: {
  modelText: string | null;
  imageStats: ImageStats;
  scanPhotoKinds?: GradeScanPhotoKind[];
  cardMeta?: GradeScanCardMeta | null;
}): Promise<GradeEstimateModelParseResult> {
  const scanPhotoKinds = options.scanPhotoKinds ?? ["front", "back"];
  const noResponseFallback = buildFallbackGradeEstimate({
    imageStats: options.imageStats,
    status: "unable",
    reason: "No response from grade estimation service.",
    warningCode: "unable",
  });

  if (!options.modelText) {
    const estimate = applyLimitedVisibilityAdjustments(
      noResponseFallback,
      scanPhotoKinds
    );
    estimate.feature_version_used = GRADE_FEATURE_VERSION;
    estimate.analysis_metadata = {
      ...(estimate.analysis_metadata ?? {}),
      feature_version: GRADE_FEATURE_VERSION,
      parse_incomplete_flag: true,
      limited_visibility_flag: !hasCloseupKinds(scanPhotoKinds),
    };
    return {
      estimate,
      probabilities: mapPsaToOutcomes(estimate.grade_probabilities!.psa),
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

  const parsed = parseJsonWithRepair<Record<string, unknown>>(options.modelText);
  if (!parsed) {
    const fallback = buildFallbackGradeEstimate({
      imageStats: options.imageStats,
      status: "low_confidence",
      reason: "Unable to parse AI response.",
      warningCode: "parse_error",
    });
    const estimate = applyLimitedVisibilityAdjustments(fallback, scanPhotoKinds);
    estimate.feature_version_used = GRADE_FEATURE_VERSION;
    estimate.analysis_metadata = {
      ...(estimate.analysis_metadata ?? {}),
      feature_version: GRADE_FEATURE_VERSION,
      parse_incomplete_flag: true,
      limited_visibility_flag: !hasCloseupKinds(scanPhotoKinds),
    };
    return {
      estimate,
      probabilities: mapPsaToOutcomes(estimate.grade_probabilities!.psa),
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

  const estimate = await buildEstimateFromParsed(
    parsed.value ?? {},
    options.imageStats,
    Boolean(parsed.warning),
    scanPhotoKinds,
    options.cardMeta ?? null
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
