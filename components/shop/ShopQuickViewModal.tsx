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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-200/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-slate-900">Quick view</h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 transition-colors hover:text-slate-900"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt={`${listing.player_name} ${listing.year}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-500">
                No image
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-slate-900">{listing.player_name}</h4>
            <p className="mt-0.5 text-sm text-slate-600">
              {listing.year} {listing.set_brand}
              {listing.parallel_variant ? ` ${listing.parallel_variant}` : ""} • {listing.grade}
            </p>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 tabular-nums">
              ${Number(listing.price).toFixed(2)}
            </span>
            {listing.cmv != null && listing.cmv > 0 && (
              <span className="text-sm text-slate-600">
                CMV: ${listing.cmv.toFixed(0)}
                {cmvDelta != null && (
                  <span className={cmvDelta < 0 ? "text-emerald-600" : "text-amber-600"}>
                    {" "}
                    ({cmvDelta > 0 ? "+" : ""}
                    {cmvDelta}%)
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
                  className="flex-1 rounded-lg bg-cyan-600 px-4 py-3 font-medium text-white transition-colors hover:bg-cyan-500"
                >
                  Add to cart
                </button>
                <Link
                  href={`/shop/${listing.id}`}
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-center font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
                >
                  View details
                </Link>
              </>
            ) : (
              <div className="w-full rounded-lg bg-slate-100 px-4 py-3 text-center font-medium text-slate-500">
                Sold
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
