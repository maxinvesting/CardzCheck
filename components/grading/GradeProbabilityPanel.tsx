"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { GradeEstimate, GradeScanPhoto, GradeScanPhotoKind } from "@/types";
import { gradingCopy } from "@/copy/grading";
import {
  downloadGradeReportPng,
  openGradeReportPdf,
} from "@/lib/grading/exportGradeProbabilityImage";
import { confidencePillClasses } from "@/theme/tokens";
import { GradeReportPrint } from "@/components/grading/GradeReportPrint";
import {
  distributionFromRange,
  normalizeDistribution,
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";
import {
  GRADE_SCAN_KIND_LABELS,
  normalizeGradeScanPhotos,
} from "@/lib/grading/scanPhotos";
import { buildGradeVerdict, type GradeVerdict } from "@/lib/grading/verdict";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { buildCompsLinks } from "@/lib/ebay/comps-url";

interface GradeProbabilityPanelProps {
  estimate: GradeEstimate;
  cardIdentity?: {
    player_name?: string;
    year?: string;
    set_name?: string;
    parallel_type?: string;
  } | null;
  primaryImageUrl?: string | null;
  imageUrls?: string[] | null;
  scanPhotos?: GradeScanPhoto[] | null;
  showPreliminaryBadge?: boolean;
  compact?: boolean;
  /** Correction text applied during a refinement re-run — shows a "Refined" badge */
  appliedRefinement?: string | null;
}

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];
const BGS_ORDER = ["BGS 9.5", "BGS 9", "BGS 8.5", "BGS 8 or lower"];

const RECOMMENDATION_CLASSES: Record<GradeVerdict["recommendation"], string> = {
  Grade: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Borderline: "border-amber-200 bg-amber-50 text-amber-700",
  "Sell Raw": "border-slate-200 bg-slate-100 text-slate-700",
  "Rescan Needed": "border-rose-200 bg-rose-50 text-rose-700",
};

// ─────────────────────────────────────────────────────────
// Pure helpers (unchanged logic)
// ─────────────────────────────────────────────────────────

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

function mapToPsaBuckets(outcomes: GradeOutcome[]): GradeOutcome[] {
  const map = new Map(PSA_ORDER.map((label) => [label, 0]));
  outcomes.forEach((outcome) => {
    const normalized = outcome.label.toUpperCase();
    let bucket = "PSA 7 or lower";
    if (normalized.includes("10")) bucket = "PSA 10";
    else if (normalized.includes("9")) bucket = "PSA 9";
    else if (normalized.includes("8")) bucket = "PSA 8";
    map.set(bucket, (map.get(bucket) ?? 0) + outcome.probability);
  });
  return PSA_ORDER.map((label) => ({ label, probability: map.get(label) ?? 0 }));
}

function getPsaOutcomes(
  estimate: GradeEstimate,
  options?: { allowPsa10Override: boolean }
): GradeOutcome[] {
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
      { allowPsa10Override: options?.allowPsa10Override ?? false }
    );
  }

  const rangeLabel = buildRangeLabel(estimate);
  const derived = rangeLabel
    ? distributionFromRange(rangeLabel, estimate.grade_probabilities?.confidence)
    : [];
  return normalizePsaDistribution(mapToPsaBuckets(derived), {
    allowPsa10Override: options?.allowPsa10Override ?? false,
  });
}

function getBgsOutcomes(estimate: GradeEstimate): GradeOutcome[] | null {
  if (!estimate.grade_probabilities?.bgs) return null;
  return normalizeDistribution([
    { label: "BGS 9.5", probability: estimate.grade_probabilities.bgs["9.5"] },
    { label: "BGS 9", probability: estimate.grade_probabilities.bgs["9"] },
    { label: "BGS 8.5", probability: estimate.grade_probabilities.bgs["8.5"] },
    {
      label: "BGS 8 or lower",
      probability: estimate.grade_probabilities.bgs["8_or_lower"],
    },
  ]);
}

function expectedValue(outcomes: GradeOutcome[]): number {
  const gradeMap: Record<string, number> = {
    "PSA 10": 10,
    "PSA 9": 9,
    "PSA 8": 8,
    "PSA 7 or lower": 7,
  };
  return outcomes.reduce((sum, outcome) => {
    const value = gradeMap[outcome.label] ?? 0;
    return sum + outcome.probability * value;
  }, 0);
}

