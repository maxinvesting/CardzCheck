"use client";

import type { BusinessMetrics as Metrics } from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

interface Props {
  metrics: Metrics | null;
  loading: boolean;
  /** Filter-aware inventory value; when provided, shows Inventory Value card */
  inventorySummary?: InventoryValueSummary | null;
  /** Total item count (all items) for "X of Y" when filtered */
  totalItemCount?: number;
  /** Compact/dense layout (Business mode) */
  compact?: boolean;
}

const KPI_CARD_STYLE: React.CSSProperties = {
  background: "var(--biz-surface)",
  border: "1px solid var(--biz-border)",
  borderRadius: "10px",
};

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
  compact = false,
}: Props) {
  const cards = [
    {
      label: "Revenue MTD",
      value: metrics ? fmt(metrics.revenueMtd) : "—",
      valueClass: "text-white",
    },
    {
      label: "Revenue YTD",
      value: metrics ? fmt(metrics.revenueYtd) : "—",
      valueClass: "text-white",
    },
    {
      label: "Profit MTD",
      value: metrics ? fmt(metrics.profitMtd) : "—",
      valueClass: metrics && metrics.profitMtd >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Profit YTD",
      value: metrics ? fmt(metrics.profitYtd) : "—",
      valueClass: metrics && metrics.profitYtd >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Sales MTD",
      value: metrics ? String(metrics.salesCountMtd) : "—",
      valueClass: "text-white",
    },
    {
      label: "Sales YTD",
      value: metrics ? String(metrics.salesCountYtd) : "—",
      valueClass: "text-white",
    },
    {
      label: "Active Inventory",
      value: metrics ? String(metrics.activeInventoryCount) : "—",
      valueClass: "text-white",
    },
  ];

  const inventoryValueCard = inventorySummary ? (
    <div style={KPI_CARD_STYLE} className={compact ? "p-2.5" : "p-3"}>
      <p className="text-[10px] text-slate-500 mb-1 leading-none">
        Inventory Value
        {totalItemCount != null &&
          inventorySummary.itemCount !== totalItemCount && (
            <span className="ml-1 text-slate-600">(filtered)</span>
          )}
      </p>
      {loading ? (
        <div className="h-5 w-20 bg-white/5 rounded animate-pulse" />
      ) : (
        <>
          <p className="text-base font-semibold tabular-nums text-emerald-400 tracking-tight">
            {inventorySummary.itemCount === 0
              ? fmt(0)
              : inventorySummary.itemsWithCmv > 0
              ? fmt(inventorySummary.totalCmvCents)
              : fmt(inventorySummary.totalCostCents)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
            {inventorySummary.itemsWithCmv > 0
              ? `Est. Market Value · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`
              : `Cost basis · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`}
          </p>
          {inventorySummary.itemsWithCmv > 0 &&
            inventorySummary.itemsWithCmv < inventorySummary.itemCount && (
              <p className="text-[10px] text-slate-500">
                Cost: {fmt(inventorySummary.totalCostCents)}
              </p>
            )}
        </>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 ${
        compact ? "gap-2 mb-2" : "gap-2.5 mb-3"
      }`}
    >
      {cards.map((c) => (
        <div key={c.label} style={KPI_CARD_STYLE} className={compact ? "p-2.5" : "p-3"}>
          <p className="text-[10px] text-slate-500 mb-1 leading-none">{c.label}</p>
          {loading ? (
            <div className="h-5 w-20 bg-white/5 rounded animate-pulse" />
          ) : (
            <p className={`text-base font-semibold tabular-nums tracking-tight ${c.valueClass}`}>
              {c.value}
            </p>
          )}
        </div>
      ))}
      {inventoryValueCard}
    </div>
  );
}
