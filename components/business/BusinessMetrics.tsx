"use client";

import type { CSSProperties } from "react";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import type { BusinessMetrics as Metrics } from "@/types";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtFull(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

interface Props {
  metrics: Metrics | null;
  loading: boolean;
  inventorySummary?: InventoryValueSummary | null;
  totalItemCount?: number;
  compact?: boolean;
}

const STRIP_STYLE: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(238,248,241,0.98) 100%)",
  border: "1px solid var(--biz-border)",
  borderRadius: "14px",
  boxShadow: "0 12px 24px rgba(18, 58, 35, 0.05)",
};

interface CellDef {
  label: string;
  primary: string;
  secondary?: string;
  primaryClass: string;
  tag?: string;
}

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
  compact = false,
}: Props) {
  const cells: CellDef[] = [
    {
      label: "Revenue",
      primary: metrics ? fmt(metrics.revenueMtd) : "—",
      secondary: metrics ? `${fmt(metrics.revenueYtd)} YTD` : undefined,
      primaryClass: "text-[var(--biz-text)]",
      tag: "MTD",
    },
    {
      label: "Profit",
      primary: metrics ? fmt(metrics.profitMtd) : "—",
      secondary: metrics ? `${fmt(metrics.profitYtd)} YTD` : undefined,
      primaryClass:
        metrics && metrics.profitMtd >= 0 ? "text-[var(--biz-profit)]" : "text-red-500",
      tag: "MTD",
    },
    {
      label: "Sales",
      primary: metrics ? String(metrics.salesCountMtd) : "—",
      secondary: metrics ? `${metrics.salesCountYtd} YTD` : undefined,
      primaryClass: "text-[var(--biz-text)]",
      tag: "MTD",
    },
    {
      label: "Active Inventory",
      primary: metrics ? String(metrics.activeInventoryCount) : "—",
      primaryClass: "text-[var(--biz-text)]",
    },
  ];

  if (inventorySummary) {
    const isFiltered =
      totalItemCount != null &&
      inventorySummary.itemCount !== totalItemCount;
    const hasCmv = inventorySummary.itemsWithCmv > 0;
    cells.push({
      label: isFiltered ? "Inventory Value (Filtered)" : "Inventory Value",
      primary:
        inventorySummary.itemCount === 0
          ? fmt(0)
          : hasCmv
            ? fmtFull(inventorySummary.totalCmvCents)
            : fmtFull(inventorySummary.totalCostCents),
      secondary: hasCmv
        ? `Est. Market Value · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`
        : `Cost Basis · ${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`,
      primaryClass: "text-[var(--biz-text)]",
    });
  }

  const colClass =
    cells.length >= 5
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={compact ? "mb-2" : "mb-5"}>
      <div style={STRIP_STYLE} className="overflow-hidden">
        <div className={`grid ${colClass}`}>
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              className={[
                "flex flex-col justify-between gap-3",
                compact ? "px-5 py-4" : "px-6 py-5",
                "min-h-[92px] border-[color:var(--biz-border)]",
                i > 0 ? "border-l" : "",
                i >= 2 ? "border-t sm:border-t-0" : "",
                cells.length >= 5 && i >= 3 ? "sm:border-t lg:border-t-0" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)] leading-tight">
                  {cell.label}
                </p>
                {cell.tag && (
                  <span className="shrink-0 rounded border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--biz-primary)]">
                    {cell.tag}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="h-8 w-20 animate-pulse rounded-md bg-[var(--biz-skeleton)]" />
              ) : (
                <div>
                  <p
                    className={`text-2xl font-semibold tabular-nums leading-none tracking-tight ${cell.primaryClass}`}
                  >
                    {cell.primary}
                  </p>
                  {cell.secondary && (
                    <p className="mt-1.5 text-[11px] text-[var(--biz-muted)] tabular-nums leading-tight">
                      {cell.secondary}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
