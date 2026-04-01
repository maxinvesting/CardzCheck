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

  const renderShell = (content: React.ReactNode, showSkeleton = false) => (
    <section className="overflow-hidden rounded-xl border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface,#ffffff)]">
      <div className="flex items-center justify-between border-b border-[color:var(--biz-border,#e5e7eb)] px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[color:var(--biz-text,#111827)]">
          Recent activity
        </h2>
        {searches.length > 0 && !showSkeleton && (
          <button
            onClick={handleClearAll}
            className="text-xs font-medium text-[color:var(--biz-muted,#6b7280)] hover:text-[color:var(--biz-text,#111827)] transition-colors"
          >
            Clear searches
          </button>
        )}
      </div>
      {content}
    </section>
  );

  // Loading state
  if (!mounted) {
    return renderShell(
      <div className="p-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="mb-2 h-10 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)] last:mb-0"
          />
        ))}
      </div>,
      true
    );
  }

  // Empty state
  if (displayItems.length === 0) {
    return renderShell(
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--biz-surface-soft,#f9fafb)]">
          <svg
            className="h-5 w-5 text-[color:var(--biz-muted,#6b7280)]"
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
        <p className="text-sm text-[color:var(--biz-muted,#6b7280)]">No recent activity</p>
        <p className="mt-1 text-xs text-[color:var(--biz-muted,#9ca3af)]">
          Your searches and cards will appear here.
        </p>
      </div>
    );
  }

  return renderShell(
    <div className="px-2 py-1">
      {/* Activity List */}
      <div className="p-1">
        {displayItems.map((item, index) => {
          if (item.type === "search") {
            const search = item.data;
            return (
              <button
                key={`search-${search.timestamp}`}
                onClick={() => handleSearchClick(search)}
                className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
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
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-medium text-[color:var(--biz-text,#111827)]">
                    {search.query}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[color:var(--biz-muted,#6b7280)]">
                    <span>{formatTimeAgo(search.timestamp)}</span>
                    {search.resultCount !== undefined && (
                      <>
                        <span className="text-gray-300">·</span>
                        {search.resultCount === 0 ? (
                          <span className="text-amber-600">
                            0 results · Try removing year or set
                          </span>
                        ) : (
                          <span>{search.resultCount} results</span>
                        )}
                      </>
                    )}
                    {search.cmv !== undefined && search.cmv !== null && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-[color:var(--biz-primary,#0b7a4b)]">
                          Est. value: ${search.cmv.toLocaleString()}
                        </span>
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
                  className="flex-shrink-0 cursor-pointer p-1 text-[color:var(--biz-muted,#9ca3af)] opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
            >
              {/* Thumbnail or icon */}
              <div className="flex-shrink-0 h-8 w-8 overflow-hidden rounded-lg bg-blue-500/10">
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[color:var(--biz-text,#111827)]">
                  {card.player_name}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[color:var(--biz-muted,#6b7280)]">
                  <span>Added {formatTimeAgo(card.created_at)}</span>
                  {card.purchase_price && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-[color:var(--biz-primary,#0b7a4b)]">
                        Paid: ${card.purchase_price.toLocaleString()}
                      </span>
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
