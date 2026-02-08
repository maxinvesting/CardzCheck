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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 animate-pulse">
            <div className="h-3 bg-gray-800 rounded w-20 mb-2" />
            <div className="h-6 bg-gray-800 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Collection Value */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-1">Collection Value</p>
        <p className="text-xl font-bold text-white tabular-nums">
          {totalValueLabel}
        </p>
        {summary.cardsWithCmv === 0 && summary.cardCount > 0 && (
          <p className="text-[10px] text-gray-500 mt-1">
            Add comps to get values
          </p>
        )}
      </div>

      {/* Total Cards */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-1">Cards</p>
        <p className="text-xl font-bold text-white tabular-nums">
          {summary.cardCount}
        </p>
      </div>

      {/* Cost Basis */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-1">Cost Basis</p>
        <p className="text-xl font-bold text-white tabular-nums">
          {formatCurrency(summary.totalCostBasis)}
        </p>
      </div>

      {/* Unrealized P/L */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-1">Unrealized P/L</p>
        {summary.totalUnrealizedPL !== null ? (
          <p className={`text-xl font-bold tabular-nums ${
            summary.totalUnrealizedPL >= 0 ? "text-green-400" : "text-red-400"
          }`}>
            {summary.totalUnrealizedPL >= 0 ? "+" : ""}
            {formatCurrency(summary.totalUnrealizedPL)}
          </p>
        ) : (
          <p className="text-xl font-bold text-gray-500">—</p>
        )}
      </div>
    </div>
  );
}
