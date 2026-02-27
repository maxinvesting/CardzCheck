"use client";

import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";

interface ShopListingCardProps {
  listing: ShopListing;
  onQuickView?: (listing: ShopListing) => void;
}

function getGradeChipClass(grade: string): string {
  const g = (grade ?? "").toLowerCase();
  if (g.includes("10") || g === "psa 10" || g === "bgs 10" || g === "sgc 10") {
    return "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50";
  }
  if (g.includes("9") || g.includes("9.5")) {
    return "bg-blue-900/60 text-blue-300 border border-blue-700/50";
  }
  if (g.includes("raw") || g === "" || g.includes("ungraded")) {
    return "bg-amber-900/60 text-amber-300 border border-amber-700/50";
  }
  return "bg-gray-800/80 text-gray-300 border border-gray-700/60";
}

export default function ShopListingCard({
  listing,
  onQuickView,
}: ShopListingCardProps) {
  const { addItem } = useShopCart();
  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;
  const isBelowCmv =
    listing.cmv != null && listing.cmv > 0 && listing.price < listing.cmv;
  const discountPct =
    listing.cmv != null && listing.cmv > 0
      ? Math.round(((listing.cmv - listing.price) / listing.cmv) * 100)
      : 0;
  const isPremium = listing.is_premium || listing.price >= 200;

  const cmvValue =
    listing.cmv != null && listing.cmv > 0
      ? `CMV $${listing.cmv.toFixed(0)}`
      : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAdd) return;
    addItem(listing.id, 1, listing);
  };

  const imgUrl = listing.thumbnail_url || listing.image_urls?.[0];
  const title = [listing.player_name, listing.year, listing.set_brand]
    .filter(Boolean)
    .join(" ");

  const detailHref = `/shop/${listing.id}`;

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/50 overflow-hidden hover:border-gray-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group">
      <Link href={detailHref} className="block">
        <div className="aspect-[3/4] bg-gray-800/80 relative overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No image
          </div>
        )}

        {isPremium && (
          <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium rounded bg-amber-800/90 text-amber-200 border border-amber-600/50">
            Premium
          </span>
        )}
        </div>

        <div className="p-4 space-y-3">
        <h3 className="font-semibold text-white line-clamp-2 leading-snug">
          {title}
          {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""}
        </h3>
        <span
          className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${getGradeChipClass(
            listing.grade
          )}`}
        >
          {listing.grade || "Raw"}
        </span>

        <div className="space-y-1">
          <span className="text-xl font-bold text-white tabular-nums">
            ${Number(listing.price).toFixed(2)}
          </span>
          {cmvValue && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{cmvValue}</span>
              {isBelowCmv && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                  ▼ {discountPct}% Below Market
                </span>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          {"Free shipping • Ships in 1-2 days"}
        </p>
        </div>
      </Link>

      {canAdd ? (
        <div className="px-4 pb-4 pt-1 flex gap-2">
          <button
            onClick={handleAddToCart}
            className="flex-1 py-2.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            Add to Cart
          </button>
          <Link
            href={detailHref}
            className="py-2.5 px-3 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors text-center"
          >
            View Details
          </Link>
        </div>
      ) : (
        <div className="px-4 pb-4 pt-1">
          <div className="py-2.5 rounded-lg bg-gray-800/80 text-gray-500 text-sm font-medium text-center">
            Sold
          </div>
        </div>
      )}
    </div>
  );
}
