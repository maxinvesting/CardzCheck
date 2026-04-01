"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import ShopListingCard from "./ShopListingCard";
import ShopListingAiInsight from "./ShopListingAiInsight";
import ShopListingGradeAnalysis from "./ShopListingGradeAnalysis";
import type { ShopListing } from "@/types/shop";
import type { SubscriptionTier } from "@/lib/subscription-tier";
import {
  buildListingTitle,
  formatUsd,
  getCmvDeltaPresentation,
  getEbayStorefrontPresentation,
  getGradeChipClass,
  getShippingLabel,
} from "./shop-formatters";

interface ShopListingDetailProps {
  listing: ShopListing;
  relatedListings?: ShopListing[];
  userTier?: SubscriptionTier | null;
}

const POLICY_SECTIONS: Array<{
  id: "shipping" | "returns" | "authenticity";
  title: string;
  content: (listing: ShopListing) => string;
}> = [
  {
    id: "shipping",
    title: "Shipping",
    content: (listing) =>
      `${getShippingLabel(listing.shipping_cost)}. Orders leave our facility in 1-2 business days with tracking and secure packaging.`,
  },
  {
    id: "returns",
    title: "Returns",
    content: () =>
      "Returns are accepted within 7 days if an item arrives not as described. Contact support@cardzcheck.com before shipping a return.",
  },
  {
    id: "authenticity",
    title: "Authenticity",
    content: (listing) => {
      const certLine = listing.cert_number
        ? ` Certification #${listing.cert_number} is included in this listing.`
        : "";

      return `Every listing includes high-resolution photos of the exact card and clearly stated grade details.${certLine}`;
    },
  },
];

