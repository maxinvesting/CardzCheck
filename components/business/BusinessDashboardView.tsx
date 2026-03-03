"use client";

import Link from "next/link";
import { useMemo } from "react";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

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
}

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-4 ${w} bg-gray-800 rounded animate-pulse`} />;
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
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
}: Props) {
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;

  // Compute derived dashboard data from items
  const dashboardData = useMemo(() => {
    const activeItems = items.filter(
      (it) => it.status !== "sold" && it.status !== "returned"
    );

    // Top 5 items by Est. Market Value
    const topMovers = [...activeItems]
      .filter((it) => it.current_market_value_cents != null)
      .sort((a, b) => (b.current_market_value_cents ?? 0) - (a.current_market_value_cents ?? 0))
      .slice(0, 5);

    // Risk signals
    const unlisted = activeItems.filter((it) => it.status === "unlisted");
    const aged = activeItems.filter((it) => {
      if (!it.acquisition_date) return false;
      const acqMs = new Date(it.acquisition_date).getTime();
      return (now - acqMs) / MS_PER_DAY > 60;
    });
    const noCmv = activeItems.filter((it) => it.current_market_value_cents == null);

    // Funnel
    const listedCount = activeItems.filter(
      (it) => it.status === "listed" || it.status === "pending_sale"
    ).length;

    // Recently added — last 8 by created_at
    const recentlyAdded = [...items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    return {
      topMovers,
      unlisted,
      aged,
      noCmv,
      listedCount,
      recentlyAdded,
      activeCount: activeItems.length,
    };
  }, [items, now, MS_PER_DAY]);

  const soldLast30Count = recentSales.length;
  const itemsEmpty = items.length === 0;

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {businessName ? `${businessName}` : "CardzCheck Business"}
          </h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Business overview &amp; insights
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ebayStoreHref ? (
            <a
              href={ebayStoreHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 border border-gray-700 text-gray-300 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
            >
              eBay Storefront
            </a>
          ) : (
            <Link
              href="/business/settings"
              className="px-3 py-1.5 border border-gray-600 text-gray-400 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
            >
              Add eBay Storefront
            </Link>
          )}
          <a
            href="/api/business/export?type=inventory"
            className="px-3 py-1.5 border border-gray-700 text-gray-300 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
          >
            Export for Accounting
          </a>
          <Link
            href="/business/ledger"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Inventory
          </Link>
        </div>
      </div>

      {/* KPI metrics row */}
      <BusinessMetrics
        metrics={metrics}
        loading={metricsLoading}
        inventorySummary={inventorySummary}
        totalItemCount={items.length}
        compact
      />

      {needsMigration && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 text-amber-300 text-sm">
          Database setup required.{" "}
          <Link href="/business/ledger" className="underline hover:text-amber-200">
            Go to Ledger
          </Link>{" "}
          to complete setup.
        </div>
      )}

      {/* At a Glance — 2-column grid on desktop */}
      {!needsMigration && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Top movers + Risk signals */}
          <div className="space-y-4">
            {/* Top movers by Est. Market Value */}
            <PanelCard title="Top Movers · Est. Market Value">
              {itemsEmpty ? (
                <p className="text-gray-500 text-xs">
                  No inventory yet.{" "}
                  <Link href="/business/ledger" className="text-emerald-400 hover:underline">
                    Add items
                  </Link>{" "}
                  to see top performers.
                </p>
              ) : dashboardData.topMovers.length === 0 ? (
                <p className="text-gray-500 text-xs">
                  Add Est. Market Values to your items to see top movers.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dashboardData.topMovers.map((item) => (
                    <li key={item.id} className="flex items-center justify-between">
                      <Link
                        href="/business/ledger"
                        className="text-xs text-gray-300 hover:text-white truncate max-w-[200px] transition-colors"
                        title={item.title}
                      >
                        {item.title}
                      </Link>
                      <span className="text-xs font-semibold tabular-nums text-emerald-400 ml-2 shrink-0">
                        {fmt(item.current_market_value_cents!)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            {/* Risk signals */}
            <PanelCard title="Risk Signals">
              {itemsEmpty ? (
                <p className="text-gray-500 text-xs">No active inventory to analyze.</p>
              ) : (
                <ul className="space-y-2">
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Unlisted items</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.unlisted.length > 0
                          ? "text-amber-400"
                          : "text-gray-500"
                      }`}
                    >
                      {dashboardData.unlisted.length}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Items held &gt; 60 days</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.aged.length > 0 ? "text-red-400" : "text-gray-500"
                      }`}
                    >
                      {dashboardData.aged.length}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Missing Est. Market Value</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.noCmv.length > 0
                          ? "text-gray-400"
                          : "text-gray-500"
                      }`}
                    >
                      {dashboardData.noCmv.length}
                    </span>
                  </li>
                </ul>
              )}
              {(dashboardData.unlisted.length > 0 || dashboardData.aged.length > 0) && (
                <Link
                  href="/business/ledger"
                  className="mt-3 inline-block text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Review in Ledger →
                </Link>
              )}
            </PanelCard>
          </div>

          {/* Right: Funnel + Action Center */}
          <div className="space-y-4">
            {/* Inventory funnel snapshot */}
            <PanelCard title="Inventory Funnel">
              {itemsEmpty ? (
                <p className="text-gray-500 text-xs">No inventory data yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums text-amber-400">
                      {dashboardData.unlisted.length}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
                      Unlisted
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums text-blue-400">
                      {dashboardData.listedCount}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
                      Listed
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums text-emerald-400">
                      {recentSalesLoading ? "—" : soldLast30Count}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
                      Sold (30d)
                    </p>
                  </div>
                </div>
              )}
              {!itemsEmpty && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <p className="text-[10px] text-gray-500">
                    {dashboardData.activeCount} active item
                    {dashboardData.activeCount !== 1 ? "s" : ""} in inventory
                  </p>
                </div>
              )}
            </PanelCard>

            {/* Action center */}
            <PanelCard title="Quick Actions">
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/business/ledger"
                  className="flex items-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors text-xs font-medium"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Inventory
                </Link>
                <a
                  href="/api/business/export?type=inventory"
                  className="flex items-center gap-2 px-3 py-2.5 border border-gray-700 text-gray-300 hover:bg-gray-800 rounded-md transition-colors text-xs font-medium"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export
                </a>
                {ebayStoreHref ? (
                  <a
                    href={ebayStoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2.5 border border-gray-700 text-gray-300 hover:bg-gray-800 rounded-md transition-colors text-xs font-medium"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    eBay Store
                  </a>
                ) : (
                  <Link
                    href="/business/settings"
                    className="flex items-center gap-2 px-3 py-2.5 border border-gray-700 text-gray-400 hover:bg-gray-800 rounded-md transition-colors text-xs font-medium"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Add eBay Store
                  </Link>
                )}
                <Link
                  href="/business/consultant"
                  className="flex items-center gap-2 px-3 py-2.5 border border-gray-700 text-gray-300 hover:bg-gray-800 rounded-md transition-colors text-xs font-medium"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Consultant
                </Link>
              </div>
            </PanelCard>
          </div>
        </div>
      )}

      {/* Recent Activity — 2-column grid on desktop */}
      {!needsMigration && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recently added items */}
          <PanelCard title="Recently Added">
            {itemsEmpty ? (
              <p className="text-gray-500 text-xs">
                No items yet.{" "}
                <Link href="/business/ledger" className="text-emerald-400 hover:underline">
                  Add your first item
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {dashboardData.recentlyAdded.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                          item.status === "listed" || item.status === "pending_sale"
                            ? "bg-blue-400"
                            : item.status === "sold"
                            ? "bg-emerald-400"
                            : "bg-gray-500"
                        }`}
                      />
                      <Link
                        href="/business/ledger"
                        className="text-xs text-gray-300 hover:text-white truncate transition-colors"
                        title={item.title}
                      >
                        {item.title}
                      </Link>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
                      {fmtDate(item.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 8 && (
              <Link
                href="/business/ledger"
                className="mt-3 inline-block text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                View all {items.length} items →
              </Link>
            )}
          </PanelCard>

          {/* Recent sales */}
          <PanelCard title="Recent Sales">
            {recentSalesLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <SkeletonLine key={i} w={i % 2 === 0 ? "w-full" : "w-3/4"} />
                ))}
              </div>
            ) : recentSales.length === 0 ? (
              <p className="text-gray-500 text-xs">
                No sales recorded yet.{" "}
                <Link
                  href="/business/ledger?tab=sales"
                  className="text-emerald-400 hover:underline"
                >
                  Go to Sales tab
                </Link>{" "}
                to record one.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentSales.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="text-xs text-gray-300 truncate"
                        title={sale.inventory_item?.title ?? "Sale"}
                      >
                        {sale.inventory_item?.title ?? "Sale"}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {CHANNEL_LABELS[sale.channel] ?? sale.channel} ·{" "}
                        {fmtDate(sale.sold_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold tabular-nums text-emerald-400">
                        {fmt(sale.gross_revenue_cents)}
                      </p>
                      <p
                        className={`text-[10px] tabular-nums ${
                          sale.profit_cents >= 0 ? "text-gray-500" : "text-red-400"
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
                className="mt-3 inline-block text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                View all sales →
              </Link>
            )}
          </PanelCard>
        </div>
      )}
    </div>
  );
}
