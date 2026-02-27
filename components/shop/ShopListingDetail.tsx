"use client";

import { useState } from "react";
import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";

interface ShopListingDetailProps {
  listing: ShopListing;
}

export default function ShopListingDetail({ listing }: ShopListingDetailProps) {
  const { addItem } = useShopCart();
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const images = listing.image_urls?.length
    ? listing.image_urls
    : listing.thumbnail_url
    ? [listing.thumbnail_url]
    : [];

  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Image gallery */}
      <div className="space-y-4">
        <div className="aspect-[3/4] bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
          {images[selectedImage] ? (
            <img
              src={images[selectedImage]}
              alt={`${listing.player_name} ${listing.year}`}
              className="w-full h-full object-contain"
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
                    ? "border-cyan-500"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
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

        {/* CMV comparison */}
        {listing.cmv != null && (
          <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Market Comparison
            </h3>
            <div className="flex items-baseline gap-4">
              <span className="text-2xl font-bold text-cyan-400">
                ${Number(listing.price).toFixed(2)}
              </span>
              <span className="text-gray-500">
                CMV: ${Number(listing.cmv).toFixed(2)}
              </span>
              {listing.cmv > 0 && (
                <span className="text-sm text-gray-500">
                  ({(((listing.price - listing.cmv) / listing.cmv) * 100).toFixed(0)}% vs CMV)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Shipping info */}
        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Shipping</h3>
          <p className="text-white">
            {listing.shipping_method.toUpperCase()} • ${Number(listing.shipping_cost).toFixed(2)}
          </p>
        </div>

        {listing.description && (
          <p className="text-gray-300">{listing.description}</p>
        )}

        {/* Add to cart / Buy now */}
        <div className="space-y-4 pt-4 border-t border-gray-800">
          <div className="flex items-center gap-4">
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
            <span className="text-sm text-gray-500">
              {available} in stock
            </span>
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
      </div>
    </div>
  );
}
