"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RecentSearch, CollectionItem } from "@/types";
import { getRecentSearches, clearRecentSearches, removeRecentSearch } from "@/lib/recent-searches";

interface ActivityFeedProps {
  recentCards?: CollectionItem[];
}

type ActivityItem =
  | { type: "search"; data: RecentSearch }
  | { type: "card"; data: CollectionItem };

export default function ActivityFeed({ recentCards = [] }: ActivityFeedProps) {
  const router = useRouter();
  const [searches, setSearches] = useState<RecentSearch[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSearches(getRecentSearches().slice(0, 5));
  }, []);

  const handleSearchClick = (search: RecentSearch) => {
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

  const formatTimeAgo = (timestamp: number | string): string => {
    const ts = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
    const seconds = Math.floor((Date.now() - ts) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  // Merge and sort activities by timestamp
  const activities: ActivityItem[] = [];

  searches.forEach((search) => {
    activities.push({ type: "search", data: search });
  });

  recentCards.forEach((card) => {
    activities.push({ type: "card", data: card });
  });

  // Sort by most recent first
  activities.sort((a, b) => {
    const getTime = (item: ActivityItem) => {
      if (item.type === "search") return item.data.timestamp;
      return new Date(item.data.created_at).getTime();
    };
    return getTime(b) - getTime(a);
  });

  // Limit to 3 items for compact dashboard
  const displayItems = activities.slice(0, 3);

  // Loading state
  if (!mounted) {
    return (
      <div className="bg-gray-800/60 rounded-xl border border-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Recent Activity</h3>
        </div>
        <div className="p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-700/30 rounded-lg animate-pulse mb-1.5 last:mb-0" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (displayItems.length === 0) {
    return (
      <div className="bg-gray-800/60 rounded-xl border border-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Recent Activity</h3>
        </div>
        <div className="py-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gray-700/50 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-400">No recent activity</p>
          <p className="text-xs text-gray-500 mt-1">Your searches and cards will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
        {searches.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear searches
          </button>
        )}
      </div>

      {/* Activity List */}
      <div className="p-1">
        {displayItems.map((item, index) => {
          if (item.type === "search") {
            const search = item.data;
            return (
              <button
                key={`search-${search.timestamp}`}
                onClick={() => handleSearchClick(search)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-all duration-150 group"
              >
                {/* Icon */}
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-blue-400"
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
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white truncate">{search.query}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>{formatTimeAgo(search.timestamp)}</span>
                    {search.resultCount !== undefined && (
                      <>
                        <span className="text-gray-600">·</span>
                        {search.resultCount === 0 ? (
                          <span className="text-amber-400">0 results - Try removing year or set</span>
                        ) : (
                          <span>{search.resultCount} results</span>
                        )}
                      </>
                    )}
                    {search.cmv !== undefined && search.cmv !== null && (
                      <>
                        <span className="text-gray-600">·</span>
                        <span className="text-blue-400">Est. value: ${search.cmv.toLocaleString()}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Remove search"
                  onClick={(e) => handleRemove(search.timestamp, e as unknown as React.MouseEvent)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleRemove(search.timestamp, e as unknown as React.MouseEvent);
                    }
                  }}
                  className="flex-shrink-0 p-1 text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </span>
              </button>
            );
          }

          // Card item
          const card = item.data;
          return (
            <div
              key={`card-${card.id}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-all duration-150"
            >
              {/* Thumbnail or icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 overflow-hidden">
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt={card.player_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{card.player_name}</p>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>Added {formatTimeAgo(card.created_at)}</span>
                  {card.purchase_price && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span className="text-blue-400">Paid: ${card.purchase_price.toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
