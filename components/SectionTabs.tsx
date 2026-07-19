"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SubTab = { name: string; href: string };
type Section = { paths: string[]; tabs: SubTab[] };

const SECTIONS: Section[] = [
  // ── Ledger ──
  {
    paths: ["/business/ledger", "/business/sales", "/business/inventory"],
    tabs: [
      { name: "Inventory", href: "/business/ledger" },
      { name: "Sales & Trades", href: "/business/sales" },
    ],
  },
  // ── Research ──
  {
    paths: ["/comps", "/watchlist"],
    tabs: [
      { name: "Compare Listings", href: "/comps" },
      { name: "Watchlist", href: "/watchlist" },
    ],
  },
];

function findSection(pathname: string): Section | null {
  // Prefer the most specific match (longest path prefix).
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
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
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
              {tab.name}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-px rounded-t bg-[color:var(--biz-text-strong)] opacity-80" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
