"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import { Surface } from "@/components/ui/Surface";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
  UserStorefront,
} from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function timeAgo(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const timestamp = new Date(dateStr).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

function clipTitle(title: string | null | undefined, max = 52): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return "Untitled card";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function gradeLabel(item: BusinessInventoryItem): string {
  if (item.grading_company && item.grade) return `${item.grading_company} ${item.grade}`;
  if (item.grade) return item.grade;
  return item.condition_status === "graded" ? "Graded" : "Raw";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-normal uppercase tracking-[0.1em] text-slate-500">
      {children}
    </span>
  );
}

function FunnelBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-[3px] w-full overflow-hidden bg-[var(--biz-surface-soft)]" style={{ borderRadius: 0 }}>
      <div
        className="h-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, borderRadius: 0 }}
      />
    </div>
  );
}

type SignalTone = "emerald" | "amber" | "red";

type SignalCard = {
  label: "Opportunity" | "Trend" | "Alert";
  title: string;
  detail: string;
  meta: string;
  ctaLabel: string;
  ctaHref: string;
  tone: SignalTone;
};

const SIGNAL_STYLES: Record<SignalTone, { tagBg: string; tagText: string; borderAccent: string }> = {
  emerald: { tagBg: "var(--biz-primary)", tagText: "var(--biz-primary-foreground)", borderAccent: "var(--biz-primary)" },
  amber:   { tagBg: "#FAEEDA", tagText: "#854F0B", borderAccent: "#854F0B" },
  red:     { tagBg: "#FCEBEB", tagText: "#A32D2D", borderAccent: "#A32D2D" },
};

const CHANNEL_LABELS: Record<string, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  instagram: "Instagram",
  show: "Show",
  local: "Local",
  other: "Other",
};

const secondaryActionClass =
  "inline-flex items-center gap-1.5 rounded-none border border-[0.5px] border-[var(--biz-border)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]";

const primaryActionClass =
  "inline-flex items-center gap-1.5 rounded-none bg-[var(--biz-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]";

