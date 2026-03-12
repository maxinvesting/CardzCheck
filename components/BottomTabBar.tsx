"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MAIN_TABS = [
  { name: "Home", href: "/dashboard", icon: HomeIcon },
  { name: "Collection", href: "/collection", icon: CollectionIcon },
  { name: "Analytics", href: "/analytics", icon: ChartIcon },
  { name: "Marketplace", href: "/shop", icon: ShopIcon, cyan: true },
  { name: "More", href: "#more", icon: MoreIcon },
] as const;

const MORE_LINKS = [
  { name: "News & Updates", href: "/news" },
  { name: "Watchlist", href: "/watchlist" },
  { name: "Comps", href: "/comps" },
  { name: "Grade Engine", href: "/grade-hub" },
  { name: "Bulk Mode", href: "/bulk" },
  { name: "Analyst", href: "/analyst" },
  { name: "Help & FAQ", href: "/help" },
  { name: "Settings", href: "/settings" },
];

const TAB_BASE_PATHS = [
  "/dashboard",
  "/collection",
  "/analytics",
  "/shop",
  "/watchlist",
  "/comps",
  "/grade-hub",
  "/grade-probability",
  "/grade-estimator",
  "/analyst",
  "/bulk",
  "/help",
  "/news",
  "/settings",
];

function isTabRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return TAB_BASE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ShopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isTabRoute(pathname)) return null;

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f1419] border-t border-gray-800 flex items-center justify-around px-2 py-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {MAIN_TABS.map((tab) => {
          if (tab.href === "#more") {
            return (
              <button
                key={tab.name}
                onClick={() => setMoreOpen(true)}
                className="flex flex-col items-center justify-center py-2 px-3 text-gray-400 hover:text-white transition-colors"
              >
                <tab.icon className="w-6 h-6" />
                <span className="text-[10px] mt-0.5">{tab.name}</span>
              </button>
            );
          }
          const active = pathname === tab.href || (tab.href === "/analytics" && pathname === "/dashboard");
          const Icon = tab.icon;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex flex-col items-center justify-center py-2 px-3 transition-colors ${
                active
                  ? (tab as { cyan?: boolean }).cyan
                    ? "text-cyan-400"
                    : "text-blue-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] mt-0.5">{tab.name}</span>
            </Link>
          );
        })}
      </nav>

      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-[70] bg-[#0f1419] border-t border-gray-800 rounded-t-2xl max-h-[70vh] overflow-y-auto"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">More</h3>
            </div>
            <ul className="p-4 space-y-2">
              {MORE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className="block px-4 py-3 rounded-lg text-white hover:bg-gray-800 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
