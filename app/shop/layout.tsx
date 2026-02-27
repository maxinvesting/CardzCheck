"use client";

import Link from "next/link";
import { useState } from "react";
import SportsCardBackground from "@/components/SportsCardBackground";
import { ShopCartProvider, useShopCart } from "@/contexts/ShopCartContext";
import CartDrawer from "@/components/shop/CartDrawer";
import ShopFooter from "@/components/shop/ShopFooter";

function ShopNav() {
  const [cartOpen, setCartOpen] = useState(false);
  const { totalItems } = useShopCart();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-[#0f1419]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link
            href="/shop"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <span className="text-xl font-bold text-white tracking-tight">
              CardzCheck
            </span>
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[#0EA5E9]/30 text-cyan-400 rounded">
              Shop
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Main App
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <span>Cart</span>
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 text-white text-xs font-medium flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShopCartProvider>
      <div className="min-h-screen bg-[#0f1419] relative overflow-hidden">
        <SportsCardBackground variant="default" />
        <div className="relative z-10">
          <ShopNav />
          <main>{children}</main>
          <ShopFooter />
        </div>
      </div>
    </ShopCartProvider>
  );
}
