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
import { GradeVerdictCard } from "@/components/grading/GradeVerdictCard";
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
import { buildGradeVerdict } from "@/lib/grading/verdict";

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
}

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];
const BGS_ORDER = ["BGS 9.5", "BGS 9", "BGS 8.5", "BGS 8 or lower"];
const THUMBNAIL_SIZE_CLASS = "w-12 h-[68px]";

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
    <div className="rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[var(--biz-muted)]">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
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

export default function GradeProbabilityPanel({
  estimate,
  cardIdentity,
  primaryImageUrl,
  imageUrls,
  scanPhotos,
  showPreliminaryBadge,
}: GradeProbabilityPanelProps) {
  const [showBgsDistribution, setShowBgsDistribution] = useState(false);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
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

  const showStacked = frontBackUrls.length >= 2;
  const confidence = estimate.grade_probabilities?.confidence;
  const confidencePillClass = confidence
    ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium)
    : null;

  const cornerEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.corners);
  const edgeEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.edges);
  const surfaceEvidenceSource = formatSourceKinds(estimate.evidence_photo_sources?.surface);

  const panelRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const slabId = String(Date.now());

  const primaryUrl =
    normalizedScanPhotos[0]?.url ||
    (imageUrls?.filter(Boolean) ?? [])[0] ||
    primaryImageUrl ||
    undefined;

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

  return (
    <>
      <div ref={panelRef} className="overflow-hidden rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)]">
        {warningMessage ? (
          <div className="px-5 pt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {warningMessage}
            </div>
          </div>
        ) : null}

        {(estimate.visibility_notes?.length ?? 0) > 0 ? (
          <div className="px-5 pt-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {estimate.visibility_notes?.[0]}
            </div>
          </div>
        ) : null}

        <div className="border-b border-[var(--biz-border)] px-5 pb-5 pt-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            {frontBackUrls.length > 0 ? (
              <div className="shrink-0">
                <div
                  className={`overflow-hidden rounded-xl ring-1 ring-[color:var(--biz-border)] ${
                    showStacked ? "flex w-[100px] flex-col gap-1.5" : "h-[140px] w-[100px]"
                  }`}
                >
                  {showStacked ? (
                    frontBackUrls.map((url, i) => (
                      <div key={`${url}-${i}`} className="aspect-[3/4] w-full">
                        <img
                          src={url}
                          alt={i === 0 ? "Card front" : "Card back"}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))
                  ) : (
                    <img src={frontBackUrls[0]} alt="Card analyzed" className="h-full w-full object-cover" />
                  )}
                </div>
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
                  {gradingCopy.panel.title}
                </span>
                {showPreliminaryBadge ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                    Preliminary
                  </span>
                ) : null}
                {cardLabel ? (
                  <span className="max-w-[280px] truncate text-xs text-[var(--biz-muted)]">{cardLabel}</span>
                ) : null}
              </div>

              <div className="mb-3 flex flex-wrap items-end gap-4">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
                    {gradingCopy.panel.mostLikelyLabel}
                  </p>
                  {psaTotal > 0 && likely ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl font-bold tracking-tight text-[var(--biz-text)]">
                        {likely.label}
                      </span>
                      <span className="text-2xl font-semibold text-blue-700">
                        {formatPercent(likely.probability)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-4xl font-bold text-[var(--biz-muted)]">--</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-normal text-[var(--biz-muted)]">
                    {gradingCopy.panel.expectedValueLabel}
                  </span>
                  <span className="text-sm font-semibold text-[var(--biz-muted)]">{evLabel}</span>
                </div>

                {confidence && confidencePillClass ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${confidencePillClass}`}
                  >
                    {confidence} confidence
                  </span>
                ) : null}

                {showPhotoQualityWarning ? (
                  <span className="text-[10px] text-amber-700">{gradingCopy.panel.confidenceReduced}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <GradeVerdictCard verdict={verdict} />

        <div className="grid grid-cols-1 divide-y divide-[var(--biz-border)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="space-y-5 px-5 py-5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
                  {gradingCopy.panel.distributionTitle} - PSA
                </h4>
              </div>
              <div className="space-y-3">
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
            </div>

            {bgsOutcomes ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBgsDistribution((prev) => !prev)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
                >
                  <svg
                    className={`h-3 w-3 transition-transform duration-200 ${showBgsDistribution ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  BGS Distribution
                </button>
                {showBgsDistribution ? (
                  <div className="mt-3 space-y-3">
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
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="px-5 py-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
                {gradingCopy.panel.evidenceTitle}
              </h4>
              <p className="max-w-[180px] text-right text-[10px] leading-snug text-[var(--biz-muted)]">
                {gradingCopy.panel.evidenceNote}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <EvidenceBlock
                icon={
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                }
                label={gradingCopy.panel.evidenceLabels.centering}
                text={estimate.centering}
                detail={
                  centeringMeta
                    ? `L/R ${centeringMeta.left_right_ratio ?? "-"} · T/B ${centeringMeta.top_bottom_ratio ?? "-"}`
                    : undefined
                }
              />

              <EvidenceBlock
                icon={
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                }
                label={gradingCopy.panel.evidenceLabels.corners}
                text={estimate.corners}
                detail={cornerEvidenceSource ? `Source: ${cornerEvidenceSource}` : undefined}
              />

              <EvidenceBlock
                icon={
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                }
                label={gradingCopy.panel.evidenceLabels.surface}
                text={estimate.surface}
                detail={combineDetails(
                  topSurfaceFindings.length > 0
                    ? topSurfaceFindings
                        .map((f) => `${f.issue_type.replace(/_/g, " ")} sev ${f.severity_0_3}/3`)
                        .join(" | ")
                    : undefined,
                  surfaceEvidenceSource ? `Source: ${surfaceEvidenceSource}` : undefined
                )}
              />

              <EvidenceBlock
                icon={
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                    />
                  </svg>
                }
                label={gradingCopy.panel.evidenceLabels.edges}
                text={estimate.edges}
                detail={edgeEvidenceSource ? `Source: ${edgeEvidenceSource}` : undefined}
              />
            </div>

            {estimate.grade_notes ? (
              <div className="mt-3 rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] px-3 py-2">
                <p className="text-[11px] leading-relaxed text-[var(--biz-muted)]">
                  <span className="font-medium text-[var(--biz-text)]">{gradingCopy.panel.notesLabel}:</span>{" "}
                  {estimate.grade_notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {closeupPhotos.length > 0 ? (
          <div className="border-t border-[var(--biz-border)] px-5 py-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
              Close-up Photos
            </h4>
            <div className="mt-3 flex flex-wrap gap-3">
	              {closeupPhotos.map((photo, index) => (
                (() => {
                  const kind = photo.kind as GradeScanPhotoKind;
                  return (
	                <div
	                  key={`${photo.url}-${index}`}
	                  className="w-[92px] overflow-hidden rounded-md border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)]"
	                >
	                  <img
	                    src={photo.url}
	                    alt={GRADE_SCAN_KIND_LABELS[kind] ?? "Close-up"}
	                    className="h-[116px] w-full object-cover"
	                  />
	                  <p className="truncate px-2 py-1 text-[10px] font-medium text-[var(--biz-muted)]">
	                    {GRADE_SCAN_KIND_LABELS[kind] ?? kind}
	                  </p>
	                </div>
                  );
                })()
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-[var(--biz-border)] px-5 py-4">
          <button
            type="button"
            onClick={() => setShowAnalysisDetails((prev) => !prev)}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
          >
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${showAnalysisDetails ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Image Quality and Confidence Analysis
          </button>

          {showAnalysisDetails ? (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] p-3">
                <p className="mb-2 text-[10px] uppercase tracking-normal text-[var(--biz-muted)]">Image Quality</p>
                <p className="text-lg font-semibold text-[var(--biz-text)]">
                  {imageQuality?.overall_image_score ?? "-"}
                  <span className="text-sm font-normal text-[var(--biz-muted)]">/100</span>
                </p>
                {imageQuality?.subscores ? (
                  <div className="mt-2 space-y-0.5 text-xs text-[var(--biz-muted)]">
                    <p>Focus: {imageQuality.subscores.focus_sharpness}/25</p>
                    <p>Glare control: {imageQuality.subscores.lighting_glare_control}/25</p>
                    <p>Coverage: {imageQuality.subscores.coverage_angles}/25</p>
                    <p>Resolution: {imageQuality.subscores.resolution_distance}/25</p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] p-3">
                <p className="mb-2 text-[10px] uppercase tracking-normal text-[var(--biz-muted)]">Model Confidence</p>
                <p className="text-lg font-semibold text-[var(--biz-text)]">
                  {confidenceMeta?.overall_confidence_score ?? "-"}
                  <span className="text-sm font-normal text-[var(--biz-muted)]">/100</span>
                </p>
                {(confidenceMeta?.limiting_factors?.length ?? 0) > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--biz-muted)]">
                    {confidenceMeta?.limiting_factors.slice(0, 4).map((factor, idx) => (
                      <li key={`${factor}-${idx}`}>{factor}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--biz-border)] px-5 py-4">
          <p className="max-w-prose text-[10px] leading-relaxed text-[var(--biz-muted)]" data-export-disclaimer="true">
            {gradingCopy.panel.disclaimer}
          </p>

          <div className="flex items-center gap-2" data-export-ignore="true">
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-1.5 text-xs font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              Download PDF
            </button>

            <button
              type="button"
              onClick={handleExportPng}
              disabled={exportingPng}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-1.5 text-xs font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)] disabled:opacity-40"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              {exportingPng ? "Exporting..." : "Download PNG"}
            </button>
          </div>
        </div>

        {exportError ? (
          <div className="px-5 pb-4">
            <p className="text-xs text-rose-600">{exportError}</p>
          </div>
        ) : null}

        {frontBackUrls.length > 0 ? (
          <div
            className="flex items-center gap-2 border-t border-[var(--biz-border)] px-5 py-3 lg:hidden"
            data-export-ignore="true"
          >
            {frontBackUrls.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className={`${THUMBNAIL_SIZE_CLASS} shrink-0 overflow-hidden rounded-md ring-1 ring-[color:var(--biz-border)]`}
              >
                <img
                  src={url}
                  alt={i === 0 ? "Card front" : "Card back"}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {cardLabel ? <p className="truncate text-xs text-[var(--biz-muted)]">{cardLabel}</p> : null}
          </div>
        ) : null}
      </div>

      <div
        ref={printRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -9999,
          top: -9999,
          width: 794,
          visibility: "hidden",
          pointerEvents: "none",
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