function mostLikely(outcomes: GradeOutcome[]): GradeOutcome | null {
  if (!outcomes.length) return null;
  return outcomes.reduce((max, outcome) =>
    outcome.probability > max.probability ? outcome : max
  );
}

function hasAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function isNegated(text: string, token: string): boolean {
  const pattern = token.replace(/\s+/g, "\\s+");
  const regex = new RegExp(`\\b(no|without)\\b[^.]{0,20}\\b${pattern}\\b`);
  return regex.test(text);
}

function hasNegativeSignals(text: string): boolean {
  const negatives = [
    "whitening",
    "wear",
    "ding",
    "damage",
    "fray",
    "scratch",
    "scuff",
    "print line",
    "crease",
    "chip",
    "rough",
    "off-center",
    "off center",
    "stain",
    "discolor",
    "dent",
    "nick",
  ];
  return negatives.some(
    (token) => text.includes(token) && !isNegated(text, token)
  );
}

function isTopTierCentering(text: string): boolean {
  const ratioRegex = /(\d{2})\s*\/\s*(\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = ratioRegex.exec(text)) !== null) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (
      Number.isFinite(left) &&
      Number.isFinite(right) &&
      Math.max(left, right) <= 52 &&
      Math.min(left, right) >= 48
    ) {
      return true;
    }
  }
  return hasAny(text, ["perfect", "ideal", "50/50"]);
}

function isTopTierCondition(text: string): boolean {
  const positives = [
    "sharp",
    "clean",
    "pristine",
    "flawless",
    "intact",
    "no visible",
    "well-cut",
    "well cut",
  ];
  return hasAny(text, positives) && !hasNegativeSignals(text);
}

function meetsTopTierEvidence(estimate: GradeEstimate): boolean {
  const centering = estimate.centering?.toLowerCase() ?? "";
  const corners = estimate.corners?.toLowerCase() ?? "";
  const surface = estimate.surface?.toLowerCase() ?? "";
  const edges = estimate.edges?.toLowerCase() ?? "";
  return (
    isTopTierCentering(centering) &&
    isTopTierCondition(corners) &&
    isTopTierCondition(surface) &&
    isTopTierCondition(edges)
  );
}

function hasPhotoQualityFlag(notes?: string | null): boolean {
  if (!notes) return false;
  const lower = notes.toLowerCase();
  return ["photo", "image", "lighting", "blurry", "glare", "resolution"].some(
    (token) => lower.includes(token)
  );
}

function buildCardIdentityLabel(cardIdentity?: {
  player_name?: string;
  year?: string;
  set_name?: string;
  parallel_type?: string;
} | null): string | null {
  if (!cardIdentity) return null;
  const parts: string[] = [];
  if (cardIdentity.player_name) parts.push(cardIdentity.player_name);
  if (cardIdentity.year) parts.push(cardIdentity.year);
  if (cardIdentity.set_name) {
    let setLabel = cardIdentity.set_name;
    if (cardIdentity.parallel_type) {
      setLabel = `${setLabel} (${cardIdentity.parallel_type})`;
    }
    parts.push(setLabel);
  } else if (cardIdentity.parallel_type) {
    parts.push(cardIdentity.parallel_type);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatSourceKinds(kinds: GradeScanPhotoKind[] | undefined): string | undefined {
  if (!kinds || kinds.length === 0) return undefined;
  const labels = Array.from(new Set(kinds.map((kind) => GRADE_SCAN_KIND_LABELS[kind] ?? kind)));
  return labels.join(", ");
}

function combineDetails(...details: Array<string | undefined>): string | undefined {
  const parts = details
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (parts.length === 0) return undefined;
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[9px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
      {children}
    </h4>
  );
}

function VerdictStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-[var(--biz-text)]">{value}</p>
    </div>
  );
}

