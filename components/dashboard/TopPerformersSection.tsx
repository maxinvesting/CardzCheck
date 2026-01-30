"use client";

import Link from "next/link";
import type { CollectionItem } from "@/types";
import { computePerformers } from "@/lib/values";

interface TopPerformersSectionProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function TopPerformersSection({
  items,
  loading,
}: TopPerformersSectionProps) {
  const performers = computePerformers(items, 5);

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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-800 rounded w-32 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-14 bg-gray-700 rounded" />
                  <div>
                    <div className="h-4 bg-gray-700 rounded w-24 mb-2" />
                    <div className="h-3 bg-gray-700 rounded w-16" />
                  </div>
                </div>
                <div className="h-5 bg-gray-700 rounded w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
          <h3 className="text-lg font-semibold text-white">Top Performers</h3>
        </div>
        {items.length > 0 && (
          <Link
            href="/collection"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all
          </Link>
        )}
      </div>

      {performers.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg
            className="w-10 h-10 mx-auto mb-2 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <p className="text-sm">Add cards with purchase price and CMV to track performance</p>
        </div>
      ) : (
        <div className="space-y-2">
          {performers.map((perf, index) => {
            const { item, estCmv, costBasis, dollarChange, pctChange } = perf;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-700 rounded-lg text-sm font-bold text-gray-400">
                    {index + 1}
                  </div>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.player_name}
                      className="w-10 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-gray-700 rounded flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-white text-sm truncate">
                      {item.player_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {[item.year, item.set_name, item.grade]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-white text-sm tabular-nums">
                    {formatCurrency(estCmv ?? null)}
                  </p>
                  {dollarChange !== null && pctChange !== null ? (
                    <p
                      className={`text-xs tabular-nums ${
                        dollarChange >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {dollarChange >= 0 ? "+" : ""}
                      {formatCurrency(dollarChange)}{" "}
                      <span className="ml-1">
                        ({pctChange >= 0 ? "+" : ""}
                        {(pctChange * 100).toFixed(1)}%)
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 tabular-nums">Change —</p>
                  )}
                  {costBasis !== null && (
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      Cost basis: {formatCurrency(costBasis)}
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
