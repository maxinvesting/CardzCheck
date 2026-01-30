"use client";

import { useState, useMemo } from "react";
import type { SearchFormData, SearchResult } from "@/types";

interface ListingRow {
  title: string;
  price: number;
  link: string;
  image?: string;
}

interface FeaturedSearchCardProps {
  results: SearchResult;
  formData?: SearchFormData;
  /** Called when user adds to watchlist. Card passes player_name, year, set_brand, etc. */
  onAddToWatchlist?: (data: {
    player_name: string;
    year?: string | null;
    set_brand?: string | null;
    parallel_variant?: string | null;
    condition?: string | null;
  }) => Promise<void>;
  canWatch?: boolean;
  isWatched?: boolean;
  userLoggedIn?: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

function toListings(results: SearchResult): ListingRow[] {
  const fromForSale = results._forSale?.items?.map((x) => ({
    title: x.title,
    price: x.price,
    link: x.url,
    image: x.image,
  }));
  if (fromForSale?.length) return fromForSale;
  const fromComps = (results.comps ?? []).map((c) => ({
    title: c.title,
    price: c.price,
    link: c.link,
    image: c.image,
  }));
  return fromComps;
}

export default function FeaturedSearchCard({
  results,
  formData,
  onAddToWatchlist,
  canWatch = false,
  isWatched = false,
  userLoggedIn = false,
}: FeaturedSearchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  const query = results.query;
  const est = results._estimatedSaleRange;
  const hasEstimate = est?.pricingAvailable && est.estimatedSaleRange;
  const cmv = results.stats?.cmv ?? 0;
  const items = useMemo(() => toListings(results), [results]);
  const firstImage = items[0]?.image;

  const handleWatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAddToWatchlist || !canWatch || watchLoading) return;
    setWatchLoading(true);
    try {
      await onAddToWatchlist({
        player_name: formData?.player_name ?? query,
        year: formData?.year ?? null,
        set_brand: formData?.set_name ?? null,
        parallel_variant: formData?.parallel_type ?? null,
        condition: formData?.grade ?? null,
      });
    } finally {
      setWatchLoading(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((e) => !e)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setExpanded((ex) => !ex)}
      className="bg-gray-800/60 border border-gray-700/60 rounded-xl overflow-hidden transition-all hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    >
      {/* Collapsed: most relevant result preview */}
      <div className="p-4 flex items-center gap-4">
        {firstImage && (
          <img
            src={firstImage}
            alt=""
            className="w-16 h-20 object-cover rounded-lg flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">{query}</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {items.length} active listings
            {hasEstimate && ` · Est. ${formatPrice(est!.estimatedSaleRange!.low)}–${formatPrice(est!.estimatedSaleRange!.high)}`}
            {!expanded && " · Click to expand"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasEstimate && (
            <span className="text-base font-bold text-blue-400">
              {formatPrice(cmv)} CMV
            </span>
          )}
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded: estimated CMV, recent sales, Add to Watchlist */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-700/60">
          <div className="mt-4 space-y-4">
            {/* Estimated CMV + range */}
            {hasEstimate && est!.estimatedSaleRange && (
              <div className="p-4 bg-gray-900/50 rounded-xl">
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  Estimated from active listings (Beta)
                </h3>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-2xl font-bold text-white">
                    {formatPrice(est!.estimatedSaleRange.low)} – {formatPrice(est!.estimatedSaleRange.high)}
                  </span>
                  <span className="text-sm text-gray-500">
                    CMV {formatPrice(cmv)} · {est!.marketAsk?.count ?? 0} listings
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {est!.estimatedSaleRange.confidence} confidence
                </p>
              </div>
            )}

            {/* Recent sales / current listings */}
            {items.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">
                  Current listings
                </h3>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {items.slice(0, 12).map((item, i) => (
                    <li key={i}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/60 text-left"
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt=""
                            className="w-10 h-12 object-cover rounded"
                          />
                        )}
                        <span className="flex-1 text-sm text-gray-300 truncate">{item.title}</span>
                        <span className="text-sm font-medium text-white flex-shrink-0">
                          {formatPrice(item.price)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                {items.length > 12 && (
                  <p className="text-xs text-gray-500 mt-1">
                    +{items.length - 12} more
                  </p>
                )}
              </div>
            )}

            {/* Add to Watchlist — simple button */}
            {userLoggedIn && (
              <div className="pt-2">
                {isWatched ? (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Added to watchlist
                  </div>
                ) : canWatch ? (
                  <button
                    type="button"
                    onClick={handleWatch}
                    disabled={watchLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {watchLoading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                    Add to Watchlist
                  </button>
                ) : (
                  <p className="text-sm text-gray-500">
                    Watchlist is a Pro feature. Upgrade to track this card.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