function ProbabilityBar({
  label,
  probability,
  isHighlighted,
  accentColor,
}: {
  label: string;
  probability: number;
  isHighlighted: boolean;
  accentColor: "blue" | "emerald";
}) {
  const percent = Math.round(probability * 100);
  const barColor = accentColor === "blue" ? "bg-blue-500" : "bg-emerald-500";
  const barColorDim = accentColor === "blue" ? "bg-blue-500/30" : "bg-emerald-500/30";

  return (
    <div className={`transition-opacity ${percent === 0 ? "opacity-40" : ""}`}>
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`text-xs ${
            isHighlighted ? "font-medium text-[var(--biz-text)]" : "text-[var(--biz-muted)]"
          }`}
        >
          {label}
        </span>
        <span
          className={`font-mono text-xs ${
            isHighlighted ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)]"
          }`}
        >
          {percent}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--biz-hover)]">
        <div
          className={`h-full rounded-full transition-all ${isHighlighted ? barColor : barColorDim}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function EvidenceBlock({
  icon,
  label,
  text,
  detail,
}: {
  icon: ReactNode;
  label: string;
  text: string | undefined;
  detail?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text && text.length > 80;
  const displayText = truncated && !expanded ? `${text.slice(0, 80)}…` : text;

  return (
    <div className="rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[var(--biz-muted)]">{icon}</span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
          {label}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-[var(--biz-muted)]">
        {displayText || <span className="italic text-[var(--biz-muted)]">No data</span>}
      </p>
      {detail ? (
        <p className="mt-1 text-[10px] leading-snug text-[var(--biz-muted)]">{detail}</p>
      ) : null}
      {truncated ? (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-[10px] text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

export default function GradeProbabilityPanel({
  estimate,
  cardIdentity,
  primaryImageUrl,
  imageUrls,
  scanPhotos,
  showPreliminaryBadge,
  compact = false,
  appliedRefinement,
}: GradeProbabilityPanelProps) {
  const confidence = estimate.grade_probabilities?.confidence;

  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [showBgsDistribution, setShowBgsDistribution] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const allowPsa10Override =
    estimate.grade_probabilities?.confidence === "high" &&
    meetsTopTierEvidence(estimate);
  const psaOutcomes = getPsaOutcomes(estimate, { allowPsa10Override });
  const bgsOutcomes = getBgsOutcomes(estimate);
  const psaTotal = psaOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const likely = mostLikely(psaOutcomes);
  const ev = expectedValue(psaOutcomes);
  const showPhotoQualityWarning = hasPhotoQualityFlag(estimate.grade_notes);
  const imageQuality = estimate.image_quality;
  const confidenceMeta = estimate.confidence;
  const centeringMeta = estimate.centering_detail;
  const topSurfaceFindings = (estimate.surface_findings ?? []).slice(0, 3);
  const evLabel = psaTotal > 0 ? ev.toFixed(1) : "--";
  const warningMessage = estimate.analysis_warning_code
    ? gradingCopy.panel.warnings[estimate.analysis_warning_code]
    : undefined;
  const cardLabel = buildCardIdentityLabel(cardIdentity);
  const verdict = useMemo(
    () => buildGradeVerdict(estimate, cardIdentity),
    [estimate, cardIdentity]
  );

  const confidencePillClass = confidence
    ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium)
    : null;

  const cornerEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.corners);
  const edgeEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.edges);
  const surfaceEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.surface);

  const normalizedScanPhotos = useMemo(() => {
    const fromProps = normalizeGradeScanPhotos(scanPhotos ?? undefined);
    if (fromProps.length > 0) return fromProps;
    const fallbackUrls = (imageUrls?.filter(Boolean) ?? []).map((url) => url.trim());
    if (fallbackUrls.length > 0) {
      return normalizeGradeScanPhotos(
        fallbackUrls.map((url, index) => ({
          url,
          kind: index === 0 ? "front" : index === 1 ? "back" : "other",
          sort_order: index,
        }))
      );
    }
    if (primaryImageUrl?.trim()) {
      return [{ url: primaryImageUrl.trim(), kind: "front", sort_order: 0 }];
    }
    return [];
  }, [imageUrls, primaryImageUrl, scanPhotos]);

  const frontBackUrls = useMemo(() => {
    const front = normalizedScanPhotos.find((photo) => photo.kind === "front")?.url;
    const back = normalizedScanPhotos.find((photo) => photo.kind === "back")?.url;
    if (front && back) return [front, back];
    if (front) return [front];
    if (back) return [back];
    return normalizedScanPhotos.slice(0, 2).map((photo) => photo.url);
  }, [normalizedScanPhotos]);

  const closeupPhotos = useMemo(
    () => normalizedScanPhotos.filter((photo) => photo.kind !== "front" && photo.kind !== "back"),
    [normalizedScanPhotos]
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const slabId = String(Date.now());

  const primaryUrl =
    normalizedScanPhotos[0]?.url ||
    (imageUrls?.filter(Boolean) ?? [])[0] ||
    primaryImageUrl ||
    undefined;

  const selectedPhotoUrl =
    normalizedScanPhotos[selectedPhotoIdx]?.url ?? primaryUrl;

  const handleExportPng = async () => {
    if (!printRef.current || exportingPng) return;
    setExportingPng(true);
    setExportError(null);
    try {
      await downloadGradeReportPng(printRef.current, "cardzcheck-grade-report");
    } catch (err) {
      console.error("Failed to export grade report PNG:", err);
      setExportError("Sorry, we couldn't export the image. Please try again.");
    } finally {
      setExportingPng(false);
    }
  };

  const handleExportPdf = () => {
    setExportError(null);
    try {
      openGradeReportPdf({
        estimate,
        cardIdentity,
        primaryImageUrl,
        imageUrls,
        generatedAt: new Date().toISOString(),
        slabId,
      });
    } catch (err) {
      console.error("Failed to open PDF print page:", err);
      setExportError("Sorry, we couldn't open the PDF page. Please try again.");
    }
  };

  const warningBanner =
    warningMessage ||
    (showPhotoQualityWarning ? gradingCopy.panel.confidenceReduced : null);
  const visibilityNote =
    !warningBanner && (estimate.visibility_notes?.length ?? 0) > 0
      ? estimate.visibility_notes![0]
      : null;
  const inlineBanner = warningBanner || visibilityNote;

  return (
    <>
      {/* ── DARK GALLERY VIEWER ─────────────────────────────────────────── */}
      <div
        ref={panelRef}
        className="flex flex-col lg:flex-row overflow-hidden rounded-xl border border-white/8 bg-[#111]"
        style={{ minHeight: 560 }}
      >

        {/* ══ LEFT INFO PANEL ══════════════════════════════════════════════ */}
        <div className="w-full lg:w-[268px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-white/8 overflow-y-auto">

          {/* Brand label */}
          <div className="px-5 pt-5 pb-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#c8a951]">
              CardzCheck · AI Estimate
            </p>
            {showPreliminaryBadge && (
              <span className="mt-1 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                Preliminary
              </span>
            )}
            {appliedRefinement && (
              <span
                title={`Refined with: "${appliedRefinement}"`}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400 cursor-help"
              >
                ✦ Refined</span>
            )}
          </div>

          {/* Grade hero */}
          <div className="px-5 pb-5">
            {psaTotal > 0 && likely ? (
              <div className="flex items-baseline gap-2.5">
                <span className="text-[52px] font-black leading-none tracking-tight text-white">
                  {likely.label}
                </span>
                <span className="text-[22px] font-bold leading-none text-blue-400">
                  {formatPercent(likely.probability)}
                </span>
              </div>
            ) : (
              <span className="text-[52px] font-black leading-none text-white/20">--</span>
            )}

            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">EV</span>
              <span className="text-sm font-semibold text-white/35">{evLabel}</span>
            </div>

            {cardLabel && (
              <p className="mt-3 text-[11px] leading-snug text-white/45">{cardLabel}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${RECOMMENDATION_CLASSES[verdict.recommendation]}`}>
                {verdict.recommendation}
              </span>
              {confidence && confidencePillClass && (
                <span className={`text-[9px] font-semibold uppercase tracking-wide ${confidencePillClass}`}>
                  {confidence} conf.
                </span>
              )}
              <span className="text-[9px] text-white/25">→ {verdict.suggestedGrader}</span>
            </div>
          </div>

          {/* Warning banner */}
          {inlineBanner && (
            <div className="mx-5 mb-4 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
              <p className="text-[10px] leading-snug text-amber-400">{inlineBanner}</p>
            </div>
          )}

          {/* Grade Probability Distribution */}
          <div className="px-5 pt-4 pb-5 border-t border-white/8">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-3">
              Grade Probability · PSA
            </p>
            <div className="space-y-2.5">
              {psaOutcomes.map((outcome) => (
                <ProbabilityBar
                  key={outcome.label}
                  label={outcome.label}
                  probability={outcome.probability}
                  isHighlighted={outcome.label === likely?.label}
                  accentColor="blue"
                />
              ))}
            </div>
            {bgsOutcomes && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowBgsDistribution((prev) => !prev)}
                  className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/25 transition-colors hover:text-white/60"
                >
                  <svg className={`h-3 w-3 transition-transform duration-200 ${showBgsDistribution ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  BGS Distribution
                </button>
                {showBgsDistribution && (
                  <div className="mt-2.5 space-y-2.5">
                    {BGS_ORDER.map((label) => {
                      const outcome = bgsOutcomes.find((item) => item.label === label);
                      return (
                        <ProbabilityBar
                          key={label}
                          label={label}
                          probability={outcome?.probability ?? 0}
                          isHighlighted={false}
                          accentColor="emerald"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Evidence (collapsible) */}
          <div className="border-t border-white/8">
            <button
              type="button"
              onClick={() => setEvidenceOpen((p) => !p)}
              className="w-full flex items-center justify-between px-5 py-3 text-[9px] font-semibold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              Evidence from Photos
              <svg className={`h-3 w-3 transition-transform duration-200 ${evidenceOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {evidenceOpen && (
              <div
                className="px-5 pb-5 space-y-2"
                style={{
                  "--biz-border": "rgba(255,255,255,0.08)",
                  "--biz-surface": "#1c1c1c",
                  "--biz-surface-soft": "#161616",
                  "--biz-hover": "#222",
                  "--biz-muted": "rgba(255,255,255,0.40)",
                  "--biz-text": "#fff",
                } as React.CSSProperties}
              >
                <EvidenceBlock
                  icon={<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>}
                  label="Centering"
                  text={estimate.centering}
                  detail={centeringMeta ? `L/R ${centeringMeta.left_right_ratio ?? "-"} · T/B ${centeringMeta.top_bottom_ratio ?? "-"}` : undefined}
                />
                <EvidenceBlock
                  icon={<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                  label="Corners"
                  text={estimate.corners}
                  detail={cornerEvidenceSource ? `Source: ${cornerEvidenceSource}` : undefined}
                />
                <EvidenceBlock
                  icon={<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>}
                  label="Surface"
                  text={estimate.surface}
                  detail={combineDetails(
                    topSurfaceFindings.length > 0 ? topSurfaceFindings.map((f) => `${f.issue_type.replace(/_/g, " ")} sev ${f.severity_0_3}/3`).join(" | ") : undefined,
                    surfaceEvidenceSource ? `Source: ${surfaceEvidenceSource}` : undefined
                  )}
                />
                <EvidenceBlock
                  icon={<svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>}
                  label="Edges"
                  text={estimate.edges}
                  detail={edgeEvidenceSource ? `Source: ${edgeEvidenceSource}` : undefined}
                />
                {estimate.grade_notes && (
                  <div className="rounded-lg border border-white/8 bg-white/3 p-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1">Notes</p>
                    <p className="text-[10px] leading-relaxed text-white/40">{estimate.grade_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verdict (collapsible) */}
          <div className="border-t border-white/8">
            <button
              type="button"
              onClick={() => setVerdictOpen((p) => !p)}
              className="w-full flex items-center justify-between px-5 py-3 text-[9px] font-semibold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              The Verdict
              <svg className={`h-3 w-3 transition-transform duration-200 ${verdictOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {verdictOpen && (
              <div
                className="px-5 pb-5 space-y-2"
                style={{
                  "--biz-border": "rgba(255,255,255,0.08)",
                  "--biz-surface": "#1c1c1c",
                  "--biz-surface-soft": "#161616",
                  "--biz-hover": "#222",
                  "--biz-muted": "rgba(255,255,255,0.40)",
                  "--biz-text": "#fff",
                } as React.CSSProperties}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <VerdictStat label="Recommendation" value={verdict.recommendation} />
                  <VerdictStat label="Suggested Grader" value={verdict.suggestedGrader} />
                  <VerdictStat label="Expected Outcome" value={verdict.expectedOutcome} />
                  <VerdictStat label="Strategy" value={verdict.strategyTip} />
                </div>
                {verdict.reasoning && (
                  <div className="rounded-md border border-white/8 bg-white/3 px-3 py-2.5">
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-white/30">Reasoning</p>
                    <p className="text-[10px] leading-relaxed text-white/40">{verdict.reasoning}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer — export + TTS + disclaimer */}
          <div className="mt-auto border-t border-white/8 px-5 py-4">
            <div className="flex items-center gap-2" data-export-ignore="true">
              <button
                type="button"
                onClick={handleExportPdf}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={handleExportPng}
                disabled={exportingPng}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
              >
                {exportingPng ? "…" : "PNG"}
              </button>
              <SpeakButton
                text={[
                  likely ? `Most likely grade: ${likely.label} with ${Math.round(likely.probability * 100)} percent probability.` : "",
                  `Recommendation: ${verdict.recommendation}.`,
                  `Suggested grader: ${verdict.suggestedGrader}.`,
                  estimate.centering ? `Centering: ${estimate.centering}.` : "",
                  estimate.corners ? `Corners: ${estimate.corners}.` : "",
                  estimate.surface ? `Surface: ${estimate.surface}.` : "",
                  estimate.edges ? `Edges: ${estimate.edges}.` : "",
                ].filter(Boolean).join(" ")}
                size="sm"
              />
            </div>
            {exportError && (
              <p className="mt-2 text-[10px] text-rose-400">{exportError}</p>
            )}
            <p className="mt-3 text-[9px] leading-relaxed text-white/18" data-export-disclaimer="true">
              {gradingCopy.panel.disclaimer}
            </p>
          </div>
        </div>

        {/* ══ CENTER — CARD IMAGE ══════════════════════════════════════════ */}
        <div
          className="flex-1 flex items-center justify-center bg-[#0a0a0a] p-8"
          style={{ minHeight: 420 }}
        >
          {selectedPhotoUrl ? (
            <img
              src={selectedPhotoUrl}
              alt="Card"
              className="max-w-full object-contain rounded-lg"
              style={{
                maxHeight: 580,
                filter: "drop-shadow(0 0 48px rgba(0,0,0,0.9))",
              }}
            />
          ) : (
            <div className="text-white/15 text-sm">No image</div>
          )}
        </div>

        {/* ══ RIGHT — THUMBNAIL STRIP ═════════════════════════════════════ */}
        {normalizedScanPhotos.length > 1 && (
          <div className="flex flex-row lg:flex-col gap-2 p-2.5 bg-[#0a0a0a] border-t lg:border-t-0 lg:border-l border-white/8 lg:w-[76px] overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto">
            {normalizedScanPhotos.map((photo, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedPhotoIdx(i)}
                className={`shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                  selectedPhotoIdx === i
                    ? "border-blue-500 opacity-100"
                    : "border-white/10 opacity-50 hover:opacity-80 hover:border-white/30"
                }`}
              >
                <img
                  src={photo.url}
                  alt={GRADE_SCAN_KIND_LABELS[photo.kind as GradeScanPhotoKind] ?? `Photo ${i + 1}`}
                  className="w-[52px] h-[68px] object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── VERIFY COMPS ─────────────────────────────────────────────────── */}
      {cardIdentity && (cardIdentity.player_name || cardIdentity.set_name) && (() => {
        const { psa10Url, psa9Url, rawUrl } = buildCompsLinks({
          player: cardIdentity.player_name,
          year: cardIdentity.year,
          setName: cardIdentity.set_name,
          parallel: cardIdentity.parallel_type,
        });
        return (
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-[#0d1b2a] px-4 py-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-blue-400/70">
              Verify Comps on eBay
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={psa10Url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-blue-900/40 bg-blue-950/40 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-900/50 transition-colors"
              >
                PSA 10 sold →
              </a>
              <a
                href={psa9Url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-blue-900/40 bg-blue-950/40 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-900/50 transition-colors"
              >
                PSA 9 sold →
              </a>
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/50 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
              >
                Raw sold →
              </a>
            </div>
            <p className="mt-2 text-[9px] text-white/25">
              Click to verify current eBay sold prices
            </p>
          </div>
        );
      })()}

      {/* Off-screen print target */}
      <div
        ref={printRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width: 794,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <GradeReportPrint
          estimate={estimate}
          cardIdentity={cardIdentity}
          primaryImageUrl={primaryUrl}
          imageUrls={normalizedScanPhotos.map((photo) => photo.url)}
          generatedAt={new Date().toISOString()}
          slabId={slabId}
        />
      </div>
    </>
  );
}
