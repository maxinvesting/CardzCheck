"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SubTab = { name: string; href: string; badge?: string };
type Section = { paths: string[]; tabs: SubTab[] };

const SECTIONS: Section[] = [
  // ── Personal Ledger ──
  {
    paths: ["/collection", "/bulk"],
    tabs: [
      { name: "Inventory", href: "/collection" },
      { name: "Bulk Mode", href: "/bulk" },
    ],
  },
  // ── Personal Analytics ──
  {
    paths: ["/analytics", "/comps", "/watchlist", "/analyst", "/grade-hub", "/grade-probability", "/grade-estimator"],
    tabs: [
      { name: "Overview", href: "/analytics" },
      { name: "Compare Listings", href: "/comps" },
      { name: "Watchlist", href: "/watchlist", badge: "Pro" },
      { name: "Analyst", href: "/analyst", badge: "Pro" },
      { name: "Grading", href: "/grade-hub" },
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
    paths: ["/business/ledger", "/business/sales", "/business/sales-agent", "/business/inventory"],
    tabs: [
      { name: "Inventory", href: "/business/ledger" },
      { name: "Sales", href: "/business/sales" },
      { name: "Sales Agent", href: "/business/sales-agent" },
    ],
  },
  // ── Business Analytics ──
  {
    paths: ["/business/comps", "/business/grade-hub", "/business/grade-probability", "/business/grade-estimator"],
    tabs: [
      { name: "Compare Listings", href: "/business/comps" },
      { name: "Grading", href: "/business/grade-hub" },
    ],
  },
  // ── Business "Business" tab ──
  {
    paths: ["/business/consultant", "/business/help", "/business/settings", "/business/insights", "/business/analyst", "/business/messages"],
    tabs: [
      { name: "Advisor", href: "/business/consultant" },
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

  return (
    <div className="sticky top-0 z-20 w-full border-b border-[color:var(--biz-border)] bg-[color:var(--biz-bg)]/90 backdrop-blur">
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
                  ? "text-[color:var(--biz-text-strong)]"
                  : "text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab.name}
                {tab.badge && (
                  <span className="rounded border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-soft)] px-1 py-0.5 text-[9px] font-bold text-[color:var(--biz-muted-strong)]">
                    {tab.badge}
                  </span>
                )}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-px rounded-t bg-[color:var(--biz-text-strong)] opacity-80"
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
