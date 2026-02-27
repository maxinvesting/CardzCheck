"use client";

import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";
import {
  buildListingTitle,
  formatUsd,
  getCmvDeltaPresentation,
  getGradeChipClass,
  getShippingLabel,
} from "./shop-formatters";

interface ShopListingCardProps {
  listing: ShopListing;
  onQuickView?: (listing: ShopListing) => void;
}

export default function ShopListingCard({ listing }: ShopListingCardProps) {
  const { addItem } = useShopCart();
  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

  const title = buildListingTitle(listing);
  const imgUrl = listing.thumbnail_url || listing.image_urls?.[0];
  const detailHref = `/shop/${listing.id}`;
  const isPremium = listing.is_premium || listing.price >= 200;

  const cmv = getCmvDeltaPresentation(listing.price, listing.cmv);
  const shippingLine = `${getShippingLabel(listing.shipping_cost)} - Ships in 1-2 days`;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canAdd) return;

    addItem(listing.id, 1, listing);
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/75 shadow-[0_6px_30px_rgba(2,12,22,0.3)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_20px_45px_rgba(6,18,30,0.45)]">
      <Link href={detailHref} className="relative block">
        <div className="aspect-[4/5] overflow-hidden border-b border-slate-800/80 bg-slate-900">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No image available
            </div>
          )}
        </div>

        {isPremium && (
          <span className="absolute left-3 top-3 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-medium tracking-wide text-cyan-200">
            Premium
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-100">
            {title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${getGradeChipClass(
              listing.grade
            )}`}
          >
            {listing.grade || "Raw"}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="text-2xl font-semibold tabular-nums text-white">
            {formatUsd(Number(listing.price), 2)}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {cmv.cmvLabel ? (
              <span className="text-slate-400">{cmv.cmvLabel}</span>
            ) : (
              <span className="text-slate-500">CMV unavailable</span>
            )}
            <span className={cmv.deltaClass}>{cmv.deltaLabel}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400">{shippingLine}</p>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            onClick={handleAddToCart}
            disabled={!canAdd}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              canAdd
                ? "bg-cyan-600 text-white hover:bg-cyan-500"
                : "cursor-not-allowed bg-slate-800 text-slate-500"
            }`}
          >
            {canAdd ? "Add to Cart" : "Sold Out"}
          </button>
          <Link
            href={detailHref}
            className="rounded-lg border border-slate-600/80 px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
          >
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}
