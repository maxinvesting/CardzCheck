"use client";

import type { BusinessMetrics as Metrics } from "@/types";

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
}

export default function BusinessMetrics({ metrics, loading }: Props) {
  const cards = [
    {
      label: "Revenue MTD",
      value: metrics ? fmt(metrics.revenueMtd) : "—",
      color: "text-white",
    },
    {
      label: "Revenue YTD",
      value: metrics ? fmt(metrics.revenueYtd) : "—",
      color: "text-white",
    },
    {
      label: "Profit MTD",
      value: metrics ? fmt(metrics.profitMtd) : "—",
      color:
        metrics && metrics.profitMtd >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Profit YTD",
      value: metrics ? fmt(metrics.profitYtd) : "—",
      color:
        metrics && metrics.profitYtd >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Active Inventory",
      value: metrics ? String(metrics.activeInventoryCount) : "—",
      color: "text-white",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4"
        >
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            {c.label}
          </p>
          {loading ? (
            <div className="h-7 w-24 bg-gray-800 rounded animate-pulse" />
          ) : (
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>
              {c.value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
