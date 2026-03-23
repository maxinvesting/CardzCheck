"use client";

import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";
import {
  buildListingTitle,
  formatUsd,
  getCmvDeltaPresentation,
  getEbayStorefrontPresentation,
  getGradeChipClass,
  getShippingLabel,
} from "./shop-formatters";

interface ShopListingCardProps {
  listing?: ShopListing;
  skeleton?: boolean;
  onQuickView?: (listing: ShopListing) => void;
  isBusiness?: boolean;
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
  isBusiness = false,
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
  const ebay = getEbayStorefrontPresentation(listing.price, listing.ebay_storefront_price);
  const businessPrice = isBusiness ? listing.price * 0.99 : null;
  const shippingLine = `${getShippingLabel(listing.shipping_cost)} • Ships in 1-2 days`;

  const normalizedGrade = (listing.grade ?? "").toLowerCase();
  const isGraded =
    normalizedGrade.length > 0 &&
    !normalizedGrade.includes("raw") &&
    !normalizedGrade.includes("ungraded");

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
          <Link href={detailHref} className="min-w-0 flex-1 min-h-[44px] flex items-center">
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

        {isGraded && (
          <div className="flex items-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 text-emerald-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] font-medium text-emerald-600">
              Verified slab
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          {/* Subscriber price */}
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatUsd(Number(listing.price), 2)}
            </div>
            {ebay.hasEbaySavings && ebay.ebayPrice && (
              <div className="text-sm text-slate-400 line-through tabular-nums">
                {ebay.ebayPrice}
              </div>
            )}
          </div>

          {/* eBay storefront savings — primary when available */}
          {ebay.hasEbaySavings && ebay.savingsAmount && ebay.savingsPct !== null ? (
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                <span className="font-medium text-emerald-600">
                  Save {ebay.savingsAmount} ({ebay.savingsPct}%)
                </span>
                <span className="text-slate-400">vs. our eBay storefront</span>
              </div>
              {/* Optional: comps note — secondary, shown only when supported */}
              {cmv.cmvLabel && cmv.deltaLabel.includes("below market") && (
                <div className="text-[11px] text-emerald-600">
                  Also below market comps
                </div>
              )}
            </div>
          ) : (
            /* Fallback: show CMV info when no eBay storefront price set */
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
              {cmv.cmvLabel ? (
                <span className="text-slate-500">{cmv.cmvLabel}</span>
              ) : null}
              <span className={cmv.deltaClass}>{cmv.deltaLabel}</span>
            </div>
          )}

          {/* Business price — shown when user has business tier */}
          {businessPrice !== null && (
            <div className="flex items-center gap-2 rounded-lg bg-cyan-50 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                Your price
              </span>
              <span className="text-sm font-semibold tabular-nums text-cyan-800">
                {formatUsd(businessPrice, 2)}
              </span>
              <span className="text-[11px] text-cyan-600">
                (1% business discount)
              </span>
            </div>
          )}

          {/* Subscriber badge */}
          {!isBusiness && (
            <div className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
              Subscriber Price
            </div>
          )}
        </div>

        {listing.description && (
          <p className="line-clamp-2 text-xs text-slate-500">
            {listing.description}
          </p>
        )}

        <p className="text-xs text-slate-500">{shippingLine}</p>

        {listing.ebay_comp_url && (
          <a
            href={listing.ebay_comp_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:text-cyan-600 hover:underline"
          >
            View eBay comp
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        )}

        <button
          onClick={handleAddToCart}
          disabled={!canAdd}
          className={`mt-auto rounded-lg px-3 py-2.5 min-h-[44px] text-sm font-medium transition-colors ${
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
