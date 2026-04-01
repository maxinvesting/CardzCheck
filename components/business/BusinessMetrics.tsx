"use client";

import { useEffect, useRef } from "react";
import { animate } from "framer-motion";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import type { BusinessMetrics as Metrics } from "@/types";

function fmtCurrency(dollars: number): string {
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

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
      onUpdate(value) {
        if (ref.current) {
          ref.current.textContent = fmtCurrency(value);
        }
      },
    });

    return controls.stop;
  }, [duration, valueCents]);

  return <span ref={ref}>$0</span>;
}

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
      onUpdate(next) {
        if (ref.current) ref.current.textContent = String(Math.round(next));
      },
    });

    return controls.stop;
  }, [duration, value]);

  return <span ref={ref}>0</span>;
}

interface Props {
  metrics: Metrics | null;
  loading: boolean;
  inventorySummary?: InventoryValueSummary | null;
  totalItemCount?: number;
}

export default function BusinessMetrics({
  metrics,
  loading,
  inventorySummary,
  totalItemCount,
  compact = false,
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
      renderValue: () => (metrics ? <CountUpDollars valueCents={revenueMtd} /> : <span>—</span>),
      sub: `YTD ${revenueYtd}`,
      valueColor: "var(--biz-text)",
    },
    {
      label: "Net Earnings MTD",
      renderValue: () => (metrics ? <CountUpDollars valueCents={profitMtd} /> : <span>—</span>),
      sub: `YTD ${profitYtd}`,
      valueColor: profitPositive ? "#1D9E75" : "#E24B4A",
    },
    {
      label: "Active Inventory",
      renderValue: () => (metrics ? <CountUpInt value={activeCount} /> : <span>—</span>),
      sub: `${totalCount} total items`,
      valueColor: "var(--biz-text)",
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
      valueColor: "var(--biz-text)",
    },
  ] as const;

  return (
    <div
      className="grid grid-cols-2 overflow-hidden rounded-lg border lg:grid-cols-4"
      style={{ borderColor: "var(--biz-border)" }}
    >
      {cards.map(({ label, renderValue, sub, valueColor }) => (
        <div
          key={label}
          className="border-r px-5 py-4 last:border-r-0"
          style={{ borderColor: "rgba(0,0,0,0.06)" }}
        >
          {loading ? (
            <div className="space-y-2">
              <div className="h-2 w-16 animate-pulse rounded bg-slate-200" />
              <div className="h-7 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-2 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ) : (
            <>
              <p className="text-[9px] font-normal uppercase tracking-[0.08em] text-slate-500">
                {label}
              </p>
              <p
                className="mt-1.5 text-[22px] font-medium tabular-nums"
                style={{ color: valueColor, lineHeight: 1.1 }}
              >
                {renderValue()}
              </p>
              <p className="mt-1 text-[11px] font-normal text-slate-500">{sub}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
