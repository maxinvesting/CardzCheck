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
          <h2 className="text-sm font-semibold text-[var(--biz-text)]">Today&apos;s Actions</h2>
          <p className="mt-0.5 text-xs text-[var(--biz-muted)]">
            Actionable signals from your inventory data
          </p>
        </div>
        <span className="rounded border border-[var(--biz-border)] bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] tracking-wide">
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
            className="rounded-lg bg-[#F9FAFB] px-3 py-2.5"
          >
            <p className="mb-1 text-[10px] uppercase tracking-normal text-[var(--biz-muted)]">{label}</p>
            <p className="text-[var(--biz-text)]">{value}</p>
            <p className="mt-0.5 text-[10px] text-[var(--biz-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Link
          href="/business/insights"
          className="inline-flex min-h-[44px] items-center px-1 text-xs font-medium text-[var(--biz-primary)] transition-colors hover:underline"
        >
          View insights →
        </Link>
      </div>
    </Surface>
  );
}
