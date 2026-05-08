"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function ShopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function CollectionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function OrderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

const MARKETPLACE_TABS = [
  {
    name: "Market",
    suffix: "",
    icon: ShopIcon,
    match: ["/marketplace", "/business/marketplace"],
    matchExact: true,
  },
  {
    name: "Sell",
    suffix: "/sell/new",
    icon: SellIcon,
    match: ["/marketplace/sell/new", "/business/marketplace/sell/new"],
  },
  {
    name: "My Listings",
    suffix: "/sell/listings",
    icon: CollectionIcon,
    match: ["/marketplace/sell/listings", "/business/marketplace/sell/listings"],
  },
  {
    name: "Orders",
    suffix: "/order-confirmed",
    icon: OrderIcon,
    match: ["/marketplace/order-confirmed", "/business/marketplace/order-confirmed"],
  },
] as const;

function isMarketplaceRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/marketplace" ||
    pathname.startsWith("/marketplace/") ||
    pathname === "/business/marketplace" ||
    pathname.startsWith("/business/marketplace/")
  );
}

export default function BottomTabBar() {
  const pathname = usePathname();

  if (!isMarketplaceRoute(pathname)) return null;

  const isBusinessShell = pathname?.startsWith("/business") ?? false;
  const base = isBusinessShell ? "/business/marketplace" : "/marketplace";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-900 bg-black flex items-center justify-around px-2 py-2 lg:left-64"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {MARKETPLACE_TABS.map((tab) => {
        const href = base + tab.suffix;
        const active = tab.match.some((m) =>
          (tab as { matchExact?: boolean }).matchExact
            ? pathname === m
            : pathname === m || pathname?.startsWith(m + "/")
        );
        const Icon = tab.icon;
        return (
          <Link
            key={tab.name}
            href={href}
            className={`flex flex-col items-center justify-center py-2 px-3 transition-colors ${
              active ? "!text-white" : "!text-gray-500 hover:!text-white"
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className="text-[10px] mt-0.5">{tab.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
