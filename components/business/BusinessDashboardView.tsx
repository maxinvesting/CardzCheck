"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import { Surface } from "@/components/ui/Surface";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
  EbayAccountStatus,
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
    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </span>
  );
}

function FunnelBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
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

const SIGNAL_STYLES: Record<SignalTone, { badge: string; button: string; border: string }> = {
  emerald: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    button: "bg-emerald-600 text-white hover:bg-emerald-700",
    border: "border-emerald-200",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    button: "bg-amber-500 text-white hover:bg-amber-600",
    border: "border-amber-200",
  },
  red: {
    badge: "border-red-200 bg-red-50 text-red-700",
    button: "bg-red-600 text-white hover:bg-red-700",
    border: "border-red-200",
  },
};

const CHANNEL_LABELS: Record<string, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  instagram: "Instagram",
  show: "Show",
  local: "Local",
  other: "Other",
};

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
  ebayAccount?: EbayAccountStatus | null;
  storefronts?: UserStorefront[];
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
  ebayAccount,
  storefronts = [],
}: Props) {
  const [showStorefrontDropdown, setShowStorefrontDropdown] = useState(false);
  const [syncingEbayOrders, setSyncingEbayOrders] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const primaryStorefront = storefronts.find((store) => store.is_primary) ?? storefronts[0] ?? null;
  const hasStorefronts = storefronts.length > 0;

  const dashboardData = useMemo(() => {
    const activeItems = items.filter((item) => item.status !== "sold" && item.status !== "returned");
    const listedItems = activeItems.filter(
      (item) => item.status === "listed" || item.status === "pending_sale"
    );
    const unlistedItems = activeItems.filter((item) => item.status === "unlisted");
    const rawItems = activeItems.filter(
      (item) => item.condition_status === "raw" || !item.grade?.trim()
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
      .slice(0, 4);

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
      listedItems,
      unlistedItems,
      rawItems,
      staleListedItems,
      topInventory,
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
        .slice(0, 4),
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

  const ebayKpis = useMemo(() => {
    const ebaySales = recentSales.filter((sale) => sale.channel === "ebay");
    return {
      revenueCents: ebaySales.reduce(
        (sum, sale) => sum + (sale.sold_price_cents ?? 0) + (sale.shipping_charged_cents ?? 0),
        0
      ),
      profitCents: ebaySales.reduce((sum, sale) => sum + (sale.profit_cents ?? 0), 0),
      salesCount: ebaySales.length,
      activeEbayListings: items.filter(
        (item) => item.channel === "ebay" && item.status === "listed"
      ).length,
    };
  }, [items, recentSales]);

  async function handleSyncEbayOrders() {
    if (syncingEbayOrders) return;
    setSyncError(null);
    setSyncingEbayOrders(true);
    try {
      const res = await fetch("/api/business/ebay/orders/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data.error ?? "Failed to sync eBay orders");
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync eBay orders");
    } finally {
      setSyncingEbayOrders(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--biz-text)]">
            {businessName ?? "CardzCheck Business"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Operator view for inventory, sell-through, and pricing decisions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasStorefronts ? (
            storefronts.length === 1 && primaryStorefront ? (
              <a
                href={primaryStorefront.store_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
              >
                {primaryStorefront.display_name}
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5h5m0 0v5m0-5L10 14" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 9v10h10" />
                </svg>
              </a>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowStorefrontDropdown((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
                >
                  Storefronts
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showStorefrontDropdown && (
                  <>
                    <button
                      type="button"
                      aria-label="Close storefront menu"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setShowStorefrontDropdown(false)}
                    />
                    <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--biz-border)] bg-white shadow-lg">
                      {storefronts.map((store) => (
                        <a
                          key={store.id}
                          href={store.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowStorefrontDropdown(false)}
                          className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
                        >
                          <span className="truncate font-medium">{store.display_name}</span>
                          {store.is_primary && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                              Primary
                            </span>
                          )}
                        </a>
                      ))}
                      <Link
                        href="/business/settings?section=storefronts"
                        onClick={() => setShowStorefrontDropdown(false)}
                        className="block border-t border-[var(--biz-border)] px-3 py-2.5 text-sm font-medium text-[var(--biz-primary)] transition-colors hover:bg-[var(--biz-surface-soft)]"
                      >
                        Manage storefronts
                      </Link>
                    </div>
                  </>
                )}
              </div>
            )
          ) : ebayStoreHref ? (
            <a
              href={ebayStoreHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
            >
              eBay storefront
            </a>
          ) : (
            <Link
              href="/business/settings?section=storefronts"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
            >
              Add storefront
            </Link>
          )}

          {ebayAccount?.connected ? (
            <button
              type="button"
              onClick={handleSyncEbayOrders}
              disabled={syncingEbayOrders}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncingEbayOrders ? "Syncing eBay…" : "Sync eBay Orders"}
            </button>
          ) : (
            <a
              href="/api/auth/ebay"
              className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Connect eBay
            </a>
          )}

          <a
            href="/api/business/export?type=inventory"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--biz-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface-soft)]"
          >
            Export
          </a>

          <Link
            href="/business/ledger"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--biz-primary)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#09643e]"
          >
            Add Inventory
          </Link>
        </div>
      </div>

      {needsMigration && (
        <Surface className="border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">Business setup still needs a database migration.</p>
              <p className="mt-1 text-sm text-amber-700">
                Finish setup in the Ledger before relying on dashboard signals.
              </p>
            </div>
            <Link
              href="/business/ledger"
              className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              Open Ledger
            </Link>
          </div>
        </Surface>
      )}

      <BusinessMetrics
        metrics={metrics}
        loading={metricsLoading}
        inventorySummary={inventorySummary}
        totalItemCount={items.length}
        compact
      />

      {!needsMigration && (
        <>
          <div className="grid gap-3 xl:grid-cols-3">
            {signalCards.map((signal) => {
              const styles = SIGNAL_STYLES[signal.tone];
              return (
                <Surface key={signal.label} className={`p-4 ${styles.border}`}>
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles.badge}`}>
                        {signal.label}
                      </span>
                      <Link
                        href={signal.ctaHref}
                        className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${styles.button}`}
                      >
                        {signal.ctaLabel}
                      </Link>
                    </div>
                    <div>
                      <p className="text-base font-semibold leading-snug text-[var(--biz-text)]">
                        {signal.title}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-700">{signal.detail}</p>
                    </div>
                    <p className="mt-auto text-xs text-slate-500">{signal.meta}</p>
                  </div>
                </Surface>
              );
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-[0.95fr_1fr_1.15fr]">
            <Surface className="p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Inventory Funnel</SectionLabel>
                <Link href="/business/ledger" className="text-xs font-semibold text-[var(--biz-primary)] hover:underline">
                  Open ledger
                </Link>
              </div>

              {activeCount === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  Add inventory to start tracking list rate, sell-through, and stale capital.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {[
                    {
                      label: "Unlisted",
                      count: unlistedCount,
                      share: (unlistedCount / funnelTotal) * 100,
                      color: "#f59e0b",
                    },
                    {
                      label: "Listed",
                      count: listedCount,
                      share: (listedCount / funnelTotal) * 100,
                      color: "#0b7a4b",
                    },
                    {
                      label: "Sold (30d)",
                      count: soldLast30Count,
                      share: (soldLast30Count / funnelTotal) * 100,
                      color: "#2563eb",
                    },
                  ].map((row) => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700">{row.label}</span>
                        <span className="font-semibold tabular-nums text-[var(--biz-text)]">
                          {recentSalesLoading && row.label === "Sold (30d)" ? "—" : row.count}
                        </span>
                      </div>
                      <FunnelBar value={row.share} color={row.color} />
                    </div>
                  ))}

                  <div className="grid grid-cols-2 gap-2 border-t border-[var(--biz-border)] pt-3">
                    <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">List Rate</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">{listRate}%</p>
                    </div>
                    <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Sell-through</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">{sellThroughRate}%</p>
                    </div>
                  </div>
                </div>
              )}
            </Surface>

            <Surface className="p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Recent Sales</SectionLabel>
                <Link href="/business/ledger?tab=sales" className="text-xs font-semibold text-[var(--biz-primary)] hover:underline">
                  Sales tab
                </Link>
              </div>

              {recentSalesLoading ? (
                <div className="mt-4 space-y-2.5">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="h-14 animate-pulse rounded-lg bg-[var(--biz-surface-soft)]" />
                  ))}
                </div>
              ) : recentSalesList.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  No sales recorded in the last 30 days. Record sales from the ledger to track velocity.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {recentSalesList.map((sale) => {
                    const profit = sale.profit_cents ?? 0;
                    const profitColor = profit >= 0 ? "text-emerald-700" : "text-red-700";
                    return (
                      <div
                        key={sale.id}
                        className="rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--biz-text)]" title={sale.inventory_item?.title ?? "Sale"}>
                              {sale.inventory_item?.title ?? "Sale"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {CHANNEL_LABELS[sale.channel] ?? sale.channel} • {timeAgo(sale.sold_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums text-[var(--biz-text)]">
                              {fmt(sale.gross_revenue_cents)}
                            </p>
                            <p className={`text-xs font-medium tabular-nums ${profitColor}`}>
                              {profit >= 0 ? "+" : ""}
                              {fmt(profit)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Surface>

            <Surface className="p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Top Movers</SectionLabel>
                <Link href="/business/ledger" className="text-xs font-semibold text-[var(--biz-primary)] hover:underline">
                  Inventory tab
                </Link>
              </div>

              {dashboardData.topInventory.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">
                  Add market values in the ledger to surface your highest-value inventory here.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {dashboardData.topInventory.map((item) => {
                    const age = daysSince(item.acquisition_date);
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/card/${item.id}?from=business`}
                            className="truncate text-sm font-semibold text-[var(--biz-primary)] underline-offset-2 hover:underline"
                            title={item.title}
                          >
                            {clipTitle(item.title, 58)}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {gradeLabel(item)}
                            {age != null ? ` • ${age}d held` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-[var(--biz-text)]">
                            {fmt(item.current_market_value_cents ?? 0)}
                          </p>
                          <Link
                            href={`/card/${item.id}?from=business`}
                            className="mt-1 inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            Open card
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Surface>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <Surface className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <SectionLabel>Grading Insight</SectionLabel>
                  <p className="mt-1 text-base font-semibold text-[var(--biz-text)]">
                    {dashboardData.bestGradingCandidate
                      ? `${clipTitle(dashboardData.bestGradingCandidate.title, 56)} is your top raw grading candidate`
                      : "No raw grading candidate is surfaced yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {dashboardData.bestGradingCandidate
                      ? `Highest-value raw card in active inventory at ${fmt(
                          dashboardData.bestGradingCandidate.current_market_value_cents ?? 0
                        )}. Run Grade Hub to see the grade distribution, break-even point, and upside before you submit.`
                      : "When you add raw inventory with images and market value, the dashboard will flag the strongest grading candidate here."}
                  </p>
                </div>
                <Link
                  href={dashboardData.bestGradingCandidate ? `/card/${dashboardData.bestGradingCandidate.id}?from=business` : "/grade-hub"}
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  {dashboardData.bestGradingCandidate ? "Open Card" : "Open Grade Hub"}
                </Link>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Raw Cards</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                    {dashboardData.rawItems.length}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Candidate Value</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                    {dashboardData.bestGradingCandidate
                      ? fmt(dashboardData.bestGradingCandidate.current_market_value_cents ?? 0)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Unlisted Raw</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                    {
                      dashboardData.rawItems.filter((item) => item.status === "unlisted").length
                    }
                  </p>
                </div>
              </div>
            </Surface>

            <Surface className="p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Channel Snapshot</SectionLabel>
                <Link
                  href="/business/settings?section=storefronts"
                  className="text-xs font-semibold text-[var(--biz-primary)] hover:underline"
                >
                  Manage channels
                </Link>
              </div>

              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--biz-text)]">eBay</p>
                    <p className="text-xs text-slate-500">
                      {ebayAccount?.connected ? "Connected" : "Not connected"}
                      {ebayAccount?.ebay_username ? ` • ${ebayAccount.ebay_username}` : ""}
                    </p>
                  </div>
                  {ebayAccount?.connected ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-[var(--biz-text)]">
                        {ebayKpis.activeEbayListings}
                      </p>
                      <p className="text-xs text-slate-500">active listings</p>
                    </div>
                  ) : (
                    <a
                      href="/api/auth/ebay"
                      className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                    >
                      Connect
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--biz-text)]">Whatnot</p>
                    <p className="text-xs text-slate-500">
                      {storefronts.some((store) => store.platform === "whatnot")
                        ? "Configured"
                        : "Not configured"}
                    </p>
                  </div>
                  <Link
                    href="/business/settings?section=storefronts"
                    className="inline-flex items-center rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface)]"
                  >
                    Manage
                  </Link>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--biz-text)]">Website</p>
                    <p className="text-xs text-slate-500">
                      {storefronts.some(
                        (store) => store.platform === "website" || store.platform === "shopify"
                      )
                        ? "Configured"
                        : "Not configured"}
                    </p>
                  </div>
                  <Link
                    href="/business/settings?section=storefronts"
                    className="inline-flex items-center rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-surface)]"
                  >
                    Manage
                  </Link>
                </div>
              </div>

              {ebayAccount?.connected && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--biz-border)] pt-3">
                  <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">eBay Sales (30d)</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                      {ebayKpis.salesCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[var(--biz-surface-soft)] px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">eBay Profit (30d)</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--biz-text)]">
                      {fmt(ebayKpis.profitCents)}
                    </p>
                  </div>
                </div>
              )}

              {syncError && <p className="mt-3 text-xs text-red-700">{syncError}</p>}
            </Surface>
          </div>
        </>
      )}
    </div>
  );
}