interface Props {
  businessName: string | null;
  metrics: MetricsType | null;
  metricsLoading: boolean;
  inventorySummary: InventoryValueSummary | null;
  items: BusinessInventoryItem[];
  recentSales: BusinessSale[];
  recentSalesLoading: boolean;
  ebayStoreHref: string | null;
  needsMigration: boolean;
  storefronts?: UserStorefront[];
}

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-3.5 ${w} rounded-md bg-slate-100 animate-pulse`} />;
}

export default function BusinessDashboardView({
  businessName,
  metrics,
  metricsLoading,
  inventorySummary,
  items,
  recentSales,
  recentSalesLoading,
  ebayStoreHref,
  needsMigration,
  storefronts = [],
}: Props) {
  const [showStorefrontDropdown, setShowStorefrontDropdown] = useState(false);

  const primaryStorefront = storefronts.find((store) => store.is_primary) ?? storefronts[0] ?? null;
  const hasStorefronts = storefronts.length > 0;
  const hasWhatnotStorefront = storefronts.some((store) => store.platform === "whatnot");
  const hasWebsiteStorefront = storefronts.some(
    (store) => store.platform === "website" || store.platform === "shopify"
  );

  const dashboardData = useMemo(() => {
    const activeItems = items.filter((item) => item.status !== "sold" && item.status !== "returned");
    const listedItems = activeItems.filter(
      (item) => item.status === "listed" || item.status === "pending_sale"
    );
    const unlistedItems = activeItems.filter((item) => item.status === "unlisted");
    const rawItems = activeItems.filter(
      (item) => item.condition_status === "raw" || !item.grade?.trim()
    );
    const agedItems = activeItems.filter((item) => {
      const days = daysSince(item.acquisition_date);
      return days != null && days >= 60;
    });
    const noCmvItems = activeItems.filter(
      (item) => (item.current_market_value_cents ?? 0) <= 0
    );
    const staleListedItems = listedItems
      .map((item) => ({ item, days: daysSince(item.acquisition_date) }))
      .filter((entry): entry is { item: BusinessInventoryItem; days: number } => entry.days != null)
      .filter((entry) => entry.days >= 45)
      .sort((a, b) => b.days - a.days);

    const topInventory = [...activeItems]
      .filter((item) => (item.current_market_value_cents ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.current_market_value_cents ?? 0) - (a.current_market_value_cents ?? 0)
      )
      .slice(0, 2);
    const recentlyAdded = [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    const bestOpportunity = [...unlistedItems]
      .filter((item) => (item.current_market_value_cents ?? 0) > 0)
      .sort((a, b) => {
        const marginA = (a.current_market_value_cents ?? 0) - (a.cost_basis_total_cents ?? 0);
        const marginB = (b.current_market_value_cents ?? 0) - (b.cost_basis_total_cents ?? 0);
        if (marginB !== marginA) return marginB - marginA;
        return (b.current_market_value_cents ?? 0) - (a.current_market_value_cents ?? 0);
      })[0] ?? null;

    const bestGradingCandidate = [...rawItems]
      .filter((item) => (item.current_market_value_cents ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.current_market_value_cents ?? 0) - (a.current_market_value_cents ?? 0)
      )[0] ?? null;

    const idleCapitalCents = unlistedItems.reduce(
      (sum, item) => sum + (item.current_market_value_cents ?? item.cost_basis_total_cents ?? 0),
      0
    );

    const staleCapitalCents = staleListedItems.reduce(
      (sum, entry) =>
        sum + (entry.item.current_market_value_cents ?? entry.item.list_price_cents ?? 0),
      0
    );

    return {
      activeItems,
      activeCount: activeItems.length,
      listedItems,
      listedCount: listedItems.length,
      unlistedItems,
      unlisted: unlistedItems,
      rawItems,
      aged: agedItems,
      noCmv: noCmvItems,
      staleListedItems,
      topInventory,
      topMovers: topInventory,
      recentlyAdded,
      bestOpportunity,
      bestGradingCandidate,
      idleCapitalCents,
      staleCapitalCents,
    };
  }, [items]);

  const recentSalesList = useMemo(
    () =>
      [...recentSales]
        .sort(
          (a, b) =>
            new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime()
        )
        .slice(0, 2),
    [recentSales]
  );

  const recentSalesGrossCents = useMemo(
    () => recentSales.reduce((sum, sale) => sum + (sale.gross_revenue_cents ?? 0), 0),
    [recentSales]
  );

  const recentSalesProfitCents = useMemo(
    () => recentSales.reduce((sum, sale) => sum + (sale.profit_cents ?? 0), 0),
    [recentSales]
  );

  const topSalesChannel = useMemo(() => {
    const totals = new Map<string, { count: number; revenue: number }>();
    for (const sale of recentSales) {
      const channel = sale.channel || "other";
      const current = totals.get(channel) ?? { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += sale.gross_revenue_cents ?? 0;
      totals.set(channel, current);
    }

    return [...totals.entries()]
      .map(([channel, stats]) => ({ channel, ...stats }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.revenue - a.revenue;
      })[0] ?? null;
  }, [recentSales]);

  const soldLast30Count = recentSales.length;
  const activeCount = dashboardData.activeItems.length;
  const listedCount = dashboardData.listedItems.length;
  const unlistedCount = dashboardData.unlistedItems.length;
  const itemsEmpty = items.length === 0;
  const listRate = activeCount > 0 ? Math.round((listedCount / activeCount) * 100) : 0;
  const sellThroughRate = listedCount > 0 ? Math.round((soldLast30Count / listedCount) * 100) : 0;

  const signalCards = useMemo<SignalCard[]>(() => {
    const opportunity = dashboardData.bestOpportunity;
    const alertItem = dashboardData.staleListedItems[0]?.item ?? null;
    const alertDays = dashboardData.staleListedItems[0]?.days ?? null;

    const cards: SignalCard[] = [];

    cards.push(
      opportunity
        ? {
            label: "Opportunity",
            title: `${clipTitle(opportunity.title, 58)} is ready to list`,
            detail: `Est. MV ${fmt(opportunity.current_market_value_cents ?? 0)} vs cost ${fmt(
              opportunity.cost_basis_total_cents ?? 0
            )}`,
            meta: `${gradeLabel(opportunity)} • ${daysSince(opportunity.acquisition_date) ?? 0}d held • ${unlistedCount} unlisted`,
            ctaLabel: "Open Card",
            ctaHref: `/card/${opportunity.id}?from=business`,
            tone: "emerald",
          }
        : {
            label: "Opportunity",
            title: `${unlistedCount} cards are ready for pricing`,
            detail: `${fmt(dashboardData.idleCapitalCents)} of inventory is not live yet`,
            meta: activeCount > 0 ? `${listRate}% list rate across active inventory` : "Add inventory to start tracking opportunities",
            ctaLabel: "Review Inventory",
            ctaHref: "/business/ledger",
            tone: "emerald",
          }
    );

    cards.push(
      topSalesChannel
        ? {
            label: "Trend",
            title: `${CHANNEL_LABELS[topSalesChannel.channel] ?? topSalesChannel.channel} is leading your recent sell-through`,
            detail: `${topSalesChannel.count} of the last ${Math.max(recentSales.length, 1)} sales • avg ${fmt(
              Math.round(topSalesChannel.revenue / Math.max(topSalesChannel.count, 1))
            )}`,
            meta:
              recentSalesList[0] != null
                ? `${clipTitle(recentSalesList[0].inventory_item?.title, 40)} sold ${timeAgo(recentSalesList[0].sold_at)}`
                : "Recent sales will surface channel momentum here",
            ctaLabel: "Open Sales",
            ctaHref: "/business/ledger?tab=sales",
            tone: "amber",
          }
        : {
            label: "Trend",
            title: "No recent sales trend yet",
            detail: "The last 30 days of sales will surface your strongest channel and average order value.",
            meta: listedCount > 0 ? `${listedCount} active listings are ready to track` : "List cards to start collecting sell-through data",
            ctaLabel: "View Ledger",
            ctaHref: "/business/ledger",
            tone: "amber",
          }
    );

    cards.push(
      alertItem && alertDays != null
        ? {
            label: "Alert",
            title: `${dashboardData.staleListedItems.length} listings are stale`,
            detail: `${fmt(dashboardData.staleCapitalCents)} is tied up in cards sitting 45+ days`,
            meta: `${clipTitle(alertItem.title, 42)} has been live ${alertDays}d`,
            ctaLabel: "Review Listings",
            ctaHref: "/business/ledger",
            tone: "red",
          }
        : {
            label: "Alert",
            title: unlistedCount > 0 ? `${unlistedCount} cards are still unlisted` : "No stale capital flagged today",
            detail:
              unlistedCount > 0
                ? `${fmt(dashboardData.idleCapitalCents)} is still waiting on a listing decision`
                : "Your active inventory does not show stale listed inventory right now.",
            meta:
              unlistedCount > 0
                ? `${sellThroughRate}% 30d sell-through on currently listed cards`
                : "Continue monitoring pricing and list velocity from the ledger",
            ctaLabel: unlistedCount > 0 ? "Review Inventory" : "Open Ledger",
            ctaHref: "/business/ledger",
            tone: "red",
          }
    );

    return cards;
  }, [
    activeCount,
    dashboardData.bestOpportunity,
    dashboardData.idleCapitalCents,
    dashboardData.staleCapitalCents,
    dashboardData.staleListedItems,
    listedCount,
    listRate,
    recentSales.length,
    recentSalesList,
    sellThroughRate,
    topSalesChannel,
    unlistedCount,
  ]);

  const funnelTotal = Math.max(unlistedCount + listedCount + soldLast30Count, 1);

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[var(--biz-text)] leading-snug">
            {businessName ?? "CardzCheck Business"}
          </h1>
          <p className="text-xs text-[var(--muted)]">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} overview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hasStorefronts ? (
            storefronts.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStorefrontDropdown((current) => !current)}
                  className={secondaryActionClass}
                >
                  Storefronts
                  <svg className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showStorefrontDropdown && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowStorefrontDropdown(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                      {storefronts.map((sf) => (
                        <a
                          key={sf.id}
                          href={sf.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => setShowStorefrontDropdown(false)}
                        >
                          <span className="truncate font-medium">{sf.display_name}</span>
                          {sf.is_primary && (
                            <span className="shrink-0 text-[9px] font-semibold text-[var(--biz-secondary)]">PRIMARY</span>
                          )}
                          <svg className="w-3 h-3 shrink-0 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ))}
                      <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                        <Link
                          href="/business/settings?section=storefronts"
                          onClick={() => setShowStorefrontDropdown(false)}
                          className="block border-t border-[var(--biz-border)] px-3 py-2 text-sm font-medium text-[var(--biz-primary)] transition-colors hover:bg-[var(--biz-surface-soft)]"
                        >
                          Manage storefronts
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowStorefrontDropdown(!showStorefrontDropdown)}
                className="cc-btn-secondary whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
              >
                {primaryStorefront.display_name}
                <svg className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5h5m0 0v5m0-5L10 14" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 9v10h10" />
                </svg>
              </button>
            )
          ) : ebayStoreHref ? (
            <a
              href={ebayStoreHref}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-btn-secondary whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium"
            >
              eBay Storefront
            </a>
          ) : (
            <Link
              href="/business/settings"
              className="cc-btn-secondary whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
            >
              Add Storefront
            </Link>
          )}
          <a
            href="/api/business/export?type=inventory"
            className="cc-btn-secondary whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            Export
          </a>
          <Link
            href="/business/ledger"
            className="cc-btn-primary flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </Link>
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <BusinessMetrics
        metrics={metrics}
        loading={metricsLoading}
        inventorySummary={inventorySummary}
        totalItemCount={items.length}
      />

      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-[var(--biz-warning)]">
          Database setup required.{" "}
          <Link href="/business/ledger" className="underline hover:text-amber-700">
            Go to Ledger
          </Link>{" "}
          to complete setup.
        </div>
      )}

      {/* ── Main data grid ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

            {/* Top Movers */}
            <Surface title="Top Movers · Est. Market Value">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  No inventory yet.{" "}
                  <Link href="/business/ledger" className="text-[var(--biz-primary)] hover:underline">
                    Add items
                  </Link>{" "}
                  to see top performers.
                </p>
              ) : dashboardData.topMovers.length === 0 ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  Add Est. Market Values to your items to see top movers.
                </p>
              ) : (
                <ul className="space-y-3">
                  {dashboardData.topMovers.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3">
                      <Link
                        href="/business/ledger"
                        className="truncate text-xs text-[var(--biz-text)] hover:underline transition-colors"
                        title={item.title}
                      >
                        {dashboardData.bestGradingCandidate ? "Open card →" : "Grade Hub →"}
                      </Link>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--biz-primary)]">
                        {fmt(item.current_market_value_cents!)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            {/* Inventory Funnel + Risk Signals combined */}
            <Surface title="Inventory Status">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">No inventory data yet.</p>
              ) : (
                <>
                  {/* Funnel numbers */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="text-center rounded-lg border border-[var(--biz-border)] bg-[var(--biz-bg)] py-3 px-2">
                      <p className="text-xl font-semibold tabular-nums text-[var(--biz-warning)]">
                        {dashboardData.unlisted.length}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Unlisted</p>
                    </div>
                    <div className="text-center rounded-lg border border-[var(--biz-border)] bg-[var(--biz-bg)] py-3 px-2">
                      <p className="text-xl font-semibold tabular-nums text-[var(--biz-text)]">
                        {dashboardData.listedCount}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Listed</p>
                    </div>
                    <div className="text-center rounded-lg border border-[var(--biz-border)] bg-[var(--biz-bg)] py-3 px-2">
                      <p className="text-xl font-semibold tabular-nums text-[var(--biz-primary)]">
                        {recentSalesLoading ? "—" : soldLast30Count}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Sold (30d)</p>
                    </div>
                  </div>

                  {/* Risk signals */}
                  <div
                    style={{ borderTop: "1px solid var(--biz-border)" }}
                    className="pt-4 space-y-2.5"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)] mb-3">
                      Risk Signals
                    </p>
                    {[
                      {
                        label: "Unlisted items",
                        count: dashboardData.unlisted.length,
                        color: dashboardData.unlisted.length > 0 ? "text-[var(--biz-warning)]" : "text-[var(--biz-muted)]",
                      },
                      {
                        label: "Items held > 60 days",
                        count: dashboardData.aged.length,
                        color: dashboardData.aged.length > 0 ? "text-red-500" : "text-[var(--biz-muted)]",
                      },
                      {
                        label: "Missing Est. Market Value",
                        count: dashboardData.noCmv.length,
                        color: dashboardData.noCmv.length > 0 ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)]",
                      },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-[var(--biz-muted)]">{label}</span>
                        <span className={`text-xs font-semibold tabular-nums ${color}`}>{count}</span>
                      </div>
                    ))}
                  </div>

                  {(dashboardData.unlisted.length > 0 || dashboardData.aged.length > 0) && (
                    <Link
                      href="/business/ledger"
                      className="mt-4 inline-block text-xs text-[var(--biz-primary)] hover:underline transition-colors"
                    >
                      Review in Ledger →
                    </Link>
                  )}

                  <p
                    style={{ borderTop: "1px solid var(--biz-border)" }}
                    className="mt-4 pt-3 text-[10px] text-[var(--biz-muted)]"
                  >
                    {dashboardData.activeCount} active item{dashboardData.activeCount !== 1 ? "s" : ""} in inventory
                  </p>
                </>
              )}
            </Surface>

            {/* Quick Actions */}
            <div className="flex flex-col gap-5">
              <Surface title="Quick Actions">
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/business/ledger"
                    className="cc-btn-primary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Inventory
                  </Link>
                  <a
                    href="/api/business/export?type=inventory"
                    className="cc-btn-secondary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                  </a>
                  {primaryStorefront ? (
                    <a
                      href={primaryStorefront.store_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cc-btn-secondary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {primaryStorefront.display_name}
                    </a>
                  ) : ebayStoreHref ? (
                    <a
                      href={ebayStoreHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cc-btn-secondary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      eBay Store
                    </a>
                  ) : (
                    <Link
                      href="/business/settings"
                      className="cc-btn-secondary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--muted)]"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Add Storefront
                    </Link>
                  )}
                  <Link
                    href="/business/grade-probability"
                    className="cc-btn-secondary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-[var(--biz-warning)]"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                    Grade Probability
                  </Link>
                </div>
              </Surface>

              {/* Grade callout */}
              <div
                style={{
                  border: "1px solid var(--biz-border)",
                  borderLeft: "3px solid var(--biz-accent-amber)",
                }}
                className="rounded-xl bg-[var(--biz-surface)] p-4 flex items-start gap-3"
              >
                <div className="shrink-0 w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center mt-0.5">
                  <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--biz-text)]">
                    Grade before you sell
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--biz-muted)] leading-snug">
                    Estimate grade probability and assess whether submitting to PSA/BGS is worth it.
                  </p>
                  <Link
                    href="/business/grade-probability"
                    className="mt-2.5 inline-block text-[11px] font-medium text-[var(--biz-warning)] hover:underline"
                  >
                    Try Grade Probability →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Activity ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Surface title="Recently Added">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  No items yet.{" "}
                  <Link href="/business/ledger" className="text-[var(--biz-primary)] hover:underline">
                    Add your first item
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {dashboardData.recentlyAdded.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`shrink-0 w-1.5 h-1.5 rounded-full ${
	                            item.status === "listed" || item.status === "pending_sale"
	                              ? "bg-[var(--biz-secondary)]"
	                              : item.status === "sold"
	                              ? "bg-[var(--biz-primary)]"
                              : "bg-slate-300"
                          }`}
                        />
                        <Link
                          href="/business/ledger"
                          className="truncate text-xs text-[var(--biz-text)] hover:underline transition-colors"
                          title={item.title}
                        >
                          {item.title}
                        </Link>
                      </div>
                      <span className="shrink-0 text-[10px] text-[var(--biz-muted)] tabular-nums">
                        {fmtDate(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {items.length > 8 && (
                <Link
                  href="/business/ledger"
                  className="mt-4 inline-block text-xs text-[var(--biz-primary)] hover:underline transition-colors"
                >
                  View all {items.length} items →
                </Link>
              )}
            </Surface>

            <Surface title="Recent Sales">
              {recentSalesLoading ? (
                <div className="space-y-2.5">
                  {[...Array(4)].map((_, i) => (
                    <SkeletonLine key={i} w={i % 2 === 0 ? "w-full" : "w-3/4"} />
                  ))}
                </div>
              ) : recentSales.length === 0 ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  No sales recorded yet.{" "}
                  <Link
                    href="/business/ledger?tab=sales"
                    className="text-[var(--biz-primary)] hover:underline"
                  >
                    Go to Sales tab
                  </Link>{" "}
                  to record one.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentSales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className="truncate text-xs text-[var(--biz-text)]"
                          title={sale.inventory_item?.title ?? "Sale"}
                        >
                          {sale.inventory_item?.title ?? "Sale"}
                        </p>
                        <p className="text-[10px] text-[var(--biz-muted)]">
                          {CHANNEL_LABELS[sale.channel] ?? sale.channel} · {fmtDate(sale.sold_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold tabular-nums text-[var(--biz-primary)]">
                          {fmt(sale.gross_revenue_cents)}
                        </p>
                        <p
                          className={`text-[10px] tabular-nums ${
                            sale.profit_cents >= 0 ? "text-[var(--biz-muted)]" : "text-red-500"
                          }`}
                        >
                          {sale.profit_cents >= 0 ? "+" : ""}
                          {fmt(sale.profit_cents)} profit
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {recentSales.length > 0 && (
                <Link
                  href="/business/ledger?tab=sales"
                  className="mt-4 inline-block text-xs text-[var(--biz-primary)] hover:underline transition-colors"
                >
                  View all sales →
                </Link>
              )}
            </Surface>
          </div>
    </div>
  );
}
