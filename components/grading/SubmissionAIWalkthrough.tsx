"use client";

import { useState } from "react";
import type { SubmissionAIWalkthroughState } from "@/lib/grading/submissions/types";

interface Props {
  state: SubmissionAIWalkthroughState;
}

const VERDICT_CONFIG = {
  SUBMIT: {
    label: "Submit",
    bg: "bg-emerald-950/60",
    border: "border-emerald-700/40",
    badgeBg: "bg-emerald-900/80",
    badgeBorder: "border-emerald-600/50",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  BORDERLINE: {
    label: "Borderline",
    bg: "bg-amber-950/50",
    border: "border-amber-700/40",
    badgeBg: "bg-amber-900/80",
    badgeBorder: "border-amber-600/50",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  SKIP: {
    label: "Skip — Sell Raw",
    bg: "bg-rose-950/40",
    border: "border-rose-800/40",
    badgeBg: "bg-rose-900/80",
    badgeBorder: "border-rose-700/50",
    text: "text-rose-300",
    dot: "bg-rose-400",
  },
} as const;

export default function SubmissionAIWalkthrough({ state }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <div className="mx-0.5 mb-2 rounded-lg border border-gray-700/60 bg-gray-900/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[11px] text-gray-400">Running AI grading analysis…</span>
          <div className="flex gap-1 ml-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-1 w-1 rounded-full bg-gray-600 animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-0.5 mb-2 rounded-lg border border-amber-800/30 bg-amber-950/20 px-4 py-2">
        <span className="text-[11px] text-amber-400/80">
          AI analysis unavailable — {state.message}
        </span>
      </div>
    );
  }

  const { data } = state;
  const config = VERDICT_CONFIG[data.verdict] ?? VERDICT_CONFIG.BORDERLINE;

  const fmtProfit = (n: number) => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}$${Math.abs(n).toFixed(0)}`;
  };

  return (
    <div
      className={`mx-0.5 mb-2 rounded-lg border ${config.border} ${config.bg} overflow-hidden`}
    >
      {/* ── Header row (always visible) ─────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* AI badge */}
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            AI
          </span>

          {/* Verdict badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border ${config.badgeBorder} ${config.badgeBg} px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.text}`}
          >
            <span className={`h-1 w-1 rounded-full ${config.dot}`} />
            {config.label}
          </span>

          {/* Summary */}
          <span className="text-[11px] text-gray-300 leading-tight">
            {data.summary}
          </span>
        </div>

        {/* Key numbers + toggle */}
        <div className="flex items-center gap-4 shrink-0 ml-4">
          <span className="text-[11px] text-gray-500">
            PSA 9:{" "}
            <span
              className={
                data.keyNumbers.profitPsa9 >= 0
                  ? "text-emerald-400 font-medium"
                  : "text-rose-400 font-medium"
              }
            >
              {fmtProfit(data.keyNumbers.profitPsa9)}
            </span>
          </span>
          <span className="text-[11px] text-gray-500">
            PSA 10:{" "}
            <span
              className={
                data.keyNumbers.profitPsa10 >= 0
                  ? "text-emerald-400 font-medium"
                  : "text-rose-400 font-medium"
              }
            >
              {fmtProfit(data.keyNumbers.profitPsa10)}
            </span>
          </span>
          <span className="text-[11px] text-gray-500">
            Break-even:{" "}
            <span className="text-white font-medium">
              {data.keyNumbers.breakEvenGrade}
            </span>
          </span>
          <span className="text-gray-600 text-xs ml-1">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* ── Expanded: Pros / Cons ────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-3 pt-0.5 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/[0.04]">
          {/* Pros */}
          <div className="space-y-1.5 pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500/70 mb-1">
              For submitting
            </p>
            {data.pros.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic">No strong case for submission.</p>
            ) : (
              data.pros.map((pro, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] text-gray-300 leading-snug"
                >
                  <span className="mt-0.5 shrink-0 text-emerald-400 font-bold">✓</span>
                  <span>{pro}</span>
                </div>
              ))
            )}
          </div>

          {/* Cons */}
          <div className="space-y-1.5 pt-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-500/70 mb-1">
              Against submitting
            </p>
            {data.cons.length === 0 ? (
              <p className="text-[11px] text-gray-500 italic">No significant downsides identified.</p>
            ) : (
              data.cons.map((con, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 text-[11px] text-gray-300 leading-snug"
                >
                  <span className="mt-0.5 shrink-0 text-rose-400 font-bold">✗</span>
                  <span>{con}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
