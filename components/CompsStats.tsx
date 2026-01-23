"use client";

import type { CompsStats as Stats } from "@/types";

interface CompsStatsProps {
  stats: Stats;
  query: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function CompsStats({ stats, query }: CompsStatsProps) {
  if (stats.count === 0) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6 text-center">
        <p className="text-yellow-800 dark:text-yellow-200 font-medium">
          No sold listings found for &quot;{query}&quot;
        </p>
        <p className="text-yellow-600 dark:text-yellow-400 text-sm mt-1">
          Try adjusting your search terms
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Results for &quot;{query}&quot;
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-gray-200 dark:divide-gray-800">
        {/* CMV - highlighted */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 col-span-2 md:col-span-1">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            CMV
          </p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
            {formatPrice(stats.cmv)}
          </p>
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
            Current Market Value
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Average
          </p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
            {formatPrice(stats.avg)}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Low
          </p>
          <p className="text-xl font-semibold text-green-600 dark:text-green-400 mt-1">
            {formatPrice(stats.low)}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            High
          </p>
          <p className="text-xl font-semibold text-red-600 dark:text-red-400 mt-1">
            {formatPrice(stats.high)}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sales
          </p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white mt-1">
            {stats.count}
          </p>
        </div>
      </div>
    </div>
  );
}
