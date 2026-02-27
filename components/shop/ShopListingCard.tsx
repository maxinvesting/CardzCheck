"use client";

import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";

interface ShopListingCardProps {
  listing: ShopListing;
  onQuickView?: (listing: ShopListing) => void;
}

function getGradeBadgeClass(grade: string): string {
  const g = (grade ?? "").toLowerCase();
  if (g.includes("10") || g === "psa 10" || g === "bgs 10" || g === "sgc 10") {
    return "bg-emerald-600/80 text-white";
  }
  if (g.includes("9") || g.includes("9.5")) {
    return "bg-blue-600/80 text-white";
  }
  if (g.includes("raw") || g === "" || g.includes("ungraded")) {
    return "bg-amber-600/80 text-white";
  }
  return "bg-gray-600/80 text-gray-200";
}

export default function ShopListingCard({ listing, onQuickView }: ShopListingCardProps) {
  const { addItem } = useShopCart();
  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;
  const isBelowCmv = listing.cmv != null && listing.cmv > 0 && listing.price < listing.cmv;
  const discountPct =
    listing.cmv != null && listing.cmv > 0
      ? Math.round(((listing.cmv - listing.price) / listing.cmv) * 100)
      : 0;
  const isPremium = listing.is_premium || listing.price >= 200;

  const cmvLine = (() => {
    if (listing.cmv == null || listing.cmv <= 0) return "≈ Market";
    const pct = Math.round(((listing.price - listing.cmv) / listing.cmv) * 100);
    if (pct < 0) return `CMV: $${listing.cmv.toFixed(0)} • ▼ ${Math.abs(pct)}%`;
    if (pct > 0) return `CMV: $${listing.cmv.toFixed(0)} • ▲ ${pct}%`;
    return `CMV: $${listing.cmv.toFixed(0)} • ≈ Market`;
  })();

  const cmvLineClass =
    listing.cmv != null && listing.cmv > 0 && listing.price < listing.cmv
      ? "text-emerald-400"
      : listing.cmv != null && listing.cmv > 0 && listing.price > listing.cmv
      ? "text-amber-400"
      : "text-gray-400";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    addItem(listing.id, 1, listing);
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    onQuickView?.(listing);
  };

  const imgUrl = listing.thumbnail_url || listing.image_urls?.[0];

  return (
    <Link
      href={`/shop/${listing.id}`}
      className="block rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden hover:border-cyan-500/60 transition-all duration-200 group"
    >
      <div className="aspect-[3/4] bg-gray-800 relative overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={`${listing.player_name} ${listing.year}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            No image
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${getGradeBadgeClass(
              listing.grade
            )}`}
          >
            {listing.grade || "Raw"}
          </span>
          {isBelowCmv && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-600/90 text-white">
              {discountPct}% BELOW CMV
            </span>
          )}
          {isPremium && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-cyan-600/90 text-white">
              Premium
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-white truncate">{listing.player_name}</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          {listing.year} {listing.set_brand}
          {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""} •{" "}
          {listing.grade}
        </p>
        <div className="mt-3">
          <span className="text-lg font-bold text-cyan-400 tabular-nums">
            ${Number(listing.price).toFixed(2)}
          </span>
          <p className={`text-xs mt-0.5 ${cmvLineClass}`}>{cmvLine}</p>
        </div>

        {canAdd ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAddToCart}
              className="flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
            >
              Add to Cart
            </button>
            <button
              onClick={handleQuickView}
              className="py-2 px-3 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors"
            >
              Quick View
            </button>
          </div>
        ) : (
          <div className="mt-4 py-2 px-3 rounded-lg bg-gray-800 text-gray-500 text-sm font-medium text-center">
            Sold
          </div>
        )}
      </div>
    </Link>
  );
}
