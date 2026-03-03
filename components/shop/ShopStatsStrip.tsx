"use client";

import Link from "next/link";
import type { ShopStats } from "@/lib/shop/server";
import { formatUsd } from "./shop-formatters";

interface ShopStatsStripProps {
  stats: ShopStats;
  isAdmin?: boolean;
  compact?: boolean;
}

interface StatItem {
  label: string;
  value: string;
  valueClassName?: string;
}

export default function ShopStatsStrip({
  stats,
  isAdmin,
  compact,
}: ShopStatsStripProps) {
  const isEmpty = stats.activeCount === 0;

  const statItems: StatItem[] = [
    {
      label: "Active listings",
      value: isEmpty ? "0" : stats.activeCount.toString(),
      valueClassName: "text-slate-900",
    },
    {
      label: "Inventory value",
      value: isEmpty ? "-" : formatUsd(stats.totalInventoryValue, 0),
      valueClassName: "text-slate-900",
    },
    {
      label: "Below CMV count",
      value: isEmpty ? "-" : stats.belowCmvCount.toString(),
      valueClassName: "text-emerald-600",
    },
    {
      label: "Avg grade",
      value: isEmpty ? "-" : stats.avgGrade,
      valueClassName: "text-slate-900",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-lg border border-slate-200 bg-white px-4 ${
              compact ? "py-3" : "py-4"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
              {item.label}
            </p>
            <p
              className={`mt-1 font-semibold tabular-nums ${
                compact ? "text-base" : "text-lg"
              } ${item.valueClassName ?? "text-slate-900"}`}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {isEmpty && isAdmin && (
        <div className="flex items-center justify-center">
          <Link
            href="/admin/shop"
            className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
          >
            Add listings in Marketplace Admin →
          </Link>
        </div>
      )}
    </div>
  );
}
