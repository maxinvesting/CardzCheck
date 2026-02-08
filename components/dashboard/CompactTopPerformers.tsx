"use client";

import Link from "next/link";
import type { CollectionItem } from "@/types";
import { computePerformers } from "@/lib/values";

interface CompactTopPerformersProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CompactTopPerformers({ items, loading }: CompactTopPerformersProps) {
  const performers = computePerformers(items, 3); // Only top 3

  const formatCurrency = (value: number | null) => {
    if (value === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-800 rounded w-32 mb-3" />
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Top Performers</h3>
        {items.length > 0 && (
          <Link
            href="/collection"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            View all
          </Link>
        )}
      </div>

      {performers.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-gray-500">Add cards to track performance</p>
        </div>
      ) : (
        <div className="space-y-2">
          {performers.map((perf) => {
            const { item, estCmv, pctChange } = perf;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.player_name}
                    className="w-8 h-11 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {item.player_name}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {[item.year, item.set_name].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-white tabular-nums">
                    {formatCurrency(estCmv ?? null)}
                  </p>
                  {pctChange !== null && (
                    <p className={`text-[10px] tabular-nums ${
                      pctChange >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {pctChange >= 0 ? "+" : ""}{(pctChange * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
