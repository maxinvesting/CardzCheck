"use client";

import { useRef, useState } from "react";
import type { GradeEstimate } from "@/types";
import { gradingCopy } from "@/copy/grading";
import { downloadGradeProbabilityImage } from "@/lib/grading/exportGradeProbabilityImage";
import { confidencePillClasses } from "@/theme/tokens";
import {
  distributionFromRange,
  normalizeDistribution,
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";

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
  showPreliminaryBadge?: boolean;
}

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];
const BGS_ORDER = ["BGS 9.5", "BGS 9", "BGS 8.5", "BGS 8 or lower"];
const SHARE_EXPORT_SCALE = 2;
const EXPORT_TARGET_WIDTH = 1920;
const EXPORT_TARGET_HEIGHT = 1080;
const EXPORT_MAX_SCALE = 6;
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
    "whitening", "wear", "ding", "damage", "fray", "scratch", "scuff",
    "print line", "crease", "chip", "rough", "off-center", "off center",
    "stain", "discolor", "dent", "nick",
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
  const positives = ["sharp", "clean", "pristine", "flawless", "intact", "no visible", "well-cut", "well cut"];
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

function buildPsaPopUrl(cardIdentity: {
  player_name?: string;
  year?: string;
  set_name?: string;
  parallel_type?: string;
}): string {
  const parts = [
    cardIdentity.player_name,
    cardIdentity.year,
    cardIdentity.set_name,
    cardIdentity.parallel_type,
  ].filter(Boolean) as string[];
  const q = parts.join(" ");
  return `https://www.psacard.com/pop/search?q=${encodeURIComponent(q)}`;
}

