"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSellerUnreadCount } from "@/hooks/useSellerUnreadCount";

const MESSAGES_HREF = "/marketplace/sell/messages";

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
    paths: ["/business/ledger", "/business/sales", "/business/inventory"],
    tabs: [
      { name: "Inventory", href: "/business/ledger" },
      { name: "Sales & Trades", href: "/business/sales" },
    ],
  },
  // ── Marketplace seller area ──
  {
    paths: [
      "/marketplace/sell/listings",
      "/marketplace/sell/orders",
      "/marketplace/sell/messages",
      "/marketplace/sell/new",
    ],
    tabs: [
      { name: "Listings", href: "/marketplace/sell/listings" },
      { name: "Orders", href: "/marketplace/sell/orders" },
      { name: "Messages", href: "/marketplace/sell/messages" },
    ],
  },
  // ── Business Analytics ──
  {
    paths: ["/business/financials", "/business/grade-hub", "/business/grade-probability", "/business/grade-estimator"],
    tabs: [
      { name: "Financials", href: "/business/financials" },
      { name: "Grading", href: "/business/grade-hub" },
    ],
  },
  // ── Assistants · Business Advisor ──
  {
    paths: ["/assistants/advisor", "/business/help", "/business/settings", "/business/insights", "/business/analyst"],
    tabs: [
      { name: "Advisor", href: "/assistants/advisor" },
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
  const hasMessagesTab = Boolean(
    section?.tabs.some((tab) => tab.href === MESSAGES_HREF)
  );
  const unreadMessages = useSellerUnreadCount(hasMessagesTab);
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
                {tab.href === MESSAGES_HREF && unreadMessages > 0 && (
                  <span
                    className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums"
                    style={{
                      background: "var(--biz-text-strong)",
                      color: "var(--biz-bg)",
                    }}
                    aria-label={`${unreadMessages} unread messages`}
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
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
