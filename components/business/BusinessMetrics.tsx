"use client";

import type { CSSProperties } from "react";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import type { BusinessMetrics as Metrics } from "@/types";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
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

interface MetricItem {
  label: string;
  value: string;
  valueClass: string;
  detail?: string;
  secondaryDetail?: string;
  emphasized?: boolean;
}

const KPI_STRIP_STYLE: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.96) 100%)",
  border: "1px solid var(--biz-border)",
  borderRadius: "18px",
};

function metricDividerClasses(index: number): string {
  return cx(
    index >= 2 && "border-t",
    index % 2 === 1 && "border-l",
    index >= 3 ? "sm:border-t" : "sm:border-t-0",
    index % 3 === 0 ? "sm:border-l-0" : "sm:border-l",
    index >= 4 ? "md:border-t" : "md:border-t-0",
    index % 4 === 0 ? "md:border-l-0" : "md:border-l",
    "lg:border-t-0",
    index === 0 ? "lg:border-l-0" : "lg:border-l"
  );
}

function MetricCell({
  item,
  index,
  loading,
  compact,
}: {
  item: MetricItem;
  index: number;
  loading: boolean;
  compact: boolean;
}) {
  return (
    <div
      className={cx(
        "min-w-0 border-[color:var(--biz-border)]",
        compact ? "px-4 py-4 sm:px-5" : "px-5 py-5",
        "flex min-h-[104px] flex-col justify-between",
        metricDividerClasses(index),
        item.emphasized && "bg-white/55"
      )}
    >
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.18em] text-[var(--biz-muted)]">
          {item.label}
        </p>
        {loading ? (
          <div className="h-10 w-24 animate-pulse rounded bg-[var(--biz-skeleton)]" />
        ) : (
          <p
            className={cx(
              "whitespace-nowrap text-[clamp(1.7rem,2.5vw,2.35rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums",
              item.valueClass,
              item.emphasized && "text-[clamp(1.8rem,2.7vw,2.5rem)]"
            )}
          >
            {item.value}
          </p>
        )}
      </div>

      {!loading && item.detail ? (
        <div className="pt-2">
          <p className="text-xs leading-tight text-[var(--biz-muted)]">{item.detail}</p>
          {item.secondaryDetail ? (
            <p className="pt-1 text-xs leading-tight text-[var(--biz-muted)]">
              {item.secondaryDetail}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
  compact = false,
}: Props) {
  const items: MetricItem[] = [
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

  if (inventorySummary) {
    const itemCountLabel = `${inventorySummary.itemCount} item${inventorySummary.itemCount !== 1 ? "s" : ""}`;
    const inventoryLabel =
      totalItemCount != null && inventorySummary.itemCount !== totalItemCount
        ? "Inventory Value (Filtered)"
        : "Inventory Value";

    items.push({
      label: inventoryLabel,
      value:
        inventorySummary.itemCount === 0
          ? fmt(0)
          : inventorySummary.itemsWithCmv > 0
            ? fmt(inventorySummary.totalCmvCents)
            : fmt(inventorySummary.totalCostCents),
      valueClass: "text-[var(--biz-text)]",
      detail:
        inventorySummary.itemsWithCmv > 0
          ? `Est. Market Value · ${itemCountLabel}`
          : `Cost Basis · ${itemCountLabel}`,
      secondaryDetail:
        inventorySummary.itemsWithCmv > 0 &&
        inventorySummary.itemsWithCmv < inventorySummary.itemCount
          ? `Cost: ${fmt(inventorySummary.totalCostCents)}`
          : undefined,
      emphasized: true,
    });
  }

  return (
    <div className={compact ? "mb-3 md:mb-4" : "mb-5"}>
      <div style={KPI_STRIP_STYLE} className="overflow-hidden">
        <div
          className={cx(
            "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
            items.length === 8 ? "lg:grid-cols-8" : "lg:grid-cols-7"
          )}
        >
          {items.map((item, index) => (
            <MetricCell
              key={item.label}
              item={item}
              index={index}
              loading={loading}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
