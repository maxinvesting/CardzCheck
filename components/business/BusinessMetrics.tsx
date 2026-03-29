"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import type { BusinessMetrics as Metrics } from "@/types";

function fmtCurrency(dollars: number): string {
  if (Math.abs(dollars) >= 1000) {
    return dollars.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Animates a dollar-cents value from 0 to target with ease-out spring */
function CountUpDollars({
  valueCents,
  duration = 1.3,
}: {
  valueCents: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (valueCents === 0) {
      ref.current.textContent = "$0";
      return;
    }
    const controls = animate(0, valueCents / 100, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) {
          ref.current.textContent = fmtCurrency(v);
        }
      },
    });
    return controls.stop;
  }, [valueCents, duration]);
  return <span ref={ref}>$0</span>;
}

/** Animates a plain integer from 0 to target */
function CountUpInt({
  value,
  duration = 1.0,
}: {
  value: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (value === 0) {
      ref.current.textContent = "0";
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = String(Math.round(v));
      },
    });
    return controls.stop;
  }, [value, duration]);
  return <span ref={ref}>0</span>;
}

interface Props {
  metrics: Metrics | null;
  loading: boolean;
  inventorySummary?: InventoryValueSummary | null;
  totalItemCount?: number;
  compact?: boolean;
}

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
}: Props) {
  const profitPositive = !metrics || metrics.profitMtd >= 0;
  const activeCount = metrics?.activeInventoryCount ?? 0;
  const totalCount = totalItemCount ?? 0;

  const inventoryValueCents =
    inventorySummary && inventorySummary.itemCount > 0
      ? inventorySummary.itemsWithCmv > 0
        ? inventorySummary.totalCmvCents
        : inventorySummary.totalCostCents
      : 0;

  const costBasisLine =
    inventorySummary && inventorySummary.itemCount > 0
      ? `Cost basis ${fmtCurrency(inventorySummary.totalCostCents / 100)}`
      : "No cost data";

  const revenueMtd = metrics?.revenueMtd ?? 0;
  const profitMtd = metrics?.profitMtd ?? 0;
  const revenueYtd = metrics ? fmtCurrency(metrics.revenueYtd / 100) : "—";
  const profitYtd = metrics ? fmtCurrency(metrics.profitYtd / 100) : "—";

  const cards = [
    {
      label: "Sales MTD",
      renderValue: () =>
        metrics ? (
          <CountUpDollars valueCents={revenueMtd} />
        ) : (
          <span>—</span>
        ),
      sub: `YTD ${revenueYtd}`,
      valueColor: "#f8fafc",
      accentColor: "#3b82f6",
      glowColor: null,
    },
    {
      label: "Net Earnings MTD",
      renderValue: () =>
        metrics ? (
          <CountUpDollars valueCents={profitMtd} />
        ) : (
          <span>—</span>
        ),
      sub: `YTD ${profitYtd}`,
      valueColor: profitPositive ? "#10b981" : "#ef4444",
      accentColor: profitPositive ? "#10b981" : "#ef4444",
      glowColor: profitPositive ? "rgba(16,185,129,0.35)" : null,
    },
    {
      label: "Active Inventory",
      renderValue: () =>
        metrics ? (
          <CountUpInt value={activeCount} />
        ) : (
          <span>—</span>
        ),
      sub: `${totalCount} total items`,
      valueColor: "#f8fafc",
      accentColor: "#a855f7",
      glowColor: null,
    },
    {
      label: "Inventory Value",
      renderValue: () =>
        inventorySummary && inventorySummary.itemCount > 0 ? (
          <CountUpDollars valueCents={inventoryValueCents} />
        ) : (
          <span>—</span>
        ),
      sub: costBasisLine,
      valueColor: "#f8fafc",
      accentColor: "#f0b429",
      glowColor: null,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, renderValue, sub, valueColor, accentColor, glowColor }) => (
        <div
          key={label}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: "12px",
            padding: "16px 18px",
          }}
        >
          {loading ? (
            <div className="space-y-2.5">
              <div
                className="h-2.5 w-20 rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
              <div
                className="h-8 w-28 rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.07)" }}
              />
              <div
                className="h-2.5 w-24 rounded animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)" }}
              />
            </div>
          ) : (
            <>
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#64748b",
                  marginBottom: "6px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {label}
              </p>
              <p
                style={{
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  color: valueColor,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontVariantNumeric: "tabular-nums",
                  ...(glowColor ? { textShadow: `0 0 16px ${glowColor}` } : {}),
                }}
              >
                {renderValue()}
              </p>
              <p
                style={{
                  fontSize: "11px",
                  color: "#475569",
                  marginTop: "5px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {sub}
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
