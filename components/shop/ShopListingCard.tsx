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
  listing?: ShopListing;
  skeleton?: boolean;
  onQuickView?: (listing: ShopListing) => void;
}

function ShopListingCardSkeleton() {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="aspect-[4/5] border-b border-slate-200 bg-slate-100">
        <div className="h-full w-full animate-pulse bg-slate-200" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-2">
          <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="h-7 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-200" />
      </div>
    </article>
  );
}

export default function ShopListingCard({
  listing,
  skeleton = false,
}: ShopListingCardProps) {
  if (skeleton || !listing) {
    return <ShopListingCardSkeleton />;
  }

  const { addItem } = useShopCart();
  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

  const title = buildListingTitle(listing);
  const imgUrl = listing.thumbnail_url || listing.image_urls?.[0];
  const detailHref = `/shop/${listing.id}`;

  const cmv = getCmvDeltaPresentation(listing.price, listing.cmv);
  const shippingLine = `${getShippingLabel(listing.shipping_cost)} • Ships in 1-2 days`;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canAdd) return;

    addItem(listing.id, 1, listing);
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow duration-200 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]">
      <Link href={detailHref} className="block">
        <div className="aspect-[4/5] overflow-hidden bg-slate-100">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No image available
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900 transition-colors group-hover:text-cyan-700">
              {title}
            </h3>
          </Link>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${getGradeChipClass(
              listing.grade
            )}`}
          >
            {listing.grade || "Raw"}
          </span>
        </div>

        <div className="space-y-1">
          <div className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {formatUsd(Number(listing.price), 2)}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
            {cmv.cmvLabel ? (
              <span className="text-slate-600">{cmv.cmvLabel}</span>
            ) : (
              <span className="text-slate-500">CMV unavailable</span>
            )}
            <span className={cmv.deltaClass}>{cmv.deltaLabel}</span>
          </div>
        </div>

        <p className="text-xs text-slate-500">{shippingLine}</p>

        <button
          onClick={handleAddToCart}
          disabled={!canAdd}
          className={`mt-auto rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            canAdd
              ? "bg-cyan-600 text-white hover:bg-cyan-500"
              : "cursor-not-allowed bg-slate-200 text-slate-500"
          }`}
        >
          {canAdd ? "Add to Cart" : "Sold Out"}
        </button>
      </div>
    </article>
  );
}
