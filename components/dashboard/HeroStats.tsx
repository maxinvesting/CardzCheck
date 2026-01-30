"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CollectionItem, SearchFormData } from "@/types";

interface HeroStatsProps {
  items: CollectionItem[];
  loading?: boolean;
  onSearch?: (data: SearchFormData) => void;
}

const EXAMPLE_SEARCHES = [
  "2024 Optic Jayden Daniels Rated Rookie",
  "Prizm CJ Stroud Silver",
  "Jordan Fleer 1986 PSA 10",
];

export default function HeroStats({ items, loading, onSearch }: HeroStatsProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const cardCount = items.length;
  const totalValue = items.reduce((sum, item) => sum + (item.estimated_cmv || 0), 0);
  const cmvAvailableCount = items.filter((item) => item.estimated_cmv !== null).length;

  // Get most recent activity timestamp
  const lastActivity = items.length > 0
    ? new Date(items[0].created_at)
    : null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (onSearch) {
      onSearch({ player_name: searchQuery.trim() });
    } else {
      router.push(`/search?player=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleExampleClick = (example: string) => {
    setSearchQuery(example);
    if (onSearch) {
      onSearch({ player_name: example });
    } else {
      router.push(`/search?player=${encodeURIComponent(example)}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Hero skeleton */}
        <div className="flex-1 sm:flex-[3] bg-gradient-to-br from-gray-800 to-gray-800/80 rounded-xl p-5 border border-white/5 animate-pulse">
          <div className="h-3 bg-gray-700 rounded w-20 mb-3" />
          <div className="h-12 bg-gray-700 rounded w-32" />
        </div>
        {/* Secondary stats skeleton */}
        <div className="flex-1 sm:flex-[2] flex flex-col gap-3">
          <div className="flex-1 bg-gray-800/60 rounded-xl p-4 border border-white/5 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-12 mb-2" />
            <div className="h-6 bg-gray-700 rounded w-8" />
          </div>
          <div className="flex-1 bg-gray-800/60 rounded-xl p-4 border border-white/5 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-16 mb-2" />
            <div className="h-6 bg-gray-700 rounded w-12" />
          </div>
        </div>
      </div>
    );
  }

  // Empty state - Search-first hero
  if (cardCount === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 rounded-xl p-6 border border-white/5 shadow-lg shadow-black/20">
        <div className="max-w-xl mx-auto">
          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">
            Track a card's value
          </h2>
          <p className="text-sm text-gray-400 mb-5">
            Search comps, then add to your collection to track value over time.
          </p>

          {/* Search form */}
          <form onSubmit={handleSearchSubmit} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any card... (e.g., Jordan Fleer 1986 PSA 10)"
                className="flex-1 px-4 py-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!searchQuery.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Example chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {EXAMPLE_SEARCHES.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg transition-colors border border-gray-700/50"
              >
                {example}
              </button>
            ))}
          </div>

          {/* Advanced filters link */}
          <Link
            href="/search"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Advanced filters →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Hero: Collection Value */}
      <div className="flex-1 sm:flex-[3] bg-gradient-to-br from-gray-800 to-gray-800/80 rounded-xl p-5 border border-white/5 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 transition-all duration-200">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Collection Value
              </span>
            </div>
            <p className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
              {cmvAvailableCount > 0 ? formatCurrency(totalValue) : "CMV unavailable"}
            </p>
            {/* Trend indicator placeholder */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-xs text-gray-500">Based on estimated CMV</span>
            </div>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-xl">
            <svg
              className="w-6 h-6 text-blue-400"
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
        </div>
      </div>

      {/* Secondary Stats: Compact vertical stack */}
      <div className="flex-1 sm:flex-[2] flex flex-row sm:flex-col gap-3">
        {/* Cards Tracked */}
        <div className="flex-1 bg-gray-800/60 rounded-xl p-4 border border-white/5 hover:bg-gray-800/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cards Tracked
              </span>
              <p className="text-2xl font-bold text-white mt-0.5">{cardCount}</p>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
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
          </div>
        </div>

        {/* Last Activity */}
        <div className="flex-1 bg-gray-800/60 rounded-xl p-4 border border-white/5 hover:bg-gray-800/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Activity
              </span>
              <p className="text-lg font-bold text-white mt-0.5">
                {lastActivity ? formatTimeAgo(lastActivity) : "—"}
              </p>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
