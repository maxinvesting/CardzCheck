"use client";

import Link from "next/link";
import type { ShopStats } from "@/lib/shop/server";

interface ShopStatsStripProps {
  stats: ShopStats;
  isAdmin?: boolean;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ShopStatsStrip({ stats, isAdmin }: ShopStatsStripProps) {
  const isEmpty = stats.activeCount === 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="px-4 py-3 rounded-lg bg-gray-900/30 border border-gray-800/60">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">
          Active Listings
        </div>
        <div className="text-lg font-semibold text-gray-200 mt-0.5 tabular-nums">
          {isEmpty ? "0" : stats.activeCount}
        </div>
      </div>
      <div className="px-4 py-3 rounded-lg bg-gray-900/30 border border-gray-800/60">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">
          Inventory Value
        </div>
        <div className="text-lg font-semibold text-gray-300 mt-0.5 tabular-nums">
          {isEmpty ? "—" : formatUsd(stats.totalInventoryValue)}
        </div>
      </div>
      <div className="px-4 py-3 rounded-lg bg-gray-900/30 border border-gray-800/60">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">
          Below CMV
        </div>
        <div className="text-lg font-semibold text-emerald-400/90 mt-0.5 tabular-nums">
          {isEmpty ? "—" : `${stats.belowCmvPct.toFixed(0)}%`}
        </div>
      </div>
      <div className="px-4 py-3 rounded-lg bg-gray-900/30 border border-gray-800/60">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">
          Avg Grade
        </div>
        <div className="text-lg font-semibold text-gray-200 mt-0.5">
          {isEmpty ? "—" : stats.avgGrade}
        </div>
      </div>
      {isEmpty && isAdmin && (
        <div className="col-span-2 md:col-span-4 flex items-center justify-center pt-3">
          <Link
            href="/admin/shop"
            className="text-sm text-gray-400 hover:text-cyan-400 transition-colors"
          >
            Add listings in Admin →
          </Link>
        </div>
      )}
    </div>
  );
}
