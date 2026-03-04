"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { BusinessInventoryItem } from "@/types";
import { generateBusinessAnalystInsights } from "@/lib/business/analyst-insights";
import { Surface } from "@/components/ui/Surface";

interface Props {
  items: BusinessInventoryItem[];
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export default function BusinessAnalystPreviewCard({ items }: Props) {
  const insights = useMemo(() => generateBusinessAnalystInsights(items), [items]);

  const actionSummary =
    insights.summary.actionCount > 0
      ? `${insights.summary.actionCount} ${pluralize(insights.summary.actionCount, "action")} to review`
      : "No actions right now";

  return (
    <Surface className="mb-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Today&apos;s Actions</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Actionable signals from your inventory data
          </p>
        </div>
        <span className="rounded border border-emerald-700/40 bg-emerald-900/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 tracking-wide">
          AI
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {[
          {
            label: "Actions",
            value: actionSummary,
            sub: "List, reprice, and market signals",
          },
          {
            label: "Unlisted",
            value: `${insights.summary.unlistedActiveCount} active ${pluralize(insights.summary.unlistedActiveCount, "item")}`,
            sub: "Items not currently listed",
          },
          {
            label: "Est. MV Coverage",
            value: `${insights.coverage.cmvCoveragePct}% of active inventory`,
            sub: "Share of inventory with comps (Beta)",
          },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            style={{ border: "1px solid var(--biz-border)" }}
            className="rounded-lg bg-white/[0.03] px-3 py-2.5"
          >
            <p className="text-[10px] text-slate-500 mb-1">{label}</p>
            <p className="text-slate-200">{value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href="/business/insights"
          className="inline-flex items-center text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300 min-h-[44px] px-1"
        >
          View insights →
        </Link>
      </div>
    </Surface>
  );
}
