"use client";

import { gradingCopy } from "@/copy/grading";
import type { GradeCmv, WorthGradingResult } from "@/types";

interface GradeEstimatorValuePanelProps {
  result: WorthGradingResult;
  loading?: boolean;
  flat?: boolean;
}

function formatPrice(cmv: GradeCmv): string {
  if (cmv.price === null) return gradingCopy.valuePanel.insufficientComps;
  return `$${cmv.price.toFixed(0)}`;
}

type RoiLevel = "High" | "Medium" | "Low";

function roiLevel(rating: WorthGradingResult["rating"]): RoiLevel {
  switch (rating) {
    case "strong_yes":
      return "High";
    case "yes":
      return "Medium";
    case "maybe":
    default:
      return "Low";
  }
}

function roiBadge(level: RoiLevel, flat = false): string {
  if (flat) {
    switch (level) {
      case "High":
        return "bg-emerald-500/10 text-emerald-200 border-emerald-500/30";
      case "Medium":
        return "bg-amber-500/10 text-amber-200 border-amber-500/30";
      default:
        return "bg-white/[0.04] text-white/55 border-white/10";
    }
  }

  switch (level) {
    case "High":
      return "bg-green-50 text-green-700 border-green-200";
    case "Medium":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-[color:var(--biz-surface-soft)] text-[var(--biz-muted)] border-[var(--biz-border)]";
  }
}

function formatRoi(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export default function GradeEstimatorValuePanel({
  result,
  loading,
  flat = false,
}: GradeEstimatorValuePanelProps) {
  const roi = roiLevel(result.rating);

  if (loading) {
    return (
      <div className={`${flat ? "border-t border-white/8 pt-5" : "cc-surface rounded-xl p-5"} animate-pulse`}>
        <div className="mb-3 h-4 w-32 rounded bg-[color:var(--biz-skeleton)]" />
        <div className="mb-2 h-6 w-48 rounded bg-[color:var(--biz-skeleton)]" />
        <div className="h-24 w-full rounded bg-[color:var(--biz-skeleton)]" />
      </div>
    );
  }

  return (
    <div className={flat ? "border-t border-white/8 pt-5" : "cc-surface rounded-xl p-5"}>
      <div className={`mb-4 flex items-center justify-between ${flat ? "border-b border-white/8 pb-4" : ""}`}>
        <h3 className={`text-sm font-semibold uppercase tracking-normal ${flat ? "text-white/45" : "text-[var(--biz-muted)]"}`}>
          {gradingCopy.valuePanel.title}
        </h3>
        <div className="flex items-center gap-2">
          {result.bestOption !== "none" && (
            <span className={`text-xs ${flat ? "text-white/42" : "text-[var(--biz-muted)]"}`}>
              {gradingCopy.valuePanel.bestLabel}: {result.bestOption.toUpperCase()}
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${roiBadge(roi, flat)}`}
          >
            {gradingCopy.valuePanel.roiBadge(roi)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className={flat ? "border-t border-white/8 pt-3" : "rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] p-3"}>
          <p className={`mb-2 font-medium ${flat ? "text-white/42" : "text-[var(--biz-muted)]"}`}>{gradingCopy.valuePanel.rawTitle}</p>
          <p className={`text-lg font-semibold ${flat ? "text-white" : "text-[var(--biz-text)]"}`}>{formatPrice(result.raw)}</p>
          <p className={`mt-1 text-xs ${flat ? "text-white/38" : "text-[var(--biz-muted)]"}`}>{result.raw.n} {gradingCopy.valuePanel.compsSuffix}</p>
        </div>

        <div className={flat ? "border-t border-white/8 pt-3" : "rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] p-3"}>
          <p className={`mb-2 font-medium ${flat ? "text-white/42" : "text-[var(--biz-muted)]"}`}>{gradingCopy.valuePanel.psaTitle}</p>
          <ul className={`space-y-1 ${flat ? "text-white" : "text-[var(--biz-text)]"}`}>
            <li>PSA 10: {formatPrice(result.psa["10"])}</li>
            <li>PSA 9: {formatPrice(result.psa["9"])}</li>
            <li>PSA 8: {formatPrice(result.psa["8"])}</li>
          </ul>
          <p className={`mt-2 text-xs ${flat ? "text-white/38" : "text-[var(--biz-muted)]"}`}>
            {gradingCopy.valuePanel.evLabel} ${result.psa.ev.toFixed(0)} · {gradingCopy.valuePanel.netLabel} ${result.psa.netGain.toFixed(0)} · {gradingCopy.valuePanel.roiLabel}{" "}
            {formatRoi(result.psa.roi)}
          </p>
        </div>

        <div className={flat ? "border-t border-white/8 pt-3" : "rounded-lg border border-[var(--biz-border)] bg-[color:var(--biz-surface-soft)] p-3"}>
          <p className={`mb-2 font-medium ${flat ? "text-white/42" : "text-[var(--biz-muted)]"}`}>{gradingCopy.valuePanel.bgsTitle}</p>
          <ul className={`space-y-1 ${flat ? "text-white" : "text-[var(--biz-text)]"}`}>
            <li>BGS 9.5: {formatPrice(result.bgs["9.5"])}</li>
            <li>BGS 9: {formatPrice(result.bgs["9"])}</li>
            <li>BGS 8.5: {formatPrice(result.bgs["8.5"])}</li>
          </ul>
          <p className={`mt-2 text-xs ${flat ? "text-white/38" : "text-[var(--biz-muted)]"}`}>
            {gradingCopy.valuePanel.evLabel} ${result.bgs.ev.toFixed(0)} · {gradingCopy.valuePanel.netLabel} ${result.bgs.netGain.toFixed(0)} · {gradingCopy.valuePanel.roiLabel}{" "}
            {formatRoi(result.bgs.roi)}
          </p>
        </div>
      </div>

      <div className={flat ? "mt-5 border-l border-[#b89a55]/40 pl-4" : "mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3"}>
        <p className={`text-sm ${flat ? "text-white/68" : "text-blue-700"}`}>{result.explanation}</p>
      </div>

      <p className={`mt-3 text-xs ${flat ? "text-white/34" : "text-[var(--biz-muted)]"}`}>
        {gradingCopy.valuePanel.confidenceNote}
      </p>
    </div>
  );
}
