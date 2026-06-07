"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MicButton } from "@/components/ui/MicButton";
import type {
  BusinessMetrics as MetricsType,
  BusinessPeriodKey,
  BusinessPeriodMetrics,
  BusinessSale,
  MarketplaceListingPreview,
  UserStorefront,
} from "@/types";

/* ── formatting helpers ─────────────────────────────────────────── */

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtCompact(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 10_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(dollars);
  }
  return fmt(cents);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clipTitle(title: string | null | undefined, max = 52): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return "Untitled card";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

const CHANNEL_LABELS: Record<string, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  instagram: "Instagram",
  show: "Show",
  local: "Local",
  other: "Other",
  veriswap: "Veriswap",
};

/* ── small presentational atoms ─────────────────────────────────── */

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`desk-eyebrow ${className}`}>{children}</span>;
}

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-3.5 ${w} rounded-md animate-pulse`} style={{ background: "var(--biz-skeleton)" }} />;
}

/* ── period model ───────────────────────────────────────────────── */

const PERIODS: { key: BusinessPeriodKey; label: string; caption: string }[] = [
  { key: "daily", label: "Today", caption: "since midnight" },
  { key: "weekly", label: "This week", caption: "week to date" },
  { key: "monthly", label: "This month", caption: "month to date" },
  { key: "yearly", label: "This year", caption: "year to date" },
];

type ListingSort = "newest" | "value_high" | "value_low" | "updated" | "margin";

const LISTING_SORTS: { key: ListingSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "value_high", label: "Highest value" },
  { key: "value_low", label: "Lowest value" },
  { key: "updated", label: "Recently updated" },
  { key: "margin", label: "Best margin" },
];

interface Props {
  businessName: string | null;
  periodMetrics: BusinessPeriodMetrics | null;
  periodMetricsLoading: boolean;
  metrics: MetricsType | null;
  recentSales: BusinessSale[];
  recentSalesLoading: boolean;
  listings: MarketplaceListingPreview[];
  listingsLoading: boolean;
  ebayStoreHref: string | null;
  needsMigration: boolean;
  storefronts?: UserStorefront[];
  onRecordSale?: () => void;
  onRecordTrade?: () => void;
  onDashboardVoiceCommand?: (transcript: string) => void;
}

export default function BusinessDashboardView({
  businessName,
  periodMetrics,
  periodMetricsLoading,
  metrics,
  recentSales,
  recentSalesLoading,
  listings,
  listingsLoading,
  ebayStoreHref,
  needsMigration,
  storefronts = [],
  onRecordSale,
  onRecordTrade,
  onDashboardVoiceCommand,
}: Props) {
  const [showStorefrontDropdown, setShowStorefrontDropdown] = useState(false);
  const [period, setPeriod] = useState<BusinessPeriodKey>("monthly");
  const [listingSort, setListingSort] = useState<ListingSort>("newest");

  const primaryStorefront = storefronts.find((store) => store.is_primary) ?? storefronts[0] ?? null;
  const hasStorefronts = storefronts.length > 0;

  const activePeriod = PERIODS.find((p) => p.key === period)!;
  const stat = periodMetrics?.[period] ?? null;

  /* ── snapshot figures ─────────────────────────────────────────── */
  const snapshot = useMemo(() => {
    const revenue = stat?.revenue_cents ?? 0;
    const profit = stat?.profit_cents ?? 0;
    const cogs = stat?.cogs_cents ?? 0;
    const count = stat?.sales_count ?? 0;
    const avgSale = count > 0 ? Math.round(revenue / count) : 0;
    // Margin = profit ÷ revenue; ROI = profit ÷ cost of goods.
    const margin = revenue > 0 ? (profit / revenue) * 100 : null;
    const roi = cogs > 0 ? (profit / cogs) * 100 : null;
    return { revenue, profit, cogs, count, avgSale, margin, roi };
  }, [stat]);

  const recentSalesList = useMemo(
    () =>
      [...recentSales]
        .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime())
        .slice(0, 6),
    [recentSales]
  );

  const sortedListings = useMemo(() => {
    const copy = [...listings];
    switch (listingSort) {
      case "value_high":
        copy.sort((a, b) => b.list_price_cents - a.list_price_cents);
        break;
      case "value_low":
        copy.sort((a, b) => a.list_price_cents - b.list_price_cents);
        break;
      case "updated":
        copy.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case "margin":
        copy.sort((a, b) => (b.spread_cents ?? -Infinity) - (a.spread_cents ?? -Infinity));
        break;
      case "newest":
      default:
        copy.sort((a, b) => new Date(b.listed_at).getTime() - new Date(a.listed_at).getTime());
        break;
    }
    return copy.slice(0, 5);
  }, [listings, listingSort]);

  const hasMarginData = listings.some((l) => l.spread_cents != null);
  const storefrontHref = "/marketplace/profile?tab=selling";

  /* ── page shortcuts ───────────────────────────────────────────── */
  const shortcuts: {
    href: string;
    eyebrow: string;
    title: string;
    detail: string;
    icon: React.ReactNode;
  }[] = [
    {
      href: "/business/financials",
      eyebrow: "Financials",
      title: "Performance & margins",
      detail: "Revenue trends, capital allocation, and profit over time.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3v18h18M7 14l3-3 3 3 5-6" />
      ),
    },
    {
      href: "/business/grade-hub",
      eyebrow: "Grading",
      title: "Grade ROI simulator",
      detail: "Submission simulations and projected profit before you send.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      ),
    },
    {
      href: "/business/ledger",
      eyebrow: "Ledger",
      title: "Inventory & records",
      detail: "Purchases, trades, sales records, and full inventory management.",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      ),
    },
  ];

  return (
    <div className="desk pt-3 pb-14">
      {/* ── Masthead ────────────────────────────────────────────── */}
      <header className="desk-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="desk-pulse" aria-hidden />
            <Eyebrow>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Eyebrow>
          </div>
          <h1 className="desk-display mt-2 truncate text-[34px] font-medium leading-[1.05] text-[var(--biz-text-strong)] sm:text-[42px]">
            {businessName ?? "CardzCheck"}
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--biz-muted)]">Business dashboard</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onDashboardVoiceCommand && (
            <MicButton
              label="Ask by voice"
              title="Ask the Business Advisor by voice"
              size="sm"
              onResult={onDashboardVoiceCommand}
              className="desk-btn"
            />
          )}

          {hasStorefronts ? (
            storefronts.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStorefrontDropdown((current) => !current)}
                  className="desk-btn"
                >
                  Storefronts
                  <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showStorefrontDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowStorefrontDropdown(false)} />
                    <div
                      className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl py-1"
                      style={{ background: "var(--biz-surface-raised)", border: "1px solid var(--biz-border)", boxShadow: "var(--biz-shadow-md)" }}
                    >
                      {storefronts.map((sf) => (
                        <a
                          key={sf.id}
                          href={sf.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--biz-muted-strong)] transition-colors hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
                          onClick={() => setShowStorefrontDropdown(false)}
                        >
                          <span className="truncate font-medium">{sf.display_name}</span>
                          {sf.is_primary && (
                            <span className="shrink-0 text-[9px] font-semibold tracking-wide text-[var(--biz-muted-strong)]">PRIMARY</span>
                          )}
                          <svg className="ml-auto h-3 w-3 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ))}
                      <Link
                        href="/business/settings?section=storefronts"
                        onClick={() => setShowStorefrontDropdown(false)}
                        className="mt-1 block border-t border-[var(--biz-border)] px-3 py-2 text-xs font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
                      >
                        Manage storefronts
                      </Link>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <a
                href={primaryStorefront!.store_url}
                target="_blank"
                rel="noopener noreferrer"
                className="desk-btn"
              >
                {primaryStorefront!.display_name}
                <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )
          ) : null}

          <a href="/api/business/export?type=inventory" className="desk-btn">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </a>
        </div>
      </header>

      {needsMigration && (
        <div
          className="mt-6 rounded-xl px-4 py-3 text-sm"
          style={{ border: "1px solid var(--biz-warning-border)", background: "var(--biz-warning-soft)", color: "var(--biz-warning)" }}
        >
          Database setup required.{" "}
          <Link href="/business/ledger" className="underline">
            Go to the Ledger
          </Link>{" "}
          to complete setup.
        </div>
      )}

      {/* ── Financial snapshot hero ──────────────────────────────── */}
      <section className="desk-rise mt-7" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Eyebrow>Financial snapshot</Eyebrow>
            <span className="text-[11px] text-[var(--biz-faint)]">· {activePeriod.caption}</span>
          </div>

          {/* Period selector */}
          <div
            className="inline-flex items-center gap-0.5 rounded-full p-1"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--biz-border-subtle)" }}
            role="tablist"
            aria-label="Financial period"
          >
            {PERIODS.map((p) => {
              const active = p.key === period;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(p.key)}
                  className="rounded-full px-3.5 py-1.5 text-[11.5px] font-medium transition-colors"
                  style={{
                    color: active ? "var(--biz-primary-foreground)" : "var(--biz-muted)",
                    background: active ? "var(--biz-primary)" : "transparent",
                    boxShadow: active ? "0 6px 16px rgba(0,0,0,0.35)" : undefined,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="desk-rule mt-3" />

        {/* Hero figures: revenue + profit dominate, secondaries underneath */}
        <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-9 lg:grid-cols-[1.15fr_1px_1fr]">
          {/* Revenue + profit */}
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <Eyebrow>Revenue</Eyebrow>
              {periodMetricsLoading ? (
                <div className="mt-3 h-12 w-32 animate-pulse rounded-lg" style={{ background: "var(--biz-skeleton)" }} />
              ) : (
                <p className="desk-figure mt-2.5 text-[46px] leading-none text-[var(--biz-text-strong)] sm:text-[52px]">
                  {fmtCompact(snapshot.revenue)}
                </p>
              )}
              <p className="mt-2.5 text-[11px] text-[var(--biz-faint)]">
                {metrics ? `${fmt(metrics.revenueYtd)} year to date` : activePeriod.caption}
              </p>
            </div>
            <div>
              <Eyebrow>Profit</Eyebrow>
              {periodMetricsLoading ? (
                <div className="mt-3 h-12 w-32 animate-pulse rounded-lg" style={{ background: "var(--biz-skeleton)" }} />
              ) : (
                <p
                  className="desk-figure mt-2.5 text-[46px] leading-none sm:text-[52px]"
                  style={{ color: snapshot.profit >= 0 ? "var(--biz-profit)" : "var(--desk-red)" }}
                >
                  {snapshot.profit >= 0 ? "" : "−"}
                  {fmtCompact(Math.abs(snapshot.profit))}
                </p>
              )}
              <p className="mt-2.5 text-[11px] text-[var(--biz-faint)]">
                {snapshot.margin != null ? `${snapshot.margin.toFixed(1)}% margin` : "No sales this period"}
              </p>
            </div>
          </div>

          <div className="hidden lg:block" style={{ background: "var(--biz-border-subtle)" }} aria-hidden />

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Sales", value: periodMetricsLoading ? "—" : String(snapshot.count) },
              { label: "Avg sale", value: periodMetricsLoading ? "—" : snapshot.count > 0 ? fmt(snapshot.avgSale) : "—" },
              {
                label: "ROI",
                value: periodMetricsLoading ? "—" : snapshot.roi != null ? `${snapshot.roi.toFixed(0)}%` : "—",
              },
              { label: "Cost of goods", value: periodMetricsLoading ? "—" : fmtCompact(snapshot.cogs) },
            ].map((cell) => (
              <div key={cell.label}>
                <Eyebrow>{cell.label}</Eyebrow>
                <p className="desk-figure mt-2 text-[26px] leading-none text-[var(--biz-text)]">{cell.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick actions ────────────────────────────────────────── */}
      <section className="desk-rise mt-9" style={{ animationDelay: "120ms" }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Record Sale — prominent */}
          <button
            type="button"
            onClick={onRecordSale}
            className="desk-action desk-action--primary group col-span-1 sm:col-span-1"
          >
            <span className="desk-action-icon" style={{ background: "rgba(20,16,7,0.16)" }}>
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </span>
            <span className="desk-action-label">Record sale</span>
          </button>

          {/* Record Trade — prominent */}
          <button
            type="button"
            onClick={onRecordTrade}
            className="desk-action desk-action--primary group col-span-1 sm:col-span-1"
          >
            <span className="desk-action-icon" style={{ background: "rgba(20,16,7,0.16)" }}>
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </span>
            <span className="desk-action-label">Record trade</span>
          </button>

          {/* Secondary nav actions */}
          {[
            {
              href: "/business/ledger",
              label: "Open ledger",
              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
            },
            {
              href: "/business/financials",
              label: "Financials",
              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M3 3v18h18M7 14l3-3 3 3 5-6" />,
            },
            {
              href: "/business/grade-hub",
              label: "Grading",
              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 12l2 2 4-4m-6.165-7.303a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />,
            },
          ].map((action) => (
            <Link key={action.href} href={action.href} className="desk-action group">
              <span className="desk-action-icon">
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {action.icon}
                </svg>
              </span>
              <span className="desk-action-label">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent sales + Marketplace preview ───────────────────── */}
      <section className="desk-rise mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2" style={{ animationDelay: "180ms" }}>
        {/* Recent sales */}
        <div className="desk-panel p-6">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Recent sales</Eyebrow>
            {recentSales.length > 0 && (
              <Link href="/business/sales" className="text-[11px] font-medium text-[var(--biz-muted-strong)] transition-colors hover:text-[var(--biz-text)] hover:underline">
                View all sales →
              </Link>
            )}
          </div>
          {recentSalesLoading ? (
            <div className="mt-5 space-y-3.5">
              {[...Array(4)].map((_, i) => (
                <SkeletonLine key={i} w={i % 2 === 0 ? "w-full" : "w-3/4"} />
              ))}
            </div>
          ) : recentSales.length === 0 ? (
            <div className="mt-5">
              <p className="text-xs text-[var(--biz-muted)]">No sales recorded yet.</p>
              <button
                type="button"
                onClick={onRecordSale}
                className="mt-2 text-xs font-medium text-[var(--biz-muted-strong)] transition-colors hover:text-[var(--biz-text)] hover:underline"
              >
                Record your first sale →
              </button>
            </div>
          ) : (
            <ul className="mt-4 space-y-0.5">
              {recentSalesList.map((sale) => (
                <li key={sale.id} className="desk-row flex items-center justify-between gap-3 px-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--biz-text)]" title={sale.inventory_item?.title ?? "Sale"}>
                      {clipTitle(sale.inventory_item?.title, 42)}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-[var(--biz-faint)]">
                      {CHANNEL_LABELS[sale.channel] ?? sale.channel} · {fmtDate(sale.sold_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="desk-figure text-[15px] text-[var(--biz-text-strong)]">
                      {fmt(sale.gross_revenue_cents)}
                    </p>
                    <p
                      className="text-[10.5px] tabular-nums"
                      style={{ color: sale.profit_cents >= 0 ? "var(--biz-profit)" : "var(--desk-red)" }}
                    >
                      {sale.profit_cents >= 0 ? "+" : "−"}
                      {fmt(Math.abs(sale.profit_cents))} profit
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Marketplace listings preview */}
        <div className="desk-panel p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Eyebrow>Marketplace listings</Eyebrow>
            <Link href={storefrontHref} className="text-[11px] font-medium text-[var(--biz-muted-strong)] transition-colors hover:text-[var(--biz-text)] hover:underline">
              Open storefront →
            </Link>
          </div>

          {/* Sort control */}
          {listings.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {LISTING_SORTS.filter((s) => s.key !== "margin" || hasMarginData).map((s) => {
                const active = s.key === listingSort;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setListingSort(s.key)}
                    className="rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors"
                    style={{
                      color: active ? "var(--biz-text)" : "var(--biz-faint)",
                      background: active ? "rgba(255,255,255,0.06)" : "transparent",
                      border: active ? "1px solid var(--biz-border-strong)" : "1px solid transparent",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          {listingsLoading ? (
            <div className="mt-5 space-y-3.5">
              {[...Array(4)].map((_, i) => (
                <SkeletonLine key={i} w={i % 2 === 0 ? "w-full" : "w-2/3"} />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="mt-5">
              <p className="text-xs text-[var(--biz-muted)]">No active marketplace listings.</p>
              <Link href="/business/ledger" className="mt-2 inline-block text-xs font-medium text-[var(--biz-muted-strong)] transition-colors hover:text-[var(--biz-text)] hover:underline">
                List a card from the ledger →
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-0.5">
              {sortedListings.map((listing) => (
                <li key={listing.id}>
                  <Link
                    href={`/marketplace/listing/${listing.id}`}
                    className="desk-row flex items-center justify-between gap-3 px-2 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: listing.status === "price_reduced" ? "var(--biz-warning)" : "var(--biz-profit)" }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-[var(--biz-text)]" title={listing.title}>
                          {clipTitle(listing.title, 40)}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-[var(--biz-faint)]">
                          {listing.status === "price_reduced" ? "Price reduced" : "Active"}
                          {listing.spread_cents != null && (
                            <>
                              {" · "}
                              <span style={{ color: listing.spread_cents >= 0 ? "var(--biz-profit)" : "var(--desk-red)" }}>
                                {listing.spread_cents >= 0 ? "+" : "−"}
                                {fmt(Math.abs(listing.spread_cents))} vs CMV
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="desk-figure shrink-0 text-[15px] text-[var(--biz-text-strong)]">
                      {fmt(listing.list_price_cents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Page shortcuts ───────────────────────────────────────── */}
      <section className="desk-rise mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3" style={{ animationDelay: "240ms" }}>
        {shortcuts.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="desk-panel group flex flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--biz-border)" }}
              >
                <svg className="h-[18px] w-[18px]" style={{ color: "var(--biz-muted-strong)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {s.icon}
                </svg>
              </span>
              <span className="text-[var(--biz-faint)] transition-transform group-hover:translate-x-0.5">→</span>
            </div>
            <div>
              <Eyebrow>{s.eyebrow}</Eyebrow>
              <p className="desk-display mt-1 text-[16px] leading-tight text-[var(--biz-text-strong)]">{s.title}</p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--biz-muted)]">{s.detail}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* eBay — de-emphasized, treated as one external channel */}
      {ebayStoreHref && (
        <div className="desk-rise mt-6 flex justify-center" style={{ animationDelay: "300ms" }}>
          <a
            href={ebayStoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--biz-faint)] transition-colors hover:text-[var(--biz-muted)]"
          >
            View eBay storefront
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
