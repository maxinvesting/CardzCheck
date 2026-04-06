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
    "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(249,250,251,0.97) 100%)",
  border: "1px solid var(--biz-border)",
  borderRadius: "14px",
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
      label: "Sales MTD",
      value: revenueMtd,
      valueColor: "var(--biz-text)" as string,
      sub: `YTD ${revenueYtd}`,
    },
    {
      label: "Net Earnings MTD",
      value: profitMtd,
      valueColor: profitPositive ? "#16a34a" : "#dc2626",
      sub: `YTD ${profitYtd}`,
    },
    {
      label: "Active Inventory",
      value: activeCount,
      valueColor: "var(--biz-text)" as string,
      sub: `${totalCount} total items`,
    },
    {
      label: "Inventory Value",
      value: inventoryValue,
      valueColor: "var(--biz-text)" as string,
      sub: costBasisLine,
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "10px",
      }}
    >
      {cards.map(({ label, value, valueColor, sub }) => (
        <div key={label} style={{
          background: "#ffffff",
          border: "1px solid var(--biz-border)",
          borderRadius: "8px",
          padding: "14px 16px",
        }}>
          {loading ? (
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
                  <span className="shrink-0 rounded bg-[var(--biz-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--biz-muted)]">
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
