"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { BusinessInventoryItem } from "@/types";
import { generateBusinessAnalystInsights } from "@/lib/business/analyst-insights";

interface Props {
  items: BusinessInventoryItem[];
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export default function BusinessAnalystPreviewCard({ items }: Props) {
  const insights = useMemo(() => generateBusinessAnalystInsights(items), [items]);

  const riskSummary =
    insights.summary.riskSignalCount > 0
      ? `${insights.summary.riskSignalCount} risk ${pluralize(insights.summary.riskSignalCount, "signal")} detected`
      : "No immediate risk signals detected";

  return (
    <section className="mb-3 rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">AI Business Analyst</h2>
          <p className="mt-0.5 text-xs text-gray-400">High-level inventory intelligence signals</p>
        </div>
        <span className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
          AI
        </span>
      </div>

      <div className="mt-2 grid gap-1.5 text-xs sm:grid-cols-3">
        <div className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5 text-gray-200">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Unlisted</span>
          <p className="mt-0.5">
            {insights.summary.unlistedActiveCount} active{" "}
            {pluralize(insights.summary.unlistedActiveCount, "item")}
          </p>
        </div>
        <div className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5 text-gray-200">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Risk</span>
          <p className="mt-0.5">{riskSummary}</p>
        </div>
        <div className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5 text-gray-200">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">CMV Coverage</span>
          <p className="mt-0.5">{insights.coverage.cmvCoveragePct}% of active inventory</p>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <Link
          href="/business/analyst"
          className="text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300"
        >
          View Full Analysis →
        </Link>
      </div>
    </section>
  );
}
