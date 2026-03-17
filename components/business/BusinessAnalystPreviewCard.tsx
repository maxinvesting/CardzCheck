"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useMemo } from "react";
import type { BusinessInventoryItem, BusinessMetrics as MetricsType } from "@/types";
import { generateBusinessAnalystInsights } from "@/lib/business/analyst-insights";

interface Props {
  items: BusinessInventoryItem[];
  metrics?: MetricsType | null;
}

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Badge({
  children,
  color,
}: {
  children: ReactNode;
  color: "amber" | "blue" | "green";
}) {
  const styles: Record<string, CSSProperties> = {
    amber: { background: "#FEF3C7", color: "#92400E" },
    blue: { background: "#DBEAFE", color: "#1E40AF" },
    green: { background: "#D1FAE5", color: "#065F46" },
  };
  return (
    <span
      style={{
        ...styles[color],
        fontSize: "11px",
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: "4px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StatRow({ label, badge }: { label: string; badge: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "5px 0",
      }}
    >
      <span style={{ fontSize: "12px", color: "var(--biz-muted)" }}>{label}</span>
      {badge}
    </div>
  );
}

const PANEL_STYLE: CSSProperties = {
  background: "#fff",
  border: "0.5px solid var(--biz-border)",
  borderRadius: "8px",
  padding: "16px",
};

const PANEL_TITLE_STYLE: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--biz-text)",
  margin: 0,
};

const PANEL_SUBTITLE_STYLE: CSSProperties = {
  fontSize: "11px",
  color: "var(--biz-muted)",
  marginTop: "2px",
};

export default function BusinessAnalystPreviewCard({ items, metrics }: Props) {
  const insights = useMemo(() => generateBusinessAnalystInsights(items), [items]);

  const revenueMtd = metrics?.revenueMtd ?? 0;
  const profitMtd = metrics?.profitMtd ?? 0;
  const salesCountMtd = metrics?.salesCountMtd ?? 0;

  const marginPct =
    revenueMtd > 0 ? `${((profitMtd / revenueMtd) * 100).toFixed(1)}%` : "—";
  const avgSalePrice =
    salesCountMtd > 0
      ? fmtDollars(Math.round(revenueMtd / salesCountMtd))
      : "—";

  const avgDaysToSell = useMemo(() => {
    const soldItems = items.filter(
      (i) => i.status === "sold" && i.acquisition_date && i.updated_at
    );
    if (soldItems.length === 0) return null;
    const total = soldItems.reduce((sum, item) => {
      const acquiredMs = Date.parse(item.acquisition_date!);
      const updatedMs = Date.parse(item.updated_at);
      if (Number.isNaN(acquiredMs) || Number.isNaN(updatedMs)) return sum;
      return sum + Math.max(0, Math.floor((updatedMs - acquiredMs) / 86_400_000));
    }, 0);
    return Math.round(total / soldItems.length);
  }, [items]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        marginBottom: "12px",
      }}
    >
      {/* Left panel: Today's Actions */}
      <div style={PANEL_STYLE}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div>
            <h2 style={PANEL_TITLE_STYLE}>Today&apos;s actions</h2>
            <p style={PANEL_SUBTITLE_STYLE}>Actionable signals from your inventory</p>
          </div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              background: "#F0FDF4",
              color: "var(--biz-primary)",
              border: "1px solid var(--biz-border)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            AI
          </span>
        </div>

        <StatRow
          label="List or reprice"
          badge={<Badge color="amber">{insights.summary.actionCount} items</Badge>}
        />
        <StatRow
          label="Unlisted"
          badge={<Badge color="blue">{insights.summary.unlistedActiveCount} items</Badge>}
        />
        <StatRow
          label="Market coverage"
          badge={<Badge color="green">{insights.coverage.cmvCoveragePct}%</Badge>}
        />

        <div style={{ marginTop: "10px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "4px",
            }}
          >
            <span style={{ fontSize: "11px", color: "var(--biz-muted)" }}>
              Est. MV coverage
            </span>
            <span style={{ fontSize: "11px", color: "var(--biz-muted)" }}>
              {insights.coverage.cmvCoveragePct}%
            </span>
          </div>
          <div
            style={{
              height: "6px",
              borderRadius: "3px",
              background: "#E5E7EB",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${insights.coverage.cmvCoveragePct}%`,
                background: "#16a34a",
                borderRadius: "3px",
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
          <Link
            href="/business/insights"
            style={{ fontSize: "12px", fontWeight: 500, color: "var(--biz-primary)" }}
          >
            View insights →
          </Link>
        </div>
      </div>

      {/* Right panel: Sales Summary */}
      <div style={PANEL_STYLE}>
        <div style={{ marginBottom: "12px" }}>
          <h2 style={PANEL_TITLE_STYLE}>Sales summary</h2>
          <p style={PANEL_SUBTITLE_STYLE}>Month-to-date performance</p>
        </div>

        <StatRow
          label="Sales MTD"
          badge={
            <Badge color="green">
              {salesCountMtd} {salesCountMtd === 1 ? "sale" : "sales"}
            </Badge>
          }
        />
        <StatRow
          label="Margin %"
          badge={<Badge color="green">{marginPct}</Badge>}
        />
        <StatRow
          label="Avg sale price"
          badge={<Badge color="blue">{avgSalePrice}</Badge>}
        />
        <StatRow
          label="Days to sell (avg)"
          badge={
            <Badge color="amber">
              {avgDaysToSell !== null ? `${avgDaysToSell} days` : "—"}
            </Badge>
          }
        />
      </div>
    </div>
  );
}
