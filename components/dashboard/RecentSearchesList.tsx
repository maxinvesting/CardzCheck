"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RecentSearch } from "@/types";
import { getRecentSearches, clearRecentSearches, removeRecentSearch } from "@/lib/recent-searches";

export default function RecentSearchesList() {
  const router = useRouter();
  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSearches(getRecentSearches().slice(0, 5));
  }, []);

  const handleSearchClick = (search: RecentSearch) => {
    // Navigate to search page with query
    const params = new URLSearchParams();
    if (search.parsed.player_name) params.set("player", search.parsed.player_name);
    if (search.parsed.year) params.set("year", search.parsed.year);
    if (search.parsed.set_name) params.set("set", search.parsed.set_name);
    if (search.parsed.grade) params.set("grade", search.parsed.grade);
    if (search.parsed.parallel_type) params.set("parallel_type", search.parsed.parallel_type);

    router.push(`/comps?${params.toString()}`);
  };

  const handleRemove = (timestamp: number, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecentSearch(timestamp);
    setSearches(getRecentSearches().slice(0, 5));
  };

  const handleClearAll = () => {
    clearRecentSearches();
    setSearches([]);
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Searches</h2>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-700/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (searches.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Searches</h2>
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 text-gray-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-gray-400">No recent searches</p>
          <p className="text-sm text-gray-500 mt-1">Your searches will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Recent Searches</h2>
        <button
          onClick={handleClearAll}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2">
        {searches.map((search) => (
          <button
            key={search.timestamp}
            onClick={() => handleSearchClick(search)}
            className="w-full flex items-center justify-between p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <svg
                className="w-4 h-4 text-gray-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-left min-w-0">
                <p className="text-white truncate">{search.query}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatTimeAgo(search.timestamp)}</span>
                  {search.resultCount !== undefined && (
                    <>
                      <span>•</span>
                      <span>{search.resultCount} results</span>
                    </>
                  )}
                  {search.cmv !== undefined && (
                    <>
                      <span>•</span>
                      <span>
                        CMV: ${search.cmv.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={(e) => handleRemove(search.timestamp, e)}
              className="p-1 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
