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

const ACCORDIONS: Array<{
  id: string;
  title: string;
  content: string | ((l: ShopListing) => string);
}> = [
  {
    id: "condition",
    title: "Condition details",
    content: (l) =>
      `Grade: ${l.grade}${l.cert_number ? ` (Cert #${l.cert_number})` : ""}. ${
        l.description ||
        "All graded cards are PSA/BGS/SGC certified. Photos show actual condition."
      }`,
  },
  {
    id: "shipping",
    title: "Shipping policy",
    content:
      "All orders ship via BMWT (Bubble Mailer with Tracking). Typically ships within 1–2 business days. Domestic US only.",
  },
  {
    id: "returns",
    title: "Returns policy",
    content:
      "Returns accepted within 7 days if item is not as described. Buyer pays return shipping. Contact support@cardzcheck.com before returning.",
  },
  {
    id: "authentication",
    title: "Authentication",
    content:
      "All graded cards include PSA/BGS/SGC certification. Cert numbers are listed. Photos show actual condition.",
  },
];

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

  const pricingTransparencyLine = (() => {
    if (listing.cmv == null || listing.cmv <= 0)
      return "CMV is computed from recent comparable sales.";
    if (cmvDelta != null && cmvDelta < 0)
      return `This card is priced ${Math.abs(cmvDelta)}% below its recent comparable market value.`;
    if (cmvDelta != null && cmvDelta > 0)
      return `This card is priced ${cmvDelta}% above its recent comparable market value.`;
    return "This card is priced at market based on recent comparable sales.";
  })();

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
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="aspect-[3/4] bg-gray-900/80 rounded-xl overflow-hidden border border-gray-700/50 shadow-md">
            {images[selectedImage] ? (
              <img
                src={images[selectedImage]}
                alt={`${listing.player_name} ${listing.year}`}
                className="w-full h-full object-contain transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                No image available
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedImage === i
                      ? "border-cyan-500/70"
                      : "border-gray-700/60 hover:border-gray-600"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy Box + Details - sticky on desktop */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <Link
              href="/shop"
              className="text-sm text-gray-500 hover:text-cyan-400 transition-colors mb-4 inline-block"
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
          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-700/50 shadow-sm space-y-5">
            <div className="text-2xl font-bold text-white tabular-nums">
              ${Number(listing.price).toFixed(2)}
            </div>

            {listing.cmv != null && listing.cmv > 0 && (
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-sm text-gray-500">
                  CMV ${Number(listing.cmv).toFixed(0)}
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
                    {cmvDelta < 0 ? "▼" : cmvDelta > 0 ? "▲" : "≈"}{" "}
                    {Math.abs(cmvDelta)}%
                  </span>
                )}
              </div>
            )}

            <p className="text-sm text-gray-400 leading-relaxed">
              {pricingTransparencyLine}
            </p>

            <div className="space-y-2 text-sm text-gray-500">
              <p>Ships in 1–2 business days</p>
              <p>Returns within 7 days if not as described</p>
              <div className="flex items-center gap-2 pt-1">
                <svg
                  className="w-4 h-4 text-gray-600"
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
                Secure Stripe checkout
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="text-sm text-gray-400">Quantity</label>
              <select
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                disabled={!canAdd}
                className="px-3 py-2 rounded-lg bg-gray-800/80 text-white border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50 text-sm"
              >
                {Array.from({ length: Math.min(available, 10) }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                {available === 0 && <option value={0}>0</option>}
              </select>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleAddToCart}
                disabled={!canAdd}
                className={`px-6 py-3 rounded-lg font-medium transition-colors text-sm ${
                  canAdd
                    ? "bg-cyan-600 hover:bg-cyan-700 text-white"
                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                {added ? "Added!" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                disabled={!canAdd}
                className={`px-6 py-3 rounded-lg font-medium transition-colors border text-sm ${
                  canAdd
                    ? "border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white"
                    : "border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Buy Now
              </button>
            </div>
          </div>

          {/* Accordions */}
          <div className="space-y-2">
            {ACCORDIONS.map((acc) => (
              <div
                key={acc.id}
                className="rounded-lg border border-gray-700/50 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenAccordion(openAccordion === acc.id ? null : acc.id)
                  }
                  className="w-full px-4 py-3 text-left text-sm font-medium text-white bg-gray-900/30 hover:bg-gray-900/50 flex justify-between transition-colors"
                >
                  {acc.title}
                  <span className="text-gray-500">
                    {openAccordion === acc.id ? "−" : "+"}
                  </span>
                </button>
                {openAccordion === acc.id && (
                  <div className="px-4 py-3 text-sm text-gray-400 border-t border-gray-800">
                    {typeof acc.content === "function"
                      ? acc.content(listing)
                      : acc.content}
                  </div>
                )}
              </div>
            ))}
          </div>

          {listing.description && (
            <p className="text-gray-400 text-sm leading-relaxed">
              {listing.description}
            </p>
          )}
        </div>
      </div>

      {/* Related Items */}
      {relatedListings.length > 0 && (
        <section className="pt-4">
          <h2 className="text-lg font-semibold text-white mb-6">
            Related Items
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {relatedListings.slice(0, 6).map((r) => (
              <ShopListingCard key={r.id} listing={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
