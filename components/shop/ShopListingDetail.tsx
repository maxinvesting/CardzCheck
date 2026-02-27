"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import ShopListingCard from "./ShopListingCard";
import type { ShopListing } from "@/types/shop";
import {
  buildListingTitle,
  formatUsd,
  getCmvDeltaPresentation,
  getGradeChipClass,
  getShippingLabel,
} from "./shop-formatters";

interface ShopListingDetailProps {
  listing: ShopListing;
  relatedListings?: ShopListing[];
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
}: ShopListingDetailProps) {
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
  const shippingLabel = getShippingLabel(listing.shipping_cost);

  const pricingTransparencyText = (() => {
    if (listing.cmv == null || listing.cmv <= 0) {
      return "CardzCheck CMV is generated from recent comparable sales and updates as new market data arrives.";
    }

    if (cmv.deltaLabel.includes("below market")) {
      return "This price is set below current comps to move inventory while keeping full market context visible.";
    }

    if (cmv.deltaLabel.includes("above market")) {
      return "This card carries a premium versus comps, usually driven by scarcity, eye appeal, or stronger sub-grades.";
    }

    return "Price is aligned to current CMV using recent comparable transactions.";
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
        className="inline-flex items-center text-sm text-slate-400 transition-colors hover:text-cyan-300"
      >
        {"<- Back to shop"}
      </Link>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/75 shadow-[0_12px_36px_rgba(2,12,22,0.35)]">
            <div className="aspect-[4/5] bg-slate-900">
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
                      ? "border-cyan-400/70"
                      : "border-slate-700/80 hover:border-slate-500"
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
            <h1 className="text-3xl font-semibold text-white">{title}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {listing.card_number ? `Card #${listing.card_number} - ` : ""}
              {listing.sport}
            </p>
          </header>

          <div className="space-y-5 rounded-2xl border border-slate-800/80 bg-slate-950/65 p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-3xl font-semibold tabular-nums text-white">
                {formatUsd(Number(listing.price), 2)}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getGradeChipClass(
                  listing.grade
                )}`}
              >
                {listing.grade || "Raw"}
              </span>
            </div>

            <div className="space-y-1 text-sm text-slate-400">
              {listing.cert_number && <p>Certification #{listing.cert_number}</p>}
              <p>{shippingLabel} - Ships in 1-2 days</p>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                CMV pricing transparency
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-300">
                  {cmv.cmvLabel ?? "CMV currently unavailable"}
                </span>
                <span className={cmv.deltaClass}>{cmv.deltaLabel}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {pricingTransparencyText}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="listing-qty" className="text-sm text-slate-400">
                Qty
              </label>
              <select
                id="listing-qty"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                disabled={!canAdd}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                    : "cursor-not-allowed bg-slate-800 text-slate-500"
                }`}
              >
                {added ? "Added" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!canAdd}
                className={`rounded-lg border px-5 py-3 text-sm font-medium transition-colors ${
                  canAdd
                    ? "border-slate-600 text-slate-100 hover:border-slate-400"
                    : "cursor-not-allowed border-slate-800 text-slate-500"
                }`}
              >
                Buy Now
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {POLICY_SECTIONS.map((policy) => (
              <article
                key={policy.id}
                className="overflow-hidden rounded-xl border border-slate-800/80"
              >
                <button
                  onClick={() =>
                    setOpenPolicy((current) =>
                      current === policy.id ? null : policy.id
                    )
                  }
                  className="flex w-full items-center justify-between bg-slate-950/60 px-4 py-3 text-left text-sm font-medium text-slate-100 transition-colors hover:bg-slate-900"
                >
                  {policy.title}
                  <span className="text-slate-500">{openPolicy === policy.id ? "-" : "+"}</span>
                </button>
                {openPolicy === policy.id && (
                  <div className="border-t border-slate-800/80 bg-slate-950/30 px-4 py-3 text-sm leading-relaxed text-slate-400">
                    {policy.content(listing)}
                  </div>
                )}
              </article>
            ))}
          </div>

          {listing.description && (
            <p className="text-sm leading-relaxed text-slate-400">{listing.description}</p>
          )}
        </section>
      </div>

      {relatedListings.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">Related items</h2>
              <p className="mt-1 text-sm text-slate-400">
                Similar picks by sport and price point.
              </p>
            </div>
            <Link
              href="/shop"
              className="text-sm text-slate-400 transition-colors hover:text-cyan-300"
            >
              Browse all
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {relatedListings.slice(0, 6).map((related) => (
              <ShopListingCard key={related.id} listing={related} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
