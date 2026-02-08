"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import type { CollectionItem } from "@/types";
import { computeCollectionSummary } from "@/lib/values";

interface PerformanceChartProps {
  items: CollectionItem[];
  loading?: boolean;
}

type TimeRange = "30d" | "90d" | "365d";

export default function PerformanceChart({
  items,
  loading,
}: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  // Generate mock historical data based on collection
  // In a real app, this would come from a collection_snapshots table
  const chartData = useMemo(() => {
    const summary = computeCollectionSummary(items);
    const totalValue = summary.totalDisplayValue;

    if (totalValue === null || totalValue === 0) return [];

    const days = timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365;
    const data = [];
    const now = new Date();

    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Generate realistic-looking fluctuations
      const randomFactor = 0.95 + Math.random() * 0.1;
      const trendFactor = 1 + (days - i) * 0.001; // Slight upward trend
      const value = totalValue * randomFactor * (i === 0 ? 1 : trendFactor * 0.95);

      data.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        value: Math.round(value),
        fullDate: date.toISOString(),
      });
    }

    return data;
  }, [items, timeRange]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: { date: string } }>;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="text-xs text-gray-400 mb-1">{payload[0].payload.date}</p>
          <p className="text-lg font-bold text-white">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 bg-gray-800 rounded w-40" />
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-800 rounded w-12" />
              ))}
            </div>
          </div>
          <div className="h-64 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-4">
          Collection Performance
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <p className="text-sm">Add cards to see performance trends</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          Collection Performance
        </h3>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {(["30d", "90d", "365d"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeRange === range
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {range === "365d" ? "1Y" : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