export default function ShopListingDetail({
  listing,
  relatedListings = [],
  userTier,
}: ShopListingDetailProps) {
  const isLocked = !userTier || userTier === "free";
  const isBusiness = userTier === "business";
  const { addItem } = useShopCart();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [openPolicy, setOpenPolicy] = useState<"shipping" | "returns" | "authenticity" | null>(
    "shipping"
  );

  const images = useMemo(() => {
    if (listing.image_urls?.length) return listing.image_urls;
    if (listing.thumbnail_url) return [listing.thumbnail_url];
    return [];
  }, [listing.image_urls, listing.thumbnail_url]);

  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

  const title = buildListingTitle(listing);
  const cmv = getCmvDeltaPresentation(listing.price, listing.cmv);
  const ebay = getEbayStorefrontPresentation(listing.price, listing.ebay_storefront_price);
  const shippingLabel = getShippingLabel(listing.shipping_cost);

  const normalizedGrade = (listing.grade ?? "").toLowerCase();
  const isGraded =
    normalizedGrade.length > 0 &&
    !normalizedGrade.includes("raw") &&
    !normalizedGrade.includes("ungraded");
  const isRaw =
    listing.condition === "raw" ||
    normalizedGrade === "" ||
    normalizedGrade.includes("raw") ||
    normalizedGrade.includes("ungraded");

  const pricingTransparencyText = (() => {
    if (listing.cmv == null || listing.cmv <= 0) {
      return "Estimated market value is currently unavailable for this listing.";
    }

    if (cmv.deltaLabel.includes("below market")) {
      return "Current price is below the estimated market value.";
    }

    if (cmv.deltaLabel.includes("above market")) {
      return "Current price is above the estimated market value.";
    }

    return "Current price is aligned with the estimated market value.";
  })();

  const handleAddToCart = () => {
    if (!canAdd || quantity > available) return;

    addItem(listing.id, quantity, listing);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleBuyNow = () => {
    if (!canAdd || quantity > available) return;

    addItem(listing.id, quantity, listing);
    window.location.href = "/shop/checkout";
  };

  return (
    <div className="space-y-12">
      <Link
        href="/shop"
        className="inline-flex items-center text-sm text-slate-600 transition-colors hover:text-cyan-700"
      >
        {"<- Back to deals"}
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="aspect-[4/5] bg-slate-100">
              {images[selectedImage] ? (
                <img
                  src={images[selectedImage]}
                  alt={title}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-500">
                  No image available
                </div>
              )}
            </div>
          </div>

          {images.length > 1 && (
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
              {images.map((imageUrl, index) => (
                <button
                  key={imageUrl + index}
                  onClick={() => setSelectedImage(index)}
                  className={`h-20 w-16 shrink-0 snap-start overflow-hidden rounded-lg border transition-colors sm:h-24 sm:w-20 ${
                    selectedImage === index
                      ? "border-cyan-500"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <header>
            <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600">
                {listing.card_number ? `Card #${listing.card_number} • ` : ""}
                {listing.sport || "Trading Cards"}
              </p>
              {isGraded && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Verified slab
                </span>
              )}
            </div>
          </header>

          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                {isLocked ? (
                  /* Blurred price for free users */
                  <div className="relative inline-block">
                    <div className="select-none blur-sm pointer-events-none">
                      <p className="text-3xl font-semibold tabular-nums text-slate-900">
                        {formatUsd(Number(listing.price), 2)}
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-start gap-1.5">
                      <svg className="h-5 w-5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium text-slate-500">Subscribers only</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-semibold tabular-nums text-slate-900">
                      {formatUsd(Number(listing.price), 2)}
                    </p>
                    {ebay.hasEbaySavings && ebay.ebayPrice && (
                      <p className="text-base text-slate-400 line-through tabular-nums">
                        {ebay.ebayPrice}
                      </p>
                    )}
                  </div>
                )}
                {!isLocked && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                    {isBusiness ? "Business — Free Shipping" : "Subscriber Price"}
                  </div>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getGradeChipClass(
                  listing.grade
                )}`}
              >
                {listing.grade || "Raw"}
              </span>
            </div>

            {/* Free user upgrade wall */}
            {isLocked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-center">
                <svg className="mx-auto h-8 w-8 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
                <p className="mt-2 text-sm font-semibold text-amber-800">
                  Subscribe to unlock this price
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Pro and Business subscribers get exclusive pricing — at least 13.5% below our eBay storefront.
                </p>
                <Link
                  href="/upgrade"
                  className="mt-4 inline-block rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
                >
                  View plans →
                </Link>
              </div>
            ) : (
              <>
                {/* Savings vs eBay storefront — primary pricing context */}
                {ebay.hasEbaySavings && ebay.savingsAmount && ebay.savingsPct !== null ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700">
                      Subscriber savings
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline gap-2">
                      <span className="text-lg font-semibold text-emerald-700 tabular-nums">
                        Save {ebay.savingsAmount} ({ebay.savingsPct}%)
                      </span>
                      <span className="text-sm text-emerald-600">vs. our eBay storefront</span>
                    </div>
                    {cmv.cmvLabel && cmv.deltaLabel.includes("below market") && (
                      <p className="mt-1.5 text-xs text-emerald-600">
                        Also priced below estimated market comps ({cmv.cmvLabel})
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Est. Market Value
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-slate-700">
                        {cmv.cmvLabel ?? "Est. Market Value currently unavailable"}
                      </span>
                      <span className={cmv.deltaClass}>{cmv.deltaLabel}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {pricingTransparencyText}
                    </p>
                  </div>
                )}

                <div className="space-y-1 text-sm text-slate-600">
                  {listing.cert_number && <p>Certification #{listing.cert_number}</p>}
                  <p>{isBusiness ? "Free shipping" : shippingLabel} • Ships in 1-2 days</p>
                </div>

                {listing.accepts_offers && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    Offers welcome — contact CardzCheck if you&apos;d like to discuss price on this
                    card.
                  </p>
                )}

                {listing.ebay_comp_url && (
                  <a
                    href={listing.ebay_comp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-cyan-700 hover:text-cyan-600 hover:underline"
                  >
                    View eBay comp
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>
                )}

                <div className="flex items-center gap-3">
                  <label htmlFor="listing-qty" className="text-sm text-slate-600">
                    Qty
                  </label>
                  <select
                    id="listing-qty"
                    value={quantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                    disabled={!canAdd}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {Array.from({ length: Math.min(Math.max(available, 1), 10) }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-500">{available} available</span>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    onClick={handleAddToCart}
                    disabled={!canAdd}
                    className={`rounded-lg px-5 py-3 text-sm font-medium transition-colors ${
                      canAdd
                        ? "bg-cyan-600 text-white hover:bg-cyan-500"
                        : "cursor-not-allowed bg-slate-200 text-slate-500"
                    }`}
                  >
                    {added ? "Added" : "Add to Cart"}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={!canAdd}
                    className={`rounded-lg border px-5 py-3 text-sm font-medium transition-colors ${
                      canAdd
                        ? "border-slate-300 text-slate-800 hover:border-slate-400"
                        : "cursor-not-allowed border-slate-200 text-slate-400"
                    }`}
                  >
                    Buy now
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            {POLICY_SECTIONS.map((policy) => (
              <article
                key={policy.id}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                <button
                  onClick={() =>
                    setOpenPolicy((current) =>
                      current === policy.id ? null : policy.id
                    )
                  }
                  className="flex w-full items-center justify-between bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                >
                  {policy.title}
                  <span className="text-slate-500">{openPolicy === policy.id ? "-" : "+"}</span>
                </button>
                {openPolicy === policy.id && (
                  <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                    {policy.content(listing)}
                  </div>
                )}
              </article>
            ))}
          </div>

          {listing.description && (
            <p className="text-sm leading-relaxed text-slate-600">{listing.description}</p>
          )}

          <ShopListingAiInsight listingId={listing.id} />

          {isRaw && <ShopListingGradeAnalysis listingId={listing.id} />}
        </section>
      </div>

      {relatedListings.length > 0 && (
        <section className="space-y-5 border-t border-slate-200 pt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Related items</h2>
              <p className="mt-1 text-sm text-slate-600">
                Similar picks by category and price point.
              </p>
            </div>
            <Link
              href="/shop"
              className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
            >
              Browse all
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {relatedListings.slice(0, 6).map((related) => (
              <ShopListingCard key={related.id} listing={related} userTier={userTier} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
