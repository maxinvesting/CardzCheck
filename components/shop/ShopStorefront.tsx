"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ShopListing } from "@/types/shop";

interface ShopStorefrontProps {
  initialListings: ShopListing[];
}

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "player", label: "Player A-Z" },
] as const;

export default function ShopStorefront({ initialListings }: ShopStorefrontProps) {
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [featuredFilter, setFeaturedFilter] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("newest");

  const filtered = useMemo(() => {
    let list = [...initialListings];
    if (sportFilter) {
      list = list.filter((l) => l.sport === sportFilter);
    }
    if (featuredFilter) {
      list = list.filter((l) => l.featured);
    }
    switch (sort) {
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "player":
        list.sort((a, b) => a.player_name.localeCompare(b.player_name));
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return list;
  }, [initialListings, sportFilter, featuredFilter, sort]);

  const sports = useMemo(() => {
    const set = new Set(initialListings.map((l) => l.sport).filter(Boolean));
    return Array.from(set).sort();
  }, [initialListings]);

  const activeCount = initialListings.filter((l) => l.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          CardzCheck Shop
        </h1>
        <p className="mt-2 text-gray-400 max-w-xl mx-auto">
          Graded sports cards from the CardzCheck collection. Browse, add to
          cart, and checkout securely.
        </p>
      </section>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-800">
        <span className="text-gray-400 text-sm">
          {activeCount} active listings
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter pills */}
          <button
            onClick={() => setFeaturedFilter(!featuredFilter)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              featuredFilter
                ? "bg-cyan-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Featured
          </button>
          {sports.map((sportName) => (
            <button
              key={sportName}
              onClick={() => setSportFilter(sportFilter === sportName ? null : sportName)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                sportFilter === sportName
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {sportName}
            </button>
          ))}
          {/* Sort */}
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as (typeof SORTS)[number]["value"])
            }
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm border border-gray-700 focus:border-cyan-500 focus:outline-none"
          >
            {SORTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map((listing) => (
          <Link
            key={listing.id}
            href={`/shop/${listing.id}`}
            className="block rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden hover:border-cyan-500/50 transition-colors group"
          >
            <div className="aspect-[3/4] bg-gray-800 relative overflow-hidden">
              {listing.thumbnail_url || listing.image_urls?.[0] ? (
                <img
                  src={listing.thumbnail_url || listing.image_urls[0]}
                  alt={`${listing.player_name} ${listing.year}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  No image
                </div>
              )}
              {listing.featured && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-cyan-600 text-white text-xs font-medium rounded">
                  Featured
                </span>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-white truncate">
                {listing.player_name}
              </h3>
              <p className="text-sm text-gray-400 mt-0.5">
                {listing.year} {listing.set_brand}
                {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""}{" "}
                • {listing.grade}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-cyan-400 font-semibold">
                  ${Number(listing.price).toFixed(2)}
                </span>
                {listing.cmv != null && (
                  <span className="text-xs text-gray-500">
                    CMV ${Number(listing.cmv).toFixed(0)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          No listings match your filters.
        </div>
      )}
    </div>
  );
}
