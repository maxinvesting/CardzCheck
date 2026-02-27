"use client";

import { useShopCart } from "@/contexts/ShopCartContext";
import Link from "next/link";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updateQuantity, totalItems, clearCart } = useShopCart();

  if (!isOpen) return null;

  const total = items.reduce((sum, i) => {
    const price = i.listing?.price ?? 0;
    const ship = i.listing?.shipping_cost ?? 0;
    return sum + (price + ship) * i.quantity;
  }, 0);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:z-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#0f1419] border-l border-gray-800 z-50 flex flex-col shadow-xl"
        role="dialog"
        aria-label="Shopping cart"
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Cart ({totalItems})</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-gray-400 text-sm">Your cart is empty</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={item.listingId}
                  className="flex gap-3 p-3 bg-gray-900 rounded-lg border border-gray-800"
                >
                  {item.listing?.thumbnail_url ? (
                    <img
                      src={item.listing.thumbnail_url}
                      alt=""
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-800 rounded flex items-center justify-center">
                      <span className="text-gray-500 text-xs">No img</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">
                      {item.listing?.player_name ?? "Unknown"}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {item.listing?.year} {item.listing?.set_brand} • {item.listing?.grade}
                    </p>
                    <p className="text-cyan-400 font-medium mt-1">
                      ${((item.listing?.price ?? 0) * item.quantity).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.listingId, item.quantity - 1)}
                        className="w-7 h-7 rounded bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center text-sm"
                      >
                        −
                      </button>
                      <span className="text-white w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.listingId, item.quantity + 1)}
                        className="w-7 h-7 rounded bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center text-sm"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.listingId)}
                      className="text-xs text-red-400 hover:text-red-300"
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
          <div className="p-4 border-t border-gray-800 space-y-3">
            <div className="flex justify-between text-white">
              <span>Total</span>
              <span className="font-semibold">${total.toFixed(2)}</span>
            </div>
            <Link
              href="/shop/checkout"
              onClick={onClose}
              className="block w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg text-center transition-colors"
            >
              Checkout
            </Link>
            <button
              onClick={clearCart}
              className="block w-full py-2 text-gray-400 hover:text-white text-sm"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
