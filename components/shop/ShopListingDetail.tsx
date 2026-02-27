"use client";

import { useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import ShopListingCard from "./ShopListingCard";
import type { ShopListing } from "@/types/shop";

interface ShopListingDetailProps {
  listing: ShopListing;
  relatedListings?: ShopListing[];
}

const ACCORDIONS = [
  {
    id: "shipping",
    title: "Shipping",
    content:
      "All orders ship via BMWT (Bubble Mailer with Tracking). Typically ships within 1–2 business days. Domestic US only.",
  },
  {
    id: "returns",
    title: "Returns",
    content:
      "Returns accepted within 7 days if item is not as described. Buyer pays return shipping. Contact before returning.",
  },
  {
    id: "authenticity",
    title: "Authenticity",
    content:
      "All graded cards include PSA/BGS/SGC certification. Cert numbers are listed. Photos show actual condition.",
  },
  {
    id: "contact",
    title: "Contact",
    content: "support@cardzcheck.com",
  },
] as const;

export default function ShopListingDetail({
  listing,
  relatedListings = [],
}: ShopListingDetailProps) {
  const { addItem } = useShopCart();
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  const images = listing.image_urls?.length
    ? listing.image_urls
    : listing.thumbnail_url
    ? [listing.thumbnail_url]
    : [];

  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

  const cmvDelta =
    listing.cmv != null && listing.cmv > 0
      ? Math.round(((listing.price - listing.cmv) / listing.cmv) * 100)
      : null;

  const handleAddToCart = () => {
    if (!canAdd || qty > available) return;
    addItem(listing.id, qty, listing);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleBuyNow = () => {
    if (!canAdd || qty > available) return;
    addItem(listing.id, qty, listing);
    window.location.href = "/shop/checkout";
  };

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-[3/4] bg-gray-900 rounded-xl overflow-hidden border border-gray-800 group relative">
            {images[selectedImage] ? (
              <img
                src={images[selectedImage]}
                alt={`${listing.player_name} ${listing.year}`}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                No image available
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scroll-snap-x">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors scroll-snap-align ${
                    selectedImage === i
                      ? "border-cyan-500"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy Box + Details */}
        <div className="space-y-6">
          <div>
            <Link
              href="/shop"
              className="text-sm text-cyan-400 hover:text-cyan-300 mb-4 inline-block"
            >
              ← Back to Shop
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {listing.player_name}
            </h1>
            <p className="mt-1 text-gray-400">
              {listing.year} {listing.set_brand}
              {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""}
              {listing.card_number ? ` #${listing.card_number}` : ""}
            </p>
            <p className="mt-1 text-gray-400">
              Grade: {listing.grade}
              {listing.cert_number ? ` (Cert #${listing.cert_number})` : ""}
            </p>
          </div>

          {/* Buy Box */}
          <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 space-y-4">
            <div className="text-2xl font-bold text-cyan-400 tabular-nums">
              ${Number(listing.price).toFixed(2)}
            </div>
            <p className="text-sm text-gray-400">
              {canAdd ? `${available} in stock` : "Sold out"}
            </p>
            <p className="text-sm text-gray-400">
              Ships in 1–2 business days
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Secure checkout
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="text-sm text-gray-400">Quantity</label>
              <select
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                disabled={!canAdd}
                className="px-3 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
              >
                {Array.from({ length: Math.min(available, 10) }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                {available === 0 && <option value={0}>0</option>}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAddToCart}
                disabled={!canAdd}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  canAdd
                    ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {added ? "Added!" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!canAdd}
                className={`px-6 py-3 rounded-lg font-medium transition-colors border-2 ${
                  canAdd
                    ? "border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                    : "border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Buy Now
              </button>
            </div>
          </div>

          {/* CMV Module */}
          {listing.cmv != null && listing.cmv > 0 && (
            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                CardzCheck Market Value (CMV)
              </h3>
              <div className="flex items-baseline gap-4 flex-wrap">
                <span className="text-xl font-bold text-white tabular-nums">
                  ${Number(listing.cmv).toFixed(2)}
                </span>
                {cmvDelta != null && (
                  <span
                    className={
                      cmvDelta < 0
                        ? "text-emerald-400"
                        : cmvDelta > 0
                        ? "text-amber-400"
                        : "text-gray-400"
                    }
                  >
                    {cmvDelta < 0 ? "▼" : cmvDelta > 0 ? "▲" : "≈"} {Math.abs(cmvDelta)}% vs list
                  </span>
                )}
              </div>
              <p
                className="mt-2 text-xs text-gray-500"
                title="CMV is computed from recent comps"
              >
                CMV computed from recent comps
              </p>
            </div>
          )}

          {/* Trust Accordions */}
          <div className="space-y-2">
            {ACCORDIONS.map((acc) => (
              <div
                key={acc.id}
                className="rounded-lg border border-gray-800 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenAccordion(openAccordion === acc.id ? null : acc.id)
                  }
                  className="w-full px-4 py-3 text-left text-sm font-medium text-white bg-gray-900/50 hover:bg-gray-900 flex justify-between"
                >
                  {acc.title}
                  <span className="text-gray-400">
                    {openAccordion === acc.id ? "−" : "+"}
                  </span>
                </button>
                {openAccordion === acc.id && (
                  <div className="px-4 py-3 text-sm text-gray-400 border-t border-gray-800">
                    {acc.id === "contact" ? (
                      <a
                        href={`mailto:${acc.content}`}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        {acc.content}
                      </a>
                    ) : (
                      acc.content
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {listing.description && (
            <p className="text-gray-300">{listing.description}</p>
          )}
        </div>
      </div>

      {/* Related Items */}
      {relatedListings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">
            Related Items
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedListings.slice(0, 6).map((r) => (
              <ShopListingCard key={r.id} listing={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
