"use client";

import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";
import type { ShopListing } from "@/types/shop";

interface ShopQuickViewModalProps {
  listing: ShopListing | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShopQuickViewModal({
  listing,
  isOpen,
  onClose,
}: ShopQuickViewModalProps) {
  const { addItem } = useShopCart();

  if (!isOpen || !listing) return null;

  const available = Math.max(0, listing.quantity - listing.quantity_sold);
  const canAdd = available > 0;

  const cmvDelta =
    listing.cmv != null && listing.cmv > 0
      ? Math.round(((listing.price - listing.cmv) / listing.cmv) * 100)
      : null;

  const handleAddToCart = () => {
    if (!canAdd) return;
    addItem(listing.id, 1, listing);
    onClose();
  };

  const imgUrl = listing.thumbnail_url || listing.image_urls?.[0];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-800 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-white">Quick View</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="aspect-[3/4] bg-gray-800 rounded-lg overflow-hidden">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={`${listing.player_name} ${listing.year}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                No image
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-white">{listing.player_name}</h4>
            <p className="text-sm text-gray-400 mt-0.5">
              {listing.year} {listing.set_brand}
              {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""} • {listing.grade}
            </p>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-cyan-400 tabular-nums">
              ${Number(listing.price).toFixed(2)}
            </span>
            {listing.cmv != null && listing.cmv > 0 && (
              <span className="text-sm text-gray-400">
                CMV: ${listing.cmv.toFixed(0)}
                {cmvDelta != null && (
                  <span className={cmvDelta < 0 ? "text-emerald-400" : "text-amber-400"}>
                    {" "}
                    ({cmvDelta > 0 ? "+" : ""}{cmvDelta}%)
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            {canAdd ? (
              <>
                <button
                  onClick={handleAddToCart}
                  className="flex-1 py-3 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium transition-colors"
                >
                  Add to Cart
                </button>
                <Link
                  href={`/shop/${listing.id}`}
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 font-medium text-center transition-colors"
                >
                  View Details
                </Link>
              </>
            ) : (
              <div className="w-full py-3 px-4 rounded-lg bg-gray-800 text-gray-500 font-medium text-center">
                Sold
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
