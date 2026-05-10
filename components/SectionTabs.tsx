"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SubTab = { name: string; href: string; badge?: string };
type Section = { paths: string[]; tabs: SubTab[] };

const SECTIONS: Section[] = [
  // ── Personal Ledger ──
  {
    paths: ["/collection", "/bulk", "/grade-hub", "/grade-probability", "/grade-estimator"],
    tabs: [
      { name: "Inventory", href: "/collection" },
      { name: "Bulk Mode", href: "/bulk" },
      { name: "Grade Engine", href: "/grade-hub" },
    ],
  },
  // ── Personal Analytics ──
  {
    paths: ["/analytics", "/comps", "/watchlist", "/analyst"],
    tabs: [
      { name: "Overview", href: "/analytics" },
      { name: "Compare Listings", href: "/comps" },
      { name: "Watchlist", href: "/watchlist", badge: "Pro" },
      { name: "Analyst", href: "/analyst", badge: "Pro" },
    ],
  },
  // ── Personal Business gateway ──
  {
    paths: ["/help", "/settings"],
    tabs: [
      { name: "Help & FAQ", href: "/help" },
      { name: "Settings", href: "/settings" },
    ],
  },
  // ── Business Ledger ──
  {
    paths: ["/business/ledger", "/business/sales", "/business/grade-hub", "/business/grade-probability", "/business/grade-estimator", "/business/inventory"],
    tabs: [
      { name: "Inventory", href: "/business/ledger" },
      { name: "Sales", href: "/business/sales" },
      { name: "Grade Engine", href: "/business/grade-hub" },
    ],
  },
  // ── Business Analytics ──
  {
    paths: ["/business/comps"],
    tabs: [
      { name: "Compare Listings", href: "/business/comps" },
    ],
  },
  // ── Business "Business" tab ──
  {
    paths: ["/business/consultant", "/business/help", "/business/settings", "/business/insights", "/business/analyst", "/business/messages"],
    tabs: [
      { name: "AI Insights", href: "/business/consultant" },
      { name: "Help & FAQ", href: "/business/help" },
      { name: "Settings", href: "/business/settings" },
    ],
  },
];

function findSection(pathname: string): Section | null {
  // Prefer the most specific match (longest path prefix) so /business/* doesn't fall back to a personal entry.
  let best: { section: Section; depth: number } | null = null;
  for (const section of SECTIONS) {
    for (const p of section.paths) {
      if (pathname === p || pathname.startsWith(p + "/")) {
        const depth = p.length;
        if (!best || depth > best.depth) best = { section, depth };
      }
    }
  }
  return best?.section ?? null;
}

export default function SectionTabs() {
  const pathname = usePathname() ?? "";
  const section = findSection(pathname);
  if (!section || section.tabs.length < 2) return null;

  const isBusinessRoute = pathname.startsWith("/business");

  return (
    <div
      className={`sticky top-0 z-20 w-full border-b backdrop-blur ${
        isBusinessRoute
          ? "border-[color:var(--biz-border)] bg-[var(--biz-bg)]/85"
          : "border-gray-800 bg-[#0f1419]/85"
      }`}
    >
      <nav
        className="flex gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8"
        aria-label="Section navigation"
      >
        {section.tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative whitespace-nowrap px-3 py-3 text-[13px] font-medium tracking-tight transition-colors ${
                active
                  ? isBusinessRoute
                    ? "text-[var(--biz-text-strong)]"
                    : "text-white"
                  : isBusinessRoute
                  ? "text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab.name}
                {tab.badge && (
                  <span className="rounded bg-blue-500/20 px-1 py-0.5 text-[9px] font-bold text-blue-300">
                    {tab.badge}
                  </span>
                )}
              </span>
              {active && (
                <span
                  className={`absolute bottom-0 left-2 right-2 h-[2px] rounded-t ${
                    isBusinessRoute ? "bg-[var(--biz-primary)]" : "bg-blue-500"
                  }`}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
