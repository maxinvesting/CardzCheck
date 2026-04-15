"use client";

import Link from "next/link";
import type { SubscriptionTier } from "@/lib/subscription-tier";
import type { ShopListing } from "@/types/shop";
import { CardImage } from "@/components/CardImage";
import {
  buildListingTitle,
  formatUsd,
  getCmvDeltaPresentation,
  getEbayStorefrontPresentation,
  getGradeChipClass,
} from "./shop-formatters";
import { isListingAvailable } from "./shop-hero-listings";

interface ShopHeroListingCardProps {
  listing: ShopListing;
  userTier?: SubscriptionTier | null;
}

export default function ShopHeroListingCard({
  listing,
  userTier,
}: ShopHeroListingCardProps) {
  const isLocked = !userTier || userTier === "free";
  const isAvailable = isListingAvailable(listing);
  const title = buildListingTitle(listing);
  const detailHref = isLocked ? "/upgrade" : `/shop/${listing.id}`;
  const ebay = getEbayStorefrontPresentation(
    listing.price,
    listing.ebay_storefront_price
  );
  const cmv = getCmvDeltaPresentation(listing.price, listing.cmv);

  const savingsLine = ebay.hasEbaySavings && ebay.savingsAmount
    ? `Save ${ebay.savingsAmount}${
        ebay.savingsPct !== null ? ` (${ebay.savingsPct}%)` : ""
      } vs. our eBay storefront`
    : cmv.deltaLabel.includes("below market")
    ? cmv.deltaLabel
    : cmv.cmvLabel
    ? `${cmv.cmvLabel} · ${cmv.deltaLabel}`
    : cmv.deltaLabel;

  return (
    <article
      data-testid="shop-hero-card"
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.07)]"
    >
      <Link href={detailHref} className="block">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-50">
          <CardImage
            image={listing.trusted_image}
            alt={title}
            aspectClassName="aspect-[4/5]"
            className="rounded-none border-0 bg-transparent"
            imageClassName="transition-transform duration-300 group-hover:scale-[1.02]"
            fallbackClassName="bg-transparent"
            loading="eager"
          />
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

        {isLocked ? (
          <div className="relative rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="pointer-events-none select-none blur-sm">
              <div className="text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {formatUsd(Number(listing.price), 2)}
              </div>
              <div className="mt-1 text-xs text-cyan-700">
                Subscriber pricing inside
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="h-5 w-5 text-slate-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {formatUsd(Number(listing.price), 2)}
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-slate-500">
              {savingsLine}
            </p>
          </div>
        )}

        <Link
          href={detailHref}
          className={`mt-auto inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
            isLocked
              ? "bg-cyan-600 text-white hover:bg-cyan-500"
              : isAvailable
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {isLocked ? "Unlock pricing" : isAvailable ? "View deal" : "View details"}
        </Link>
      </div>
    </article>
  );
}