function buildBgsPopUrl(cardIdentity: {
  player_name?: string;
  year?: string;
  set_name?: string;
}): string {
  const parts = [
    cardIdentity.player_name,
    cardIdentity.year,
    cardIdentity.set_name,
  ].filter(Boolean) as string[];
  const q = parts.join(" ");
  return `https://www.beckett.com/search/#q=${encodeURIComponent(q)}&tab=population`;
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

// ── Probability bar ────────────────────────────────────────────────────────
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
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs ${isHighlighted ? "text-[#e2eaf3] font-medium" : "text-[#7a91a8]"}`}>
          {label}
        </span>
        <span className={`text-xs font-mono ${isHighlighted ? "text-[#e2eaf3]" : "text-[#3a5068]"}`}>
          {percent}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isHighlighted ? barColor : barColorDim}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ── Evidence block ─────────────────────────────────────────────────────────
function EvidenceBlock({
  icon,
  label,
  text,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  text: string | undefined;
  detail?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text && text.length > 80;
  const displayText = truncated && !expanded ? `${text!.slice(0, 80)}…` : text;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[#3a5068]">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3a5068]">
          {label}
        </span>
      </div>
      <p className="text-xs text-[#7a91a8] leading-relaxed">
        {displayText || <span className="text-[#3a5068] italic">No data</span>}
      </p>
      {detail ? (
        <p className="text-[10px] text-[#3a5068] mt-1 leading-snug">{detail}</p>
      ) : null}
      {truncated ? (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-1 text-[10px] text-[#3a5068] hover:text-[#7a91a8] transition-colors"
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
  showPreliminaryBadge,
}: GradeProbabilityPanelProps) {
  const [showBgsDistribution, setShowBgsDistribution] = useState(false);
  const [showAnalysisDetails, setShowAnalysisDetails] = useState(false);
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const confidence = estimate.grade_probabilities?.confidence;
  const confidencePillClass = confidence
    ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium)
    : null;

  const urls = (imageUrls?.filter(Boolean) ?? []).length >= 2
    ? imageUrls!.filter(Boolean).slice(0, 2)
    : primaryImageUrl?.trim()
      ? [primaryImageUrl.trim()]
      : [];
  const showStacked = urls.length >= 2;

  const handleExportImage = async () => {
    if (!panelRef.current || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const panel = panelRef.current;
      const rect = panel.getBoundingClientRect();
      const elementWidth = rect.width || panel.offsetWidth || panel.clientWidth || 1;
      const elementHeight = rect.height || panel.offsetHeight || panel.clientHeight || 1;
      const deviceScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const widthScale = EXPORT_TARGET_WIDTH / elementWidth;
      const heightScale = EXPORT_TARGET_HEIGHT / elementHeight;
      const baseScale = Math.max(1, widthScale, heightScale);
      const rawScale = Math.max(SHARE_EXPORT_SCALE, baseScale * deviceScale);
      const computedScale = Math.min(EXPORT_MAX_SCALE, Math.max(SHARE_EXPORT_SCALE, Math.ceil(rawScale)));

      await downloadGradeProbabilityImage(panel, "cardzcheck-grade-estimate", {
        scale: computedScale,
        includeAttribution: false,
        debug: process.env.NODE_ENV !== "production",
        minWidth: EXPORT_TARGET_WIDTH,
        minHeight: EXPORT_TARGET_HEIGHT,
        maxScale: EXPORT_MAX_SCALE,
        reportMeta: {
          cardLabel: cardLabel ?? undefined,
          generatedAt: new Date().toISOString(),
          confidenceLabel: confidence ?? undefined,
        },
      });
    } catch (error) {
      console.error("Failed to export grade probability image:", error);
      setExportError("Sorry, we couldn't export the image. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={panelRef} className="bg-[#07111d] border border-white/[0.06] rounded-xl overflow-hidden">

      {/* ── Analysis warning ──────────────────────────────────────── */}
      {warningMessage ? (
        <div className="px-5 pt-4">
          <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            {warningMessage}
          </div>
        </div>
      ) : null}

      {/* ── Primary result ─────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">

          {/* Card image */}
          {urls.length > 0 ? (
            <div className="shrink-0">
              <div className={`rounded-xl overflow-hidden ring-1 ring-white/[0.08] ${showStacked ? "flex flex-col gap-1.5 w-[100px]" : "w-[100px] h-[140px]"}`}>
                {showStacked ? (
                  urls.map((url, i) => (
                    <div key={url} className="w-full aspect-[3/4]">
                      <img
                        src={url}
                        alt={i === 0 ? "Card front" : "Card back"}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))
                ) : (
                  <img
                    src={urls[0]}
                    alt="Card analyzed"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>
          ) : null}

          {/* Result + identity */}
          <div className="flex-1 min-w-0">
            {/* Panel title */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#3a5068]">
                {gradingCopy.panel.title}
              </span>
              {showPreliminaryBadge ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Preliminary
                </span>
              ) : null}
              {cardLabel ? (
                <span className="text-xs text-[#7a91a8] truncate max-w-[280px]">{cardLabel}</span>
              ) : null}
            </div>

            {/* Most likely outcome — the "money moment" */}
            <div className="flex flex-wrap items-end gap-4 mb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3a5068] mb-1">
                  {gradingCopy.panel.mostLikelyLabel}
                </p>
                {psaTotal > 0 && likely ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold tracking-tight text-[#e2eaf3]">
                      {likely.label}
                    </span>
                    <span className="text-2xl font-semibold text-blue-400">
                      {formatPercent(likely.probability)}
                    </span>
                  </div>
                ) : (
                  <span className="text-4xl font-bold text-[#3a5068]">--</span>
                )}
              </div>
            </div>

            {/* Secondary metrics row */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#3a5068]">
                  {gradingCopy.panel.expectedValueLabel}
                </span>
                <span className="text-sm font-semibold text-[#7a91a8]">{evLabel}</span>
              </div>

              {confidence && confidencePillClass ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${confidencePillClass}`}>
                  {confidence} confidence
                </span>
              ) : null}

              {showPhotoQualityWarning ? (
                <span className="text-[10px] text-amber-400">
                  {gradingCopy.panel.confidenceReduced}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: distribution + evidence ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">

        {/* Distribution column */}
        <div className="px-5 py-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[#3a5068]">
                {gradingCopy.panel.distributionTitle} — PSA
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

          {/* BGS (collapsible) */}
          {bgsOutcomes ? (
            <div>
              <button
                type="button"
                onClick={() => setShowBgsDistribution((p) => !p)}
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3a5068] hover:text-[#7a91a8] transition-colors"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${showBgsDistribution ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
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

        {/* Evidence column */}
        <div className="px-5 py-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[#3a5068]">
              {gradingCopy.panel.evidenceTitle}
            </h4>
            <p className="text-[10px] text-[#3a5068] max-w-[180px] text-right leading-snug">
              {gradingCopy.panel.evidenceNote}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <EvidenceBlock
              icon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              }
              label={gradingCopy.panel.evidenceLabels.centering}
              text={estimate.centering}
              detail={
                centeringMeta
                  ? `L/R ${centeringMeta.left_right_ratio ?? "—"} · T/B ${centeringMeta.top_bottom_ratio ?? "—"}`
                  : undefined
              }
            />

            <EvidenceBlock
              icon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              }
              label={gradingCopy.panel.evidenceLabels.corners}
              text={estimate.corners}
            />

            <EvidenceBlock
              icon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              }
              label={gradingCopy.panel.evidenceLabels.surface}
              text={estimate.surface}
              detail={
                topSurfaceFindings.length > 0
                  ? topSurfaceFindings.map((f) =>
                      `${f.issue_type.replace(/_/g, " ")} · sev ${f.severity_0_3}/3`
                    ).join(" | ")
                  : undefined
              }
            />

            <EvidenceBlock
              icon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              }
              label={gradingCopy.panel.evidenceLabels.edges}
              text={estimate.edges}
            />
          </div>

          {estimate.grade_notes ? (
            <div className="mt-3 px-3 py-2 rounded-lg border border-white/[0.06] bg-[#07111d]">
              <p className="text-[11px] text-[#7a91a8] leading-relaxed">
                <span className="font-medium text-[#e2eaf3]">{gradingCopy.panel.notesLabel}:</span>{" "}
                {estimate.grade_notes}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Analysis details (collapsible) ─────────────────────────── */}
      <div className="border-t border-white/[0.06] px-5 py-4">
        <button
          type="button"
          onClick={() => setShowAnalysisDetails((p) => !p)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#3a5068] hover:text-[#7a91a8] transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showAnalysisDetails ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Image Quality &amp; Confidence Analysis
        </button>

        {showAnalysisDetails ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Image Quality */}
            <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#3a5068] mb-2">Image Quality</p>
              <p className="text-lg font-semibold text-[#e2eaf3]">
                {imageQuality?.overall_image_score ?? "—"}
                <span className="text-sm font-normal text-[#3a5068]">/100</span>
              </p>
              {imageQuality?.subscores ? (
                <div className="mt-2 space-y-0.5 text-xs text-[#7a91a8]">
                  <p>Focus: {imageQuality.subscores.focus_sharpness}/25</p>
                  <p>Glare control: {imageQuality.subscores.lighting_glare_control}/25</p>
                  <p>Coverage: {imageQuality.subscores.coverage_angles}/25</p>
                  <p>Resolution: {imageQuality.subscores.resolution_distance}/25</p>
                </div>
              ) : null}
              {(imageQuality?.retake_tips?.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-[#7a91a8] list-disc list-inside">
                  {imageQuality!.retake_tips.slice(0, 4).map((tip, idx) => (
                    <li key={`${tip}-${idx}`}>{tip}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Confidence */}
            <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#3a5068] mb-2">Model Confidence</p>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-semibold text-[#e2eaf3]">
                  {confidenceMeta?.overall_confidence_score ?? "—"}
                  <span className="text-sm font-normal text-[#3a5068]">/100</span>
                </p>
                {confidenceMeta?.confidence_label ? (
                  <span className="text-xs font-medium text-[#7a91a8] uppercase">
                    {confidenceMeta.confidence_label}
                  </span>
                ) : null}
              </div>
              {(confidenceMeta?.limiting_factors?.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-[#7a91a8] list-disc list-inside">
                  {confidenceMeta!.limiting_factors.slice(0, 4).map((factor, idx) => (
                    <li key={`${factor}-${idx}`}>{factor}</li>
                  ))}
                </ul>
              ) : null}
              {(confidenceMeta?.what_was_clear?.length ?? 0) > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-emerald-400/70 list-disc list-inside">
                  {confidenceMeta!.what_was_clear.slice(0, 4).map((fact, idx) => (
                    <li key={`${fact}-${idx}`}>{fact}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Centering detail */}
            {centeringMeta ? (
              <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#3a5068] mb-2">Centering Detail</p>
                <div className="space-y-0.5 text-xs text-[#7a91a8]">
                  <p>L/R: {centeringMeta.left_right_ratio ?? "—"}</p>
                  <p>T/B: {centeringMeta.top_bottom_ratio ?? "—"}</p>
                  <p>Score: {centeringMeta.centering_confidence_score ?? "—"}/100 · Severity: {centeringMeta.centering_severity_0_3 ?? "—"}/3</p>
                </div>
                {centeringMeta.centering_notes ? (
                  <p className="text-[10px] text-[#3a5068] mt-2 leading-snug">{centeringMeta.centering_notes}</p>
                ) : null}
              </div>
            ) : null}

            {/* Corner findings */}
            {(estimate.corners_findings?.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#3a5068] mb-2">Corner Findings</p>
                <ul className="space-y-1 text-xs text-[#7a91a8]">
                  {estimate.corners_findings!.slice(0, 3).map((finding, idx) => (
                    <li key={`corner-${idx}`}>
                      {finding.issue_type.replace(/_/g, " ")} · {finding.location} · sev {finding.severity_0_3}/3
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Edge findings */}
            {(estimate.edges_findings?.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-[#07111d] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#3a5068] mb-2">Edge Findings</p>
                <ul className="space-y-1 text-xs text-[#7a91a8]">
                  {estimate.edges_findings!.slice(0, 3).map((finding, idx) => (
                    <li key={`edge-${idx}`}>
                      {finding.issue_type.replace(/_/g, " ")} · {finding.location} · sev {finding.severity_0_3}/3
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="border-t border-white/[0.06] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] text-[#3a5068] leading-relaxed max-w-prose" data-export-disclaimer="true">
          {gradingCopy.panel.disclaimer}
        </p>

        <div className="flex flex-wrap items-center gap-3" data-export-ignore="true">
          {/* PSA Pop Report link */}
          {cardIdentity?.player_name ? (
            <a
              href={buildPsaPopUrl(cardIdentity)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#3a5068] hover:text-blue-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              PSA Pop
            </a>
          ) : null}

          {/* BGS Pop Report link */}
          {cardIdentity?.player_name ? (
            <a
              href={buildBgsPopUrl(cardIdentity)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#3a5068] hover:text-emerald-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              BGS Pop
            </a>
          ) : null}

          <button
            type="button"
            onClick={handleExportImage}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 text-xs text-[#3a5068] hover:text-[#7a91a8] transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Exporting…" : "Export report"}
          </button>
        </div>
      </div>

      {exportError ? (
        <div className="px-5 pb-4">
          <p className="text-xs text-rose-400">{exportError}</p>
        </div>
      ) : null}

      {/* Mobile-only thumbnail strip (when image available, small viewport) */}
      {urls.length > 0 ? (
        <div className="lg:hidden border-t border-white/[0.06] px-5 py-3 flex items-center gap-2" data-export-ignore="true">
          {urls.map((url, i) => (
            <div key={url} className={`${THUMBNAIL_SIZE_CLASS} rounded-md overflow-hidden ring-1 ring-white/[0.08] shrink-0`}>
              <img
                src={url}
                alt={i === 0 ? "Card front" : "Card back"}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
          {cardLabel ? (
            <p className="text-xs text-[#7a91a8] truncate">{cardLabel}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
