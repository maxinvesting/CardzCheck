"use client";

import type { CollectionItem } from "@/types";
import { computeCollectionSummary } from "@/lib/values";

interface CompactMetricsRowProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CompactMetricsRow({ items, loading }: CompactMetricsRowProps) {
  const summary = computeCollectionSummary(items);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const totalValueLabel =
    summary.totalDisplayValue === null
      ? "—"
      : formatCurrency(summary.totalDisplayValue);

  if (loading) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[140px] flex-1">
            <div className="h-3 w-20 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)] mb-2" />
            <div className="h-6 w-24 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      {/* Collection Value */}
      <div className="min-w-[140px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Collection Value
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {totalValueLabel}
        </p>
        {summary.cardsWithCmv === 0 && summary.cardCount > 0 && (
          <p className="mt-1 text-[11px] text-[color:var(--biz-muted,#6b7280)]">
            Run a search to get values
          </p>
        )}
      </div>

      {/* Total Cards */}
      <div className="min-w-[120px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Cards
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {summary.cardCount}
        </p>
      </div>

      {/* Cost Basis */}
      <div className="min-w-[140px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Cost Basis
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {formatCurrency(summary.totalCostBasis)}
        </p>
      </div>

      {/* Unrealized P/L */}
      <div className="min-w-[160px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Unrealized P/L
        </p>
        {summary.totalUnrealizedPL !== null ? (
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{
              color:
                summary.totalUnrealizedPL >= 0
                  ? "var(--biz-profit)"
                  : "var(--biz-danger)",
            }}
          >
            {summary.totalUnrealizedPL >= 0 ? "+" : ""}
            {formatCurrency(summary.totalUnrealizedPL)}
          </p>
        ) : (
          <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-muted,#9ca3af)]">
            —
          </p>
        )}
      </div>
    </div>
  );
}
