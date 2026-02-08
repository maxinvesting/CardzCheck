"use client";

import { useRef, useState } from "react";
import type { GradeEstimate } from "@/types";
import { gradingCopy } from "@/copy/grading";
import { downloadGradeProbabilityImage } from "@/lib/grading/exportGradeProbabilityImage";
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
  showPreliminaryBadge?: boolean;
}

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];
const BGS_ORDER = ["BGS 9.5", "BGS 9", "BGS 8.5", "BGS 8 or lower"];
const SHARE_EXPORT_SCALE = 2;
const EXPORT_TARGET_WIDTH = 1920;
const EXPORT_TARGET_HEIGHT = 1080;
const EXPORT_MAX_SCALE = 6;
const THUMBNAIL_WIDTH_CLASS = "w-14";
const THUMBNAIL_HEIGHT_CLASS = "h-20";

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

function ProbabilityBar({
  label,
  probability,
  colorClass,
}: {
  label: string;
  probability: number;
  colorClass: string;
}) {
  const percent = Math.round(probability * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#0f1a2b]">
        <div
          className={`h-2 rounded-full ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
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

  if (cardIdentity.player_name) {
    parts.push(cardIdentity.player_name);
  }

  if (cardIdentity.year) {
    parts.push(cardIdentity.year);
  }

  if (cardIdentity.set_name) {
    let setLabel = cardIdentity.set_name;
    if (cardIdentity.parallel_type) {
      setLabel = `${setLabel} (${cardIdentity.parallel_type})`;
    }
    parts.push(setLabel);
  } else if (cardIdentity.parallel_type) {
    parts.push(cardIdentity.parallel_type);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

export default function GradeProbabilityPanel({
  estimate,
  cardIdentity,
  primaryImageUrl,
  showPreliminaryBadge,
}: GradeProbabilityPanelProps) {
  const allowPsa10Override =
    estimate.grade_probabilities?.confidence === "high" &&
    meetsTopTierEvidence(estimate);
  const psaOutcomes = getPsaOutcomes(estimate, { allowPsa10Override });
  const bgsOutcomes = getBgsOutcomes(estimate);
  const psaTotal = psaOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const likely = mostLikely(psaOutcomes);
  const ev = expectedValue(psaOutcomes);
  const showPhotoQualityWarning = hasPhotoQualityFlag(estimate.grade_notes);
  const evLabel = psaTotal > 0 ? ev.toFixed(1) : "--";
  const warningMessage = estimate.analysis_warning_code
    ? gradingCopy.panel.warnings[estimate.analysis_warning_code]
    : undefined;
  const cardLabel = buildCardIdentityLabel(cardIdentity);
  const panelRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const thumbnailUrl = primaryImageUrl?.trim();

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
      });
    } catch (error) {
      console.error("Failed to export grade probability image:", error);
      setExportError("Sorry, we couldn't export the image. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={panelRef} className="bg-[#0f1a2b] border border-gray-600/60 rounded-xl p-5">
      {warningMessage ? (
        <div className="mb-4 rounded-lg border border-gray-600/50 bg-[#0f1a2b] px-3 py-2 text-xs text-amber-200">
          {warningMessage}
        </div>
      ) : null}

      {/* ── 3-column layout: left boxes | center card identity | right boxes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-5 mb-5">
        {/* Left column: probability – starts at top */}
        <div className="space-y-3">
          <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-0.5">
              {gradingCopy.panel.mostLikelyLabel}
            </p>
            <p className="text-white text-base font-semibold">
              {psaTotal > 0 && likely
                ? `${likely.label} (${formatPercent(likely.probability)})`
                : "--"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {gradingCopy.panel.expectedValueLabel}: {evLabel}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {gradingCopy.panel.expectedValueHelp}
            </p>
          </div>

          <div>
            <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">
              {gradingCopy.panel.distributionTitle}
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <p className="text-gray-400 font-medium text-xs mb-2">
                  {gradingCopy.panel.psaTitle}
                </p>
                <div className="space-y-2">
                  {psaOutcomes.map((outcome) => (
                    <ProbabilityBar
                      key={outcome.label}
                      label={outcome.label}
                      probability={outcome.probability}
                      colorClass="bg-blue-500"
                    />
                  ))}
                </div>
              </div>
              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <p className="text-gray-400 font-medium text-xs mb-2">
                  {gradingCopy.panel.bgsTitle}
                </p>
                {bgsOutcomes ? (
                  <div className="space-y-2">
                    {BGS_ORDER.map((label) => {
                      const outcome = bgsOutcomes.find((item) => item.label === label);
                      return (
                        <ProbabilityBar
                          key={label}
                          label={label}
                          probability={outcome?.probability ?? 0}
                          colorClass="bg-emerald-500"
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">{gradingCopy.panel.bgsUnavailable}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center column: card identity strip */}
        <div className="hidden lg:flex flex-col items-center justify-start pt-1 px-5">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 whitespace-nowrap">
            {gradingCopy.panel.title}
            {showPreliminaryBadge ? (
              <span className="ml-2 text-amber-300">Preliminary</span>
            ) : null}
          </h3>
          {thumbnailUrl ? (
            <div className="w-[170px] h-[260px] rounded-xl border border-gray-600/60 overflow-hidden shrink-0">
              <img
                src={thumbnailUrl}
                alt="Uploaded card analyzed"
                className="h-full w-full object-cover object-center"
              />
            </div>
          ) : null}
          {cardLabel ? (
            <p className="text-sm font-semibold text-gray-200 text-center mt-2 max-w-[200px] leading-snug">
              {cardLabel}
            </p>
          ) : null}
          <p className="text-xs text-gray-500 mt-1 text-center max-w-[200px]">
            Analysis based on uploaded photos
          </p>
        </div>

        {/* Mobile-only centered header (hidden on lg) */}
        <div className="lg:hidden flex flex-col items-center text-center mb-2">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            {gradingCopy.panel.title}
            {showPreliminaryBadge ? (
              <span className="ml-2 text-xs text-amber-300">Preliminary</span>
            ) : null}
          </h3>
          {(cardLabel || thumbnailUrl) ? (
            <div className="flex items-center gap-3 mt-2">
              {thumbnailUrl ? (
                <div className={`${THUMBNAIL_HEIGHT_CLASS} ${THUMBNAIL_WIDTH_CLASS} rounded-lg border border-gray-600/60 overflow-hidden shrink-0`}>
                  <img
                    src={thumbnailUrl}
                    alt="Uploaded card analyzed"
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              ) : null}
              {cardLabel ? (
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-200">{cardLabel}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Analysis based on uploaded photos</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Right column: evidence – starts at top */}
        <div className="min-w-0 space-y-3">
          <div>
            <div className="mb-3">
              <h4 className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                {gradingCopy.panel.evidenceTitle}
              </h4>
              <p className="text-[11px] text-gray-500 mt-1">
                {gradingCopy.panel.evidenceNote}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3.5 text-sm">
              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                  <span className="text-gray-500 font-medium text-xs">
                    {gradingCopy.panel.evidenceLabels.centering}
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-snug">{estimate.centering}</p>
              </div>

              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  <span className="text-gray-500 font-medium text-xs">
                    {gradingCopy.panel.evidenceLabels.corners}
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-snug">{estimate.corners}</p>
              </div>

              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                  <span className="text-gray-500 font-medium text-xs">
                    {gradingCopy.panel.evidenceLabels.surface}
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-snug">{estimate.surface}</p>
              </div>

              <div className="bg-[#0f1a2b] border border-gray-600/40 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                    />
                  </svg>
                  <span className="text-gray-500 font-medium text-xs">
                    {gradingCopy.panel.evidenceLabels.edges}
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-snug">{estimate.edges}</p>
              </div>
            </div>
          </div>

          {estimate.grade_notes ? (
            <div className="p-3 bg-[#0f1a2b] border border-gray-600/50 rounded-lg">
              <p className="text-xs text-blue-300 leading-snug">
                <span className="font-medium">{gradingCopy.panel.notesLabel}:</span>{" "}
                {estimate.grade_notes}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t border-gray-600/50 pt-3">
        <p data-export-disclaimer="true">{gradingCopy.panel.disclaimer}</p>
        {showPhotoQualityWarning ? (
          <p className="mt-1 text-amber-300">{gradingCopy.panel.confidenceReduced}</p>
        ) : null}
        {/* Export mirrors the live panel layout for sharing. */}
        <p className="mt-2" data-export-ignore="true">
          <button
            type="button"
            onClick={handleExportImage}
            disabled={exporting}
            className="text-gray-400 hover:text-gray-300 underline focus:outline-none focus:ring-0 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export image"}
          </button>
        </p>
        {exportError ? (
          <p className="mt-2 text-rose-300">{exportError}</p>
        ) : null}
      </div>
    </div>
  );
}
