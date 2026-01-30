"use client";

import type { CompsStats as Stats } from "@/types";

interface CompsStatsProps {
  stats: Stats;
  query: string;
  onAddToCollection?: () => void;
  cardAdded?: boolean;
  canAddToCollection?: boolean;
  onWatch?: () => void;
  isWatched?: boolean;
  canWatch?: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function CompsStats({
  stats,
  query,
  onAddToCollection,
  cardAdded,
  canAddToCollection = true,
  onWatch,
  isWatched,
  canWatch = true,
}: CompsStatsProps) {
  if (stats.count === 0) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
        <div className="text-center">
          <p className="text-yellow-800 dark:text-yellow-200 font-medium">
            No sold listings found for &quot;{query}&quot;
          </p>
          <p className="text-yellow-600 dark:text-yellow-400 text-sm mt-1">
            eBay doesn&apos;t have recent sales data for this card
          </p>
        </div>

        {/* Still allow adding to collection or watch */}
        {(onAddToCollection || onWatch) && (
          <div className="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-800">
            {cardAdded ? (
              <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Added to collection!</span>
              </div>
            ) : isWatched ? (
              <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Added to watchlist!</span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Track this card?
                </p>
                <div className="flex gap-2">
                  {onAddToCollection && (
                    <button
                      onClick={onAddToCollection}
                      disabled={!canAddToCollection}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add to Collection
                    </button>
                  )}
                  {onWatch && (
                    <button
                      onClick={onWatch}
                      disabled={!canWatch}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                      title={!canWatch ? "Watchlist is a Pro feature" : "Watch this card"}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {!canWatch && (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      Watch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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
            {stats.cmv !== null ? formatPrice(stats.cmv) : "CMV unavailable"}
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

      {/* Actions row */}
      {(onAddToCollection || onWatch) && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-center gap-3">
          {cardAdded ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Added to collection!</span>
            </div>
          ) : isWatched ? (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Added to watchlist!</span>
            </div>
          ) : (
            <>
              {onAddToCollection && (
                <button
                  onClick={onAddToCollection}
                  disabled={!canAddToCollection}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add to Collection
                </button>
              )}
              {onWatch && (
                <button
                  onClick={onWatch}
                  disabled={!canWatch}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                  title={!canWatch ? "Watchlist is a Pro feature" : "Watch this card"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {!canWatch && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  Watch
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
