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
  borderRadius: "12px",
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
      valueClass: "text-[var(--biz-text)]",
    },
    {
      label: "Revenue YTD",
      value: metrics ? fmt(metrics.revenueYtd) : "—",
      valueClass: "text-[var(--biz-text)]",
    },
    {
      label: "Profit MTD",
      value: metrics ? fmt(metrics.profitMtd) : "—",
      valueClass: metrics && metrics.profitMtd >= 0 ? "text-emerald-700" : "text-red-600",
    },
    {
      label: "Profit YTD",
      value: metrics ? fmt(metrics.profitYtd) : "—",
      valueClass: metrics && metrics.profitYtd >= 0 ? "text-emerald-700" : "text-red-600",
    },
    {
      label: "Sales MTD",
      value: metrics ? String(metrics.salesCountMtd) : "—",
      valueClass: "text-[var(--biz-text)]",
    },
    {
      label: "Sales YTD",
      value: metrics ? String(metrics.salesCountYtd) : "—",
      valueClass: "text-[var(--biz-text)]",
    },
    {
      label: "Active Inventory",
      value: metrics ? String(metrics.activeInventoryCount) : "—",
      valueClass: "text-[var(--biz-text)]",
    },
  ];

  const inventoryValueCard = inventorySummary ? (
    <div style={KPI_CARD_STYLE} className={compact ? "p-4" : "p-5"}>
      <p className="mb-2 text-xs uppercase tracking-normal text-[var(--biz-muted)] leading-none">
        Inventory Value
        {totalItemCount != null &&
          inventorySummary.itemCount !== totalItemCount && (
            <span className="ml-1 text-[var(--biz-muted)]">(filtered)</span>
          )}
      </p>
      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums text-[var(--biz-text)]">
            {inventorySummary.itemCount === 0
              ? fmt(0)
              : inventorySummary.itemsWithCmv > 0
              ? fmt(inventorySummary.totalCmvCents)
              : fmt(inventorySummary.totalCostCents)}
          </p>
          <p className="mt-1 text-xs text-[var(--biz-muted)] leading-tight">
            {inventorySummary.itemsWithCmv > 0
              ? `Est. Market Value · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`
              : `Cost basis · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`}
          </p>
          {inventorySummary.itemsWithCmv > 0 &&
            inventorySummary.itemsWithCmv < inventorySummary.itemCount && (
              <p className="text-xs text-[var(--biz-muted)]">
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
        compact ? "mb-4 gap-3" : "mb-5 gap-3"
      }`}
    >
      {cards.map((c) => (
        <div key={c.label} style={KPI_CARD_STYLE} className={compact ? "p-4" : "p-5"}>
          <p className="mb-2 text-xs uppercase tracking-normal text-[var(--biz-muted)] leading-none">{c.label}</p>
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
          ) : (
            <p className={`text-2xl font-semibold tabular-nums ${c.valueClass}`}>
              {c.value}
            </p>
          )}
        </div>
      ))}
      {inventoryValueCard}
    </div>
  );
}
