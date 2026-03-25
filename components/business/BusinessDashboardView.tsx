"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import EbayImportWizard from "@/components/business/EbayImportWizard";
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
  ebayAccount?: EbayAccountStatus | null;
  storefronts?: UserStorefront[];
}

function SkeletonLine({ w = "w-full" }: { w?: string }) {
  return <div className={`h-4 ${w} rounded bg-slate-100 animate-pulse`} />;
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
  const now = Date.now();
  const MS_PER_DAY = 86_400_000;
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showStorefrontDropdown, setShowStorefrontDropdown] = useState(false);
  const [syncingEbayOrders, setSyncingEbayOrders] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const primaryStorefront = storefronts.find((s) => s.is_primary) ?? storefronts[0] ?? null;
  const hasStorefronts = storefronts.length > 0;

  const dashboardData = useMemo(() => {
    const activeItems = items.filter(
      (it) => it.status !== "sold" && it.status !== "returned"
    );

    const topMovers = [...activeItems]
      .filter((it) => it.current_market_value_cents != null)
      .sort((a, b) => (b.current_market_value_cents ?? 0) - (a.current_market_value_cents ?? 0))
      .slice(0, 5);

    const unlisted = activeItems.filter((it) => it.status === "unlisted");
    const aged = activeItems.filter((it) => {
      if (!it.acquisition_date) return false;
      const acqMs = new Date(it.acquisition_date).getTime();
      return (now - acqMs) / MS_PER_DAY > 60;
    });
    const noCmv = activeItems.filter((it) => it.current_market_value_cents == null);

    const listedCount = activeItems.filter(
      (it) => it.status === "listed" || it.status === "pending_sale"
    ).length;

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

  const ebayKpis = useMemo(() => {
    const ebaySales = recentSales.filter((s) => s.channel === "ebay");
    const revenueCents = ebaySales.reduce(
      (sum, s) => sum + (s.sold_price_cents ?? 0) + (s.shipping_charged_cents ?? 0),
      0
    );
    const profitCents = ebaySales.reduce((sum, s) => sum + (s.profit_cents ?? 0), 0);
    const activeEbayListings = items.filter(
      (it) => it.channel === "ebay" && it.status === "listed"
    ).length;
    return { revenueCents, profitCents, salesCount: ebaySales.length, activeEbayListings };
  }, [recentSales, items]);

  async function handleSyncEbayOrders() {
    if (syncingEbayOrders) return;
    setSyncError(null);
    setSyncingEbayOrders(true);
    try {
      const res = await fetch("/api/business/ebay/orders/sync", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data.error ?? "Failed to sync eBay orders");
      }
      // No-op: dashboard metrics will refresh on next server render/navigation
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync eBay orders");
    } finally {
      setSyncingEbayOrders(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[var(--biz-text)] leading-snug">
            {businessName ?? "CardzCheck Business"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Business overview &amp; insights
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasStorefronts ? (
            <div className="relative">
              <button
                onClick={() => setShowStorefrontDropdown(!showStorefrontDropdown)}
                className="cc-btn-secondary whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {storefronts.length === 1 ? primaryStorefront!.display_name : "Storefronts"}
                {storefronts.length > 1 && (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
              {showStorefrontDropdown && storefronts.length > 1 && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowStorefrontDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
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
                          <span className="shrink-0 text-[9px] text-blue-500 font-semibold">PRIMARY</span>
                        )}
                        <svg className="w-3 h-3 shrink-0 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                    <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                      <Link
                        href="/business/settings"
                        className="flex items-center gap-2 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => setShowStorefrontDropdown(false)}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Manage Storefronts
                      </Link>
                    </div>
                  </div>
                </>
              )}
              {storefronts.length === 1 && primaryStorefront && (
                <a
                  href={primaryStorefront.store_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0"
                  aria-label={`Open ${primaryStorefront.display_name}`}
                />
              )}
            </div>
          ) : ebayStoreHref ? (
            <a
              href={ebayStoreHref}
              target="_blank"
              rel="noopener noreferrer"
              className="cc-btn-secondary whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium"
            >
              eBay Storefront
            </a>
          ) : (
            <Link
              href="/business/settings"
              className="cc-btn-secondary whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
            >
              Add Storefront
            </Link>
          )}
          <a
            href="/api/business/export?type=inventory"
            className="cc-btn-secondary whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium"
          >
            Export for Accounting
          </a>
          <Link
            href="/business/ledger"
            className="cc-btn-primary flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Inventory
          </Link>
        </div>
      </div>

      {/* ── KPI metrics row ─────────────────────────────────────────────── */}
      <BusinessMetrics
        metrics={metrics}
        loading={metricsLoading}
        inventorySummary={inventorySummary}
        totalItemCount={items.length}
        compact
      />

      {needsMigration && (
        <div
          style={{ border: "1px solid var(--biz-border)" }}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-[var(--biz-warning)]"
        >
          Database setup required.{" "}
          <Link href="/business/ledger" className="underline hover:text-amber-700">
            Go to Ledger
          </Link>{" "}
          to complete setup.
        </div>
      )}

      {/* ── Workflow band: Sales Channels + Grade & Actions ─────────────── */}
      {!needsMigration && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sales Channels panel */}
          <Surface className="p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-semibold text-[var(--biz-text)]">Sales Channels</h2>
              <Link
                href="/business/settings?section=storefronts"
                className="text-[11px] text-[var(--biz-muted)] hover:text-[var(--biz-text)] transition-colors"
              >
                Manage →
              </Link>
            </div>

            <div className="space-y-3">
              {/* eBay row */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-sm font-extrabold tracking-tighter leading-none shrink-0">
                    <span style={{ color: "#e43137" }}>e</span>
                    <span style={{ color: "#0064d3" }}>B</span>
                    <span style={{ color: "#f5af02" }}>a</span>
                    <span style={{ color: "#86b817" }}>y</span>
                  </span>
                  {ebayAccount?.connected ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Connected
                      </span>
                      {ebayAccount.ebay_username && (
                        <span className="truncate text-[11px] text-[var(--biz-muted)]">
                          {ebayAccount.ebay_username}
                        </span>
                      )}
                      {ebayAccount.top_rated_seller && (
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          TRS+
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-[var(--biz-muted)]">Not connected</span>
                  )}
                </div>
                {ebayAccount?.connected ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleSyncEbayOrders}
                      disabled={syncingEbayOrders}
                      className="cc-btn-secondary rounded px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                    >
                      {syncingEbayOrders ? "Syncing…" : "Sync"}
                    </button>
                    <Link
                      href="/business/ledger"
                      className="cc-btn-secondary rounded px-2 py-1 text-[11px] font-medium"
                    >
                      Ledger
                    </Link>
                  </div>
                ) : (
                  <a
                    href="/api/auth/ebay"
                    className="cc-btn-primary shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold"
                  >
                    Connect eBay
                  </a>
                )}
              </div>

              {/* Whatnot row */}
              {(() => {
                const wn = storefronts.find((s) => s.platform === "whatnot");
                return (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-semibold text-purple-700 shrink-0">Whatnot</span>
                      {wn ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                          Connected
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--biz-muted)]">Not configured</span>
                      )}
                    </div>
                    {wn ? (
                      <a
                        href={wn.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cc-btn-secondary shrink-0 rounded px-2 py-1 text-[11px] font-medium"
                      >
                        View Store
                      </a>
                    ) : (
                      <Link
                        href="/business/settings?section=storefronts"
                        className="cc-btn-secondary shrink-0 rounded px-2.5 py-1 text-[11px] font-medium"
                      >
                        + Add
                      </Link>
                    )}
                  </div>
                );
              })()}

              {/* Website row */}
              {(() => {
                const web = storefronts.find((s) => s.platform === "website" || s.platform === "shopify");
                return (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-semibold text-sky-700 shrink-0">Website</span>
                      {web ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                          Connected
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--biz-muted)]">Not configured</span>
                      )}
                    </div>
                    {web ? (
                      <a
                        href={web.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cc-btn-secondary shrink-0 rounded px-2 py-1 text-[11px] font-medium"
                      >
                        View Store
                      </a>
                    ) : (
                      <Link
                        href="/business/settings?section=storefronts"
                        className="cc-btn-secondary shrink-0 rounded px-2.5 py-1 text-[11px] font-medium"
                      >
                        + Add
                      </Link>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* eBay KPIs when connected */}
            {ebayAccount?.connected && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Active", value: String(ebayKpis.activeEbayListings) },
                  { label: "Sales (30d)", value: String(ebayKpis.salesCount) },
                  { label: "Revenue (30d)", value: fmt(ebayKpis.revenueCents) },
                  { label: "Profit (30d)", value: fmt(ebayKpis.profitCents) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{ border: "1px solid var(--biz-border)" }}
                    className="rounded-lg px-2.5 py-2"
                  >
                    <p className="mb-0.5 text-[10px] uppercase tracking-normal text-[var(--biz-muted)]">{label}</p>
                    <p className="text-base font-semibold tabular-nums text-[var(--biz-text)]">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {syncError && (
              <p className="mt-2 text-[10px] text-red-600">{syncError}</p>
            )}
          </Surface>

          {/* Grade probability + key actions */}
          <Surface title="Grade & Quick Actions">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center mt-0.5">
                  <svg
                    className="w-3.5 h-3.5 text-amber-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--biz-text)]">
                    Use the Grade Probability Engine before you sell
                  </p>
                  <p className="mt-1 text-xs text-[var(--biz-muted)]">
                    Estimate grade probabilities to help you decide whether submitting to PSA/BGS is worth the fees.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/business/grade-probability"
                  className="cc-btn-primary rounded-md px-3 py-2 text-xs font-semibold"
                >
                  Grade Probability
                </Link>
                <Link
                  href="/business/ledger"
                  className="cc-btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                >
                  Add Inventory
                </Link>
                <a
                  href="/api/business/export?type=inventory"
                  className="cc-btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                >
                  Export
                </a>
                {primaryStorefront ? (
                  <a
                    href={primaryStorefront.store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cc-btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                  >
                    {primaryStorefront.display_name}
                  </a>
                ) : ebayStoreHref ? (
                  <a
                    href={ebayStoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cc-btn-secondary rounded-md px-3 py-2 text-xs font-medium"
                  >
                    eBay Store
                  </a>
                ) : (
                  <Link
                    href="/business/settings"
                    className="cc-btn-secondary rounded-md px-3 py-2 text-xs font-medium text-[var(--muted)]"
                  >
                    Add Storefront
                  </Link>
                )}
              </div>
            </div>
          </Surface>
        </div>
      )}

      {showImportWizard && (
        <EbayImportWizard onClose={() => setShowImportWizard(false)} />
      )}

      {/* ── At a Glance ─────────────────────────────────────────────────── */}
      {!needsMigration && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Highest-value inventory + alerts */}
          <div className="space-y-6">
            <Surface title="Highest-Value Inventory · Est. Market Value">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  No inventory yet.{" "}
                  <Link href="/business/ledger" className="text-[var(--biz-primary)] hover:underline">
                    Add items
                  </Link>{" "}
                  to see your highest-value inventory.
                </p>
              ) : dashboardData.topMovers.length === 0 ? (
                <p className="text-[var(--biz-muted)] text-xs">
                  Add Est. Market Values to your items to see highest-value inventory.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {dashboardData.topMovers.map((item) => (
                    <li key={item.id} className="flex items-center justify-between">
                      <Link
                        href="/business/ledger"
                        className="max-w-[200px] truncate text-xs text-[var(--biz-text)] transition-colors hover:underline"
                        title={item.title}
                      >
                        {item.title}
                      </Link>
                      <span className="ml-2 shrink-0 text-xs font-semibold tabular-nums text-[var(--biz-primary)]">
                        {fmt(item.current_market_value_cents!)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            <Surface title="Inventory Alerts">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">No active inventory to analyze.</p>
              ) : (
                <ul className="space-y-2.5">
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-[var(--biz-muted)]">Unlisted items</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.unlisted.length > 0 ? "text-[var(--biz-warning)]" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {dashboardData.unlisted.length}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-[var(--biz-muted)]">Items held &gt; 60 days</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.aged.length > 0 ? "text-red-600" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {dashboardData.aged.length}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-xs text-[var(--biz-muted)]">Missing Est. Market Value</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        dashboardData.noCmv.length > 0 ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)]"
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
                  className="mt-4 inline-block text-xs text-[var(--biz-primary)] transition-colors hover:underline"
                >
                  Review inventory →
                </Link>
              )}
            </Surface>
          </div>

          {/* Right: Funnel + Recent Sales */}
          <div className="space-y-6">
            <Surface title="Inventory Funnel">
              {itemsEmpty ? (
                <p className="text-[var(--biz-muted)] text-xs">No inventory data yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-semibold tabular-nums text-[var(--biz-warning)]">
                      {dashboardData.unlisted.length}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Unlisted</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold tabular-nums text-[var(--biz-text)]">
                      {dashboardData.listedCount}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Listed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold tabular-nums text-[var(--biz-primary)]">
                      {recentSalesLoading ? "—" : soldLast30Count}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--biz-muted)]">Sold (30d)</p>
                  </div>
                </div>
              )}
              {!itemsEmpty && (
                <div
                  style={{ borderTop: "1px solid var(--biz-border)" }}
                  className="mt-4 pt-3"
                >
                  <p className="text-[10px] text-[var(--biz-muted)]">
                    {dashboardData.activeCount} active item
                    {dashboardData.activeCount !== 1 ? "s" : ""} in inventory
                  </p>
                </div>
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
                <ul className="space-y-2.5">
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
                            sale.profit_cents >= 0 ? "text-[var(--biz-muted)]" : "text-red-600"
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
                  className="mt-4 inline-block text-xs text-[var(--biz-primary)] transition-colors hover:underline"
                >
                  View all sales →
                </Link>
              )}
            </Surface>
          </div>
        </div>
      )}

      {/* ── Recently Added ──────────────────────────────────────────────── */}
      {!needsMigration && (
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
                          ? "bg-blue-400"
                          : item.status === "sold"
                          ? "bg-emerald-400"
                          : "bg-slate-300"
                      }`}
                    />
                    <Link
                      href="/business/ledger"
                      className="truncate text-xs text-[var(--biz-text)] transition-colors hover:underline"
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
              className="mt-4 inline-block text-xs text-[var(--biz-primary)] transition-colors hover:underline"
            >
              View all {items.length} items →
            </Link>
          )}
        </Surface>
      )}
    </div>
  );
}
