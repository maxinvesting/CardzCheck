"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { name: "Market", href: "/marketplace", match: ["/marketplace", "/business/marketplace"] },
  { name: "My Listings", href: "/marketplace/sell/listings", match: ["/marketplace/sell/listings"] },
  { name: "Sell", href: "/marketplace/sell/new", match: ["/marketplace/sell/new"] },
  { name: "Orders", href: "/marketplace/order-confirmed", match: ["/marketplace/order-confirmed"] },
] as const;

export default function MarketplaceTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="border-b border-gray-900">
      <ul className="flex gap-1 overflow-x-auto -mb-px">
        {TABS.map((tab) => {
          const active = tab.match.some(
            (m) => pathname === m || pathname.startsWith(m + "/")
          );
          return (
            <li key={tab.name}>
              <Link
                href={tab.href}
                className={`relative inline-flex items-center px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "!text-white"
                    : "!text-gray-500 hover:!text-gray-200"
                }`}
              >
                {tab.name}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-white" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
