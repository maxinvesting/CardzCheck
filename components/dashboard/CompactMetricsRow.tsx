"use client";

import type { CollectionItem } from "@/types";
import { computeCollectionSummary } from "@/lib/values";

interface CompactMetricsRowProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CompactMetricsRow({ items, loading }: CompactMetricsRowProps) {
  const summary = computeCollectionSummary(items);

  // Debug logging
  if (items.length > 0 && !loading) {
    console.log('\n=== CompactMetricsRow Raw Data ===');
    console.log('Item count:', items.length);
    console.log('Summary:', summary);

    // Log first 3 items with all their fields
    items.slice(0, 3).forEach((item, idx) => {
      console.log(`\nItem ${idx} (${item.player_name}):`);
      console.log('  estimated_cmv:', (item as any).estimated_cmv, '| type:', typeof (item as any).estimated_cmv);
      console.log('  est_cmv:', (item as any).est_cmv, '| type:', typeof (item as any).est_cmv);
      console.log('  cmv:', (item as any).cmv, '| type:', typeof (item as any).cmv);
      console.log('  purchase_price:', item.purchase_price, '| type:', typeof item.purchase_price);
      console.log('  All fields:', Object.keys(item));
    });
    console.log('=== END CompactMetricsRow ===\n');
  }

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
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between gap-4 sm:gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="sm:min-w-[140px] sm:flex-1">
            <div className="h-3 w-20 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)] mb-2" />
            <div className="h-6 w-24 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-start sm:justify-between gap-4 sm:gap-6">
      {/* Collection Value */}
      <div className="sm:min-w-[140px] sm:flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Collection Value
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {totalValueLabel}
        </p>
        {summary.cardsWithCmv === 0 && summary.cardCount > 0 && (
          <p className="mt-1 text-[11px] text-[color:var(--biz-muted,#6b7280)]">
            Add comps to get values
          </p>
        )}
      </div>

      {/* Total Cards */}
      <div className="sm:min-w-[120px] sm:flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Cards
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {summary.cardCount}
        </p>
      </div>

      {/* Cost Basis */}
      <div className="sm:min-w-[140px] sm:flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Cost Basis
        </p>
        <p className="mt-1 text-2xl font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
          {formatCurrency(summary.totalCostBasis)}
        </p>
      </div>

      {/* Unrealized P/L */}
      <div className="sm:min-w-[160px] sm:flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--biz-muted,#6b7280)]">
          Unrealized P/L
        </p>
        {summary.totalUnrealizedPL !== null ? (
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              summary.totalUnrealizedPL >= 0
                ? "text-emerald-600"
                : "text-red-600"
            }`}
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
