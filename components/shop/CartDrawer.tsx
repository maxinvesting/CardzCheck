"use client";

import { useShopCart } from "@/contexts/ShopCartContext";
import Link from "next/link";
import { buildListingTitle } from "./shop-formatters";
import { CardImage } from "@/components/CardImage";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateQuantity, totalItems, clearCart } = useShopCart();

  if (!isOpen) return null;

  const total = items.reduce((sum, item) => {
    const price = item.listing?.price ?? 0;
    const ship = item.listing?.shipping_cost ?? 0;
    return sum + (price + ship) * item.quantity;
  }, 0);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-200/60 lg:z-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-900">Cart ({totalItems})</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 transition-colors hover:text-slate-900"
            aria-label="Close cart"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">Your cart is empty</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.listingId}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <CardImage
                    image={item.listing?.trusted_image ?? null}
                    alt={item.listing ? buildListingTitle(item.listing) : "Cart item"}
                    aspectClassName="h-16 w-16"
                    className="rounded bg-slate-200"
                    imageClassName="object-contain"
                    fallbackClassName="bg-slate-200"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {item.listing ? buildListingTitle(item.listing) : "Unknown"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {item.listing?.year} {item.listing?.set_brand} • {item.listing?.grade}
                    </p>
                    <p className="mt-1 font-medium text-slate-900">
                      ${((item.listing?.price ?? 0) * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.listingId, item.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded bg-white text-sm text-slate-600 hover:text-slate-900"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm text-slate-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.listingId, item.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded bg-white text-sm text-slate-600 hover:text-slate-900"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.listingId)}
                      className="text-xs text-rose-600 hover:text-rose-500"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div className="flex justify-between text-slate-900">
              <span>Total</span>
              <span className="font-semibold">${total.toFixed(2)}</span>
            </div>
            <Link
              href="/shop/checkout"
              onClick={onClose}
              className="block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-cyan-500"
            >
              Checkout
            </Link>
            <button
              onClick={clearCart}
              className="block w-full py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
