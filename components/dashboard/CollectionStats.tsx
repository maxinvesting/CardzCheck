"use client";

import type { CollectionItem } from "@/types";
import { computeCollectionSummary } from "@/lib/values";

interface CollectionStatsProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CollectionStats({ items, loading }: CollectionStatsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-pulse"
          >
            <div className="h-4 bg-gray-700 rounded w-20 mb-3" />
            <div className="h-8 bg-gray-700 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const summary = computeCollectionSummary(items);
  const cardCount = summary.cardCount;
  const totalValue = summary.totalDisplayValue;
  const totalInvested = summary.totalCostBasis;
  const gain = summary.totalUnrealizedPL ?? 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Card Count */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <svg
              className="w-5 h-5 text-blue-400"
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
          </div>
          <span className="text-sm font-medium text-gray-400">Cards</span>
        </div>
        <p className="text-3xl font-bold text-white">{cardCount}</p>
      </div>

      {/* Total Value */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-400">Total Value</span>
        </div>
        <p className="text-3xl font-bold text-white">
          {cmvAvailableCount > 0 ? formatCurrency(totalValue) : "CMV unavailable"}
        </p>
      </div>

      {/* Gain/Loss */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-lg ${gain >= 0 ? "bg-blue-500/20" : "bg-red-500/20"}`}>
            <svg
              className={`w-5 h-5 ${gain >= 0 ? "text-blue-400" : "text-red-400"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={gain >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"}
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-400">Since Added</span>
        </div>
        {gainEligible.length > 0 ? (
          <p className={`text-3xl font-bold ${gain >= 0 ? "text-blue-400" : "text-red-400"}`}>
            {gain >= 0 ? "+" : ""}{formatCurrency(gain)}
          </p>
        ) : (
          <p className="text-3xl font-bold text-gray-500">CMV unavailable</p>
        )}
      </div>
    </div>
  );
}
