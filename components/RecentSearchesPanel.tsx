"use client";

import { useState, useEffect, useCallback } from "react";
import type { SearchFormData } from "@/types";

interface RecentSearchRecord {
  id: string;
  user_id: string;
  search_query: string;
  card_name: string | null;
  filters_used: Record<string, string | undefined>;
  result_count: number | null;
  cmv: number | null;
  searched_at: string;
}

interface RecentSearchesPanelProps {
  onSearchClick: (data: SearchFormData) => void;
  isLoggedIn: boolean;
}

export default function RecentSearchesPanel({
  onSearchClick,
  isLoggedIn,
}: RecentSearchesPanelProps) {
  const [searches, setSearches] = useState<RecentSearchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadSearches = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/recent-searches");
      const data = await res.json();
      if (data.searches) {
        setSearches(data.searches);
      }
    } catch (err) {
      console.error("Failed to load recent searches:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadSearches();
  }, [loadSearches]);

  const handleSearchClick = (search: RecentSearchRecord) => {
    // Convert filters_used back to SearchFormData
    const filters = search.filters_used || {};
    const formData: SearchFormData = {
      player_name: filters.player || search.card_name || search.search_query,
      year: filters.year,
      set_name: filters.set,
      grade: filters.grade,
      card_number: filters.cardNumber,
      parallel_type: filters.parallelType,
      serial_number: filters.serialNumber,
      variation: filters.variation,
      autograph: filters.autograph,
      relic: filters.relic,
    };
    onSearchClick(formData);
  };

  const handleDeleteSearch = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/recent-searches?id=${id}`, { method: "DELETE" });
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete search:", err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all recent searches?")) return;
    setClearing(true);
    try {
      await fetch("/api/recent-searches?clear_all=true", { method: "DELETE" });
      setSearches([]);
    } catch (err) {
      console.error("Failed to clear searches:", err);
    } finally {
      setClearing(false);
    }
  };

  const formatTimeAgo = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Don't show if not logged in or no searches
  if (!isLoggedIn) return null;
  if (!loading && searches.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Header / Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors w-full"
      >
        <svg
          className="w-4 h-4"
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
        <span>Recent Searches</span>
        <span className="text-gray-500">({searches.length})</span>
        <svg
          className={`w-4 h-4 ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-700/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Clear All Button */}
              <div className="flex justify-end mb-3">
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {clearing ? "Clearing..." : "Clear History"}
                </button>
              </div>

              {/* Search List */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {searches.map((search) => (
                  <button
                    key={search.id}
                    onClick={() => handleSearchClick(search)}
                    className="w-full text-left p-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">
                          {search.card_name || search.search_query}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(search.searched_at)}
                          </span>
                          {search.result_count !== null && (
                            <span className="text-xs text-gray-500">
                              {search.result_count} results
                            </span>
                          )}
                          {search.cmv !== null && (
                            <span className="text-xs text-green-400">
                              CMV: {formatCurrency(search.cmv)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Re-run search icon */}
                        <svg
                          className="w-4 h-4 text-gray-500 group-hover:text-blue-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteSearch(search.id, e)}
                          className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove from history"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {searches.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-4">
                  No recent searches yet
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
