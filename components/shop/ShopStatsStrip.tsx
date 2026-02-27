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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Active Listings</div>
        <div className="text-xl font-bold text-white mt-1 tabular-nums">
          {isEmpty ? "0" : stats.activeCount}
        </div>
      </div>
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Inventory Value</div>
        <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
          {isEmpty ? "—" : formatUsd(stats.totalInventoryValue)}
        </div>
      </div>
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Below CMV</div>
        <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">
          {isEmpty ? "—" : `${stats.belowCmvPct.toFixed(0)}%`}
        </div>
      </div>
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
        <div className="text-xs text-gray-400 uppercase tracking-wider">Avg Grade</div>
        <div className="text-xl font-bold text-white mt-1">
          {isEmpty ? "—" : stats.avgGrade}
        </div>
      </div>
      {isEmpty && isAdmin && (
        <div className="col-span-2 md:col-span-4 flex items-center justify-center pt-2">
          <Link
            href="/admin/shop"
            className="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
          >
            Add listings in Admin →
          </Link>
        </div>
      )}
    </div>
  );
}
