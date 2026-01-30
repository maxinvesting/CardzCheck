"use client";

import type { CollectionItem } from "@/types";
import { computeCollectionSummary } from "@/lib/values";

interface CollectionMetricsCardProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CollectionMetricsCard({
  items,
  loading,
}: CollectionMetricsCardProps) {
  const summary = computeCollectionSummary(items);

  const totalValue = summary.totalDisplayValue;
  const cardCount = summary.cardCount;
  const costBasis = summary.totalCostBasis;
  const unrealizedGain = summary.totalUnrealizedPL;
  const unrealizedGainPct =
    summary.totalUnrealizedPLPct !== null
      ? summary.totalUnrealizedPLPct * 100
      : null;

  // Mock 30-day change - in real app, this would come from historical data.
  // Use display value as the base so it's CMV-driven when available.
  const change30Day = totalValue * 0.05; // Placeholder: +5%
  const change30DayPercent = 5.0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 shadow-lg shadow-blue-900/20">
        <div className="animate-pulse">
          <div className="h-4 bg-blue-400/30 rounded w-32 mb-3" />
          <div className="h-12 bg-blue-400/30 rounded w-48 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-3 bg-blue-400/30 rounded w-20 mb-2" />
                <div className="h-6 bg-blue-400/30 rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 shadow-lg shadow-blue-900/20">
      {/* Main Collection Value */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-medium text-blue-100 uppercase tracking-wider">
            Collection Value
          </span>
        </div>
        <p className="text-4xl md:text-5xl font-bold text-white tracking-tight tabular-nums">
          {formatCurrency(totalValue)}
        </p>
        {summary.cardsWithCmv === 0 && cardCount > 0 && (
          <p className="mt-1 text-xs text-blue-200">
            Collection value is CMV only. Add comps to get estimated values.
          </p>
        )}
        {totalValue > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-sm font-medium ${
                change30Day >= 0 ? "text-green-300" : "text-red-300"
              }`}
            >
              {change30Day >= 0 ? "+" : ""}
              {formatCurrency(change30Day)} ({change30DayPercent >= 0 ? "+" : ""}
              {change30DayPercent.toFixed(1)}%)
            </span>
            <span className="text-xs text-blue-200">30d</span>
          </div>
        )}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Cards */}
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">
            Total Cards
          </p>
          <p className="text-2xl font-bold text-white tabular-nums">
            {cardCount}
          </p>
        </div>

        {/* Cost Basis */}
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">
            Cost Basis
          </p>
          <p className="text-2xl font-bold text-white tabular-nums">
            {formatCurrency(costBasis)}
          </p>
        </div>

        {/* Unrealized Gain/Loss */}
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">
            Unrealized P/L
          </p>
          {unrealizedGain !== null && unrealizedGainPct !== null ? (
            <>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  unrealizedGain >= 0 ? "text-green-300" : "text-red-300"
                }`}
              >
                {unrealizedGain >= 0 ? "+" : ""}
                {formatCurrency(unrealizedGain)}
              </p>
              <p
                className={`text-xs ${
                  unrealizedGainPct >= 0 ? "text-green-300" : "text-red-300"
                }`}
              >
                {unrealizedGainPct >= 0 ? "+" : ""}
                {unrealizedGainPct.toFixed(1)}%
              </p>
            </>
          ) : (
            <div className="space-y-1">
              <p className="text-2xl font-bold tabular-nums text-blue-100">
                — 
              </p>
              <p className="text-xs text-blue-100/80">
                Market value unavailable for cost-basis comparison.
              </p>
            </div>
          )}
        </div>

        {/* 30-Day Change */}
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-xs font-medium text-blue-200 uppercase tracking-wider mb-1">
            30-Day Change
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              change30Day >= 0 ? "text-green-300" : "text-red-300"
            }`}
          >
            {change30Day >= 0 ? "+" : ""}
            {formatCurrency(change30Day)}
          </p>
        </div>
      </div>
    </div>
  );
}
