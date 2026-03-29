"use client";

import { useEffect, useState } from "react";
import type { ShopListingGradeAnalysis as GradeAnalysis } from "@/types/shop";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-rose-600",
};

const PROB_LABELS: Record<string, { bar: string; text: string }> = {
  "PSA 10": { bar: "bg-emerald-500", text: "text-emerald-700" },
  "PSA 9": { bar: "bg-cyan-500", text: "text-cyan-700" },
  "PSA 8": { bar: "bg-amber-400", text: "text-amber-700" },
  "PSA 7 or lower": { bar: "bg-slate-400", text: "text-slate-600" },
};

function ProbBar({ label, probability }: { label: string; probability: number }) {
  const pct = Math.round(probability * 100);
  const colors = PROB_LABELS[label] ?? { bar: "bg-slate-400", text: "text-slate-600" };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className={colors.text}>{label}</span>
        <span className={colors.text}>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className="text-xs text-slate-700">{value}</span>
    </div>
  );
}

interface Props {
  listingId: string;
}

export default function ShopListingGradeAnalysis({ listingId }: Props) {
  const [analysis, setAnalysis] = useState<GradeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/shop/listings/${listingId}/grade-analysis`);
        if (!res.ok) throw new Error("failed");
        const json = await res.json();
        if (!cancelled) setAnalysis(json.analysis ?? null);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (error || (!loading && !analysis)) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <svg
          className="h-4 w-4 shrink-0 text-cyan-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
          AI Grade Analysis
        </span>
        <span className="ml-auto text-[11px] text-slate-400">Raw card · PSA estimate</span>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-8 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      ) : analysis ? (
        <div className="space-y-5 p-5">
          {/* Grade range + confidence */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Est. Grade</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                {analysis.estimated_grade_low === analysis.estimated_grade_high
                  ? analysis.estimated_grade_low
                  : `${analysis.estimated_grade_low}–${analysis.estimated_grade_high}`}
              </p>
            </div>
            <div>
              <p
                className={`text-sm font-semibold capitalize ${CONFIDENCE_COLOR[analysis.confidence.confidence_label] ?? "text-slate-600"}`}
              >
                {analysis.confidence.confidence_label} confidence
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{analysis.grade_notes}</p>
            </div>
          </div>

          {/* Probability bars */}
          {analysis.probabilities.length > 0 && (
            <div className="space-y-2.5">
              {analysis.probabilities.map((p) => (
                <ProbBar key={p.label} label={p.label} probability={p.probability} />
              ))}
            </div>
          )}

          {/* Centering / surface / corners / edges */}
          <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Breakdown
            </p>
            {analysis.centering.left_right_ratio && (
              <DetailRow
                label="Centering"
                value={`L/R ${analysis.centering.left_right_ratio} · T/B ${analysis.centering.top_bottom_ratio}`}
              />
            )}
            {analysis.surface && <DetailRow label="Surface" value={analysis.surface} />}
            {analysis.corners && <DetailRow label="Corners" value={analysis.corners} />}
            {analysis.edges && <DetailRow label="Edges" value={analysis.edges} />}
            {analysis.centering.centering_notes && (
              <DetailRow label="Notes" value={analysis.centering.centering_notes} />
            )}
          </div>

          {/* Limiting factors */}
          {analysis.confidence.limiting_factors.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Confidence factors
              </p>
              <ul className="space-y-0.5">
                {analysis.confidence.limiting_factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="mt-0.5 text-amber-500">·</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Analyzed image */}
          {analysis.analyzed_image_url && (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <img
                src={analysis.analyzed_image_url}
                alt="Analyzed card front"
                className="w-full object-contain"
              />
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Powered by CardzCheck AI · For reference only · Not a guarantee of PSA grade
          </p>
        </div>
      ) : null}
    </div>
  );
}
