"use client";

import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import type { BusinessMetrics as Metrics } from "@/types";

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  metrics: Metrics | null;
  loading: boolean;
  inventorySummary?: InventoryValueSummary | null;
  totalItemCount?: number;
  compact?: boolean;
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--color-background-secondary, #F9FAFB)",
  border: "1px solid var(--biz-border)",
  borderRadius: "8px",
  padding: "14px 16px",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--biz-muted)",
  marginBottom: "4px",
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 500,
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
};

const SUB_STYLE: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--biz-muted)",
  marginTop: "4px",
};

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
}: Props) {
  const revenueMtd = metrics ? fmtDollars(metrics.revenueMtd) : "—";
  const revenueYtd = metrics ? fmtDollars(metrics.revenueYtd) : "—";
  const profitMtd = metrics ? fmtDollars(metrics.profitMtd) : "—";
  const profitYtd = metrics ? fmtDollars(metrics.profitYtd) : "—";
  const profitPositive = !metrics || metrics.profitMtd >= 0;
  const activeCount = metrics ? String(metrics.activeInventoryCount) : "—";
  const totalCount = totalItemCount ?? 0;

  let portfolioValue = "—";
  let costBasisLine = "No cost data";
  if (inventorySummary && inventorySummary.itemCount > 0) {
    const value =
      inventorySummary.itemsWithCmv > 0
        ? inventorySummary.totalCmvCents
        : inventorySummary.totalCostCents;
    portfolioValue = fmtDollars(value);
    costBasisLine = `Cost basis ${fmtDollars(inventorySummary.totalCostCents)}`;
  }

  const cards = [
    {
      label: "Revenue MTD",
      value: revenueMtd,
      valueColor: "var(--biz-text)" as string,
      sub: `YTD ${revenueYtd}`,
    },
    {
      label: "Profit MTD",
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
      label: "Portfolio Value",
      value: portfolioValue,
      valueColor: "var(--biz-text)" as string,
      sub: costBasisLine,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "10px",
      }}
    >
      {cards.map(({ label, value, valueColor, sub }) => (
        <div key={label} style={CARD_STYLE}>
          {loading ? (
            <div
              style={{ height: "52px" }}
              className="animate-pulse rounded bg-[var(--biz-skeleton)]"
            />
          ) : (
            <>
              <p style={LABEL_STYLE}>{label}</p>
              <p style={{ ...VALUE_STYLE, color: valueColor }}>{value}</p>
              <p style={SUB_STYLE}>{sub}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
