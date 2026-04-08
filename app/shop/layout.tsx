"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ShopCartProvider, useShopCart } from "@/contexts/ShopCartContext";
import CartDrawer from "@/components/shop/CartDrawer";
import ShopFooter from "@/components/shop/ShopFooter";

const SHOP_THEME_CSS = `
.shop-theme {
  --shop-bg: #ffffff;
  --shop-alt: #f8fafc;
  --shop-text: #0f172a;
  --shop-muted: #475569;
  --shop-border: #e2e8f0;
  --shop-accent: #0EA5E9;
  background: var(--shop-bg);
  color: var(--shop-text);
}

.shop-theme main {
  background: var(--shop-bg);
}

.shop-theme .shop-section-alt {
  background: var(--shop-alt);
}
`;

function ShopNav() {
  const pathname = usePathname();
  const [cartOpen, setCartOpen] = useState(false);
  const { totalItems } = useShopCart();
  const basePath = pathname?.startsWith("/business") ? "/business/shop" : "/shop";
  const appHomePath = pathname?.startsWith("/business") ? "/business" : "/";

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--shop-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link
            href={basePath}
            className="flex items-center gap-3 transition-opacity hover:opacity-90"
          >
            <span className="text-xl font-semibold tracking-tight text-[var(--shop-text)]">
              CardzCheck
            </span>
            <span className="rounded bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
              Deals
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href={appHomePath}
              className="text-sm text-[var(--shop-muted)] transition-colors hover:text-[var(--shop-text)]"
            >
              Main App
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 rounded-lg border border-[var(--shop-border)] bg-white px-4 py-2 text-[var(--shop-text)] transition-colors hover:border-slate-300"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h2l1 12h12l1-8H6"
                />
                <circle cx="10" cy="19" r="1.25" />
                <circle cx="17" cy="19" r="1.25" />
              </svg>
              <span>Cart</span>
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-xs font-medium text-white">
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
      <div className="shop-theme min-h-screen bg-[var(--shop-bg)] text-[var(--shop-text)]">
        <style jsx global>{SHOP_THEME_CSS}</style>
        <ShopNav />
        <main className="pb-10">{children}</main>
        <ShopFooter />
      </div>
    </ShopCartProvider>
  );
}
