"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import EbayImportWizard from "@/components/business/EbayImportWizard";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
  EbayAccountStatus,
  UserStorefront,
} from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";

/* ── Formatters ──────────────────────────────────────────────────────────── */

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

function timeAgo(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

const CHANNEL_LABELS: Record<string, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  instagram: "Instagram",
  show: "Show",
  local: "Local",
  other: "Other",
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

function AnimatedBar({
  pct,
  color,
  delay = 0,
  height = "h-2.5",
}: {
  pct: number;
  color: string;
  delay?: number;
  height?: string;
}) {
  return (
    <div className={`relative ${height} w-full overflow-hidden rounded-full`} style={{ background: "rgba(255,255,255,0.05)" }}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(pct, 0)}%` }}
        transition={{ delay, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.12em]"
      style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
    >
      {children}
    </span>
  );
}

function CardSurface({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function GhostBtn({
  children,
  className = "",
  style = {},
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { style?: React.CSSProperties }) {
  return (
    <button
      className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#94a3b8",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Types ───────────────────────────────────────────────────────────────── */

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

/* ── AI Market Signals (hardcoded — TODO: replace with live signal API) ──── */

const MARKET_SIGNALS = [
  {
    type: "OPPORTUNITY",
    headline: "NFL Draft is 34 days out — Jayden Daniels raw cards spike +22% in this window",
    rationale: "Historical comps show a consistent price peak 2–3 weeks before draft day. Window closes fast.",
    cta: "View Cards",
    ctaHref: "/business/ledger",
    borderColor: "#f0b429",
    badgeBg: "rgba(240,180,41,0.12)",
    badgeColor: "#f0b429",
  },
  {
    type: "TREND",
    headline: "Your Topps Finest Daniels Auto is #1 highest-value card in inventory — unlisted",
    rationale: "Est. market value ~$340. Comparable PSA 9s sold in the last 72h at $315–$360.",
    cta: "List Now",
    ctaHref: "/business/ledger",
    borderColor: "#10b981",
    badgeBg: "rgba(16,185,129,0.12)",
    badgeColor: "#10b981",
  },
  {
    type: "ALERT",
    headline: "16 unlisted cards = ~$892 in idle capital. Your sell-through rate is 12.5%",
    rationale: "Average time-to-sell for similar sellers after listing: 8 days. These cards are sitting.",
    cta: "Review Inventory",
    ctaHref: "/business/ledger",
    borderColor: "#ef4444",
    badgeBg: "rgba(239,68,68,0.1)",
    badgeColor: "#f87171",
  },
] as const;

/* ── Stagger animation helpers ───────────────────────────────────────────── */

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: "easeOut", delay },
});

/* ── Main component ──────────────────────────────────────────────────────── */

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
  const MS_PER_DAY = 86_400_000;
  const now = Date.now();

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
      .slice(0, 8);
    const unlisted = activeItems.filter((it) => it.status === "unlisted");
    const listedCount = activeItems.filter(
      (it) => it.status === "listed" || it.status === "pending_sale"
    ).length;
    return { topMovers, unlisted, activeCount: activeItems.length, listedCount };
  }, [items, now, MS_PER_DAY]);

  const soldLast30Count = recentSales.length;
  const itemsEmpty = items.length === 0;

  const ebayKpis = useMemo(() => {
    const ebaySales = recentSales.filter((s) => s.channel === "ebay");
    return {
      revenueCents: ebaySales.reduce((sum, s) => sum + (s.sold_price_cents ?? 0) + (s.shipping_charged_cents ?? 0), 0),
      profitCents: ebaySales.reduce((sum, s) => sum + (s.profit_cents ?? 0), 0),
      salesCount: ebaySales.length,
      activeEbayListings: items.filter((it) => it.channel === "ebay" && it.status === "listed").length,
    };
  }, [recentSales, items]);

  // Funnel percentages — all three bars relative to total for visual proportion
  const funnelTotal = Math.max(
    dashboardData.unlisted.length + dashboardData.listedCount + soldLast30Count,
    1
  );

  async function handleSyncEbayOrders() {
    if (syncingEbayOrders) return;
    setSyncError(null);
    setSyncingEbayOrders(true);
    try {
      const res = await fetch("/api/business/ebay/orders/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error ?? "Failed to sync eBay orders");
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync eBay orders");
    } finally {
      setSyncingEbayOrders(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* ── 1. Page Header ─────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0)} className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: "#f8fafc", fontFamily: "'Sora', sans-serif" }}
          >
            {businessName ?? "CardzCheck Business"}
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "#64748b" }}>
            Market intelligence dashboard
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Storefront button */}
          {hasStorefronts ? (
            <div className="relative">
              <button
                onClick={() => setShowStorefrontDropdown(!showStorefrontDropdown)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#94a3b8",
                }}
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
                  <div
                    className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg py-1"
                    style={{ background: "#0d1b2e", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {storefronts.map((sf) => (
                      <a
                        key={sf.id}
                        href={sf.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5"
                        style={{ color: "#94a3b8" }}
                        onClick={() => setShowStorefrontDropdown(false)}
                      >
                        <span className="truncate font-medium" style={{ color: "#f8fafc" }}>
                          {sf.display_name}
                        </span>
                        {sf.is_primary && (
                          <span className="shrink-0 text-[9px] font-bold" style={{ color: "#f0b429" }}>
                            PRIMARY
                          </span>
                        )}
                        <svg className="w-3 h-3 shrink-0 ml-auto opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                    <div className="mt-1 border-t pt-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <Link
                        href="/business/settings"
                        className="flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5"
                        style={{ color: "#f0b429" }}
                        onClick={() => setShowStorefrontDropdown(false)}
                      >
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
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
            >
              eBay Storefront
            </a>
          ) : (
            <Link
              href="/business/settings"
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b" }}
            >
              Add Storefront
            </Link>
          )}

          <a
            href="/api/business/export?type=inventory"
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
          >
            Export
          </a>

          <Link
            href="/business/ledger"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02]"
            style={{ background: "#10b981", color: "#fff" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Inventory
          </Link>
        </div>
      </motion.div>

      {/* ── 2. KPI Strip ───────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.06)}>
        <BusinessMetrics
          metrics={metrics}
          loading={metricsLoading}
          inventorySummary={inventorySummary}
          totalItemCount={items.length}
          compact
        />
      </motion.div>

      {/* Migration banner */}
      {needsMigration && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ border: "1px solid rgba(240,180,41,0.2)", background: "rgba(240,180,41,0.05)", color: "#f0b429" }}
        >
          Database setup required.{" "}
          <Link href="/business/ledger" className="underline opacity-80 hover:opacity-100">
            Go to Ledger
          </Link>{" "}
          to complete setup.
        </div>
      )}

      {!needsMigration && (
        <>
          {/* ── 3. AI Market Signals ─────────────────────────────────── */}
          <motion.section {...fadeUp(0.12)}>
            {/* Section header */}
            <div className="mb-4 flex items-center gap-2.5">
              <SectionLabel>Market Intelligence · Live Signals</SectionLabel>
              <span
                className="pulse-dot inline-block h-2 w-2 rounded-full"
                style={{ background: "#10b981" }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {MARKET_SIGNALS.map((signal, i) => (
                <motion.div
                  key={signal.type}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18 + i * 0.09, duration: 0.42, ease: "easeOut" }}
                  className="signal-card relative flex flex-col gap-3 rounded-xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderLeft: `3px solid ${signal.borderColor}`,
                  }}
                >
                  {/* Type badge */}
                  <span
                    className="inline-block self-start rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                    style={{ background: signal.badgeBg, color: signal.badgeColor }}
                  >
                    {signal.type}
                  </span>

                  {/* Headline */}
                  <p
                    className="text-sm font-semibold leading-snug"
                    style={{ color: "#f8fafc", fontFamily: "'Sora', sans-serif" }}
                  >
                    {signal.headline}
                  </p>

                  {/* Rationale */}
                  <p className="flex-1 text-xs leading-relaxed" style={{ color: "#64748b" }}>
                    {signal.rationale}
                  </p>

                  {/* CTA */}
                  <Link
                    href={signal.ctaHref}
                    className="self-start rounded-md px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02]"
                    style={{
                      background: signal.badgeBg,
                      color: signal.badgeColor,
                      border: `1px solid ${signal.borderColor}44`,
                    }}
                  >
                    {signal.cta} →
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── 4. Grade Probability Engine Hero ─────────────────────── */}
          <motion.section {...fadeUp(0.2)}>
            <div
              className="gold-glow relative overflow-hidden rounded-2xl p-6 md:p-8"
              style={{
                background: "linear-gradient(135deg, rgba(240,180,41,0.06) 0%, rgba(10,22,40,0.97) 55%, rgba(8,18,34,0.99) 100%)",
                border: "1px solid rgba(240,180,41,0.18)",
              }}
            >
              {/* Background radial glow */}
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full opacity-30"
                style={{ background: "radial-gradient(circle, rgba(240,180,41,0.25) 0%, transparent 65%)" }}
              />

              <div className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-2">
                {/* Left: Copy */}
                <div>
                  <p
                    className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: "#f0b429", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Platform Feature · Grade Engine
                  </p>
                  <h2
                    className="mb-3 text-2xl font-bold leading-tight"
                    style={{ color: "#f8fafc", fontFamily: "'Sora', sans-serif" }}
                  >
                    Grade Before You Sell
                  </h2>
                  <p className="mb-5 text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
                    CardzCheck's Grade Probability Engine uses AI vision to estimate PSA/BGS grade
                    probability before you submit — so you only send cards worth grading.
                  </p>
                  {/* ROI callout */}
                  <div
                    className="mb-5 rounded-lg px-4 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p
                      className="text-xs"
                      style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      Expected at PSA 9:{" "}
                      <span className="font-semibold" style={{ color: "#10b981" }}>$185</span>
                      {" · "}Grading cost:{" "}
                      <span className="font-semibold" style={{ color: "#f8fafc" }}>$25</span>
                      {" · "}Net ROI:{" "}
                      <span className="font-bold" style={{ color: "#10b981", textShadow: "0 0 8px rgba(16,185,129,0.5)" }}>
                        +$160
                      </span>
                    </p>
                  </div>
                  <Link
                    href="/grade-hub"
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all hover:scale-[1.02]"
                    style={{
                      background: "#f0b429",
                      color: "#0a1628",
                      boxShadow: "0 0 24px rgba(240,180,41,0.3)",
                    }}
                  >
                    Run Grade Analysis
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>

                {/* Right: Grade probability bars */}
                <div className="space-y-4">
                  {([
                    { label: "PSA 10", pct: 34, color: "#f0b429", textColor: "#f0b429" },
                    { label: "PSA 9",  pct: 41, color: "#10b981", textColor: "#10b981" },
                    { label: "PSA 8",  pct: 18, color: "#64748b", textColor: "#94a3b8" },
                    { label: "PSA 7 or lower", pct: 7, color: "#334155", textColor: "#475569" },
                  ] as const).map(({ label, pct, color, textColor }, idx) => (
                    <div key={label}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span
                          className="text-xs font-medium"
                          style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {label}
                        </span>
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{
                            color: textColor,
                            fontFamily: "'JetBrains Mono', monospace",
                            ...(idx < 2 ? { textShadow: `0 0 8px ${color}90` } : {}),
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <AnimatedBar pct={pct} color={color} delay={0.35 + idx * 0.1} height="h-3" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>

          {/* ── 5. Two-column: Inventory Table + Funnel/Sales ─────────── */}
          <motion.div {...fadeUp(0.26)} className="grid grid-cols-1 gap-6 lg:grid-cols-5">

            {/* LEFT (60%): Highest-Value Inventory */}
            <div className="lg:col-span-3">
              <CardSurface>
                {/* Table header */}
                <div
                  className="flex items-center justify-between gap-2 px-5 py-4"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <SectionLabel>Highest-Value Inventory</SectionLabel>
                  <Link
                    href="/business/ledger"
                    className="text-[11px] opacity-50 transition-opacity hover:opacity-90"
                    style={{ color: "#10b981" }}
                  >
                    View all →
                  </Link>
                </div>

                {itemsEmpty ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-xs" style={{ color: "#64748b" }}>
                      No inventory yet.{" "}
                      <Link href="/business/ledger" className="underline" style={{ color: "#10b981" }}>
                        Add items
                      </Link>{" "}
                      to see your highest-value cards.
                    </p>
                  </div>
                ) : dashboardData.topMovers.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-xs" style={{ color: "#64748b" }}>
                      Add market values to see highest-value inventory.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Column headers */}
                    <div
                      className="grid grid-cols-12 gap-2 px-5 py-2"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      {[
                        { label: "Card", span: "col-span-5" },
                        { label: "Grade", span: "col-span-2" },
                        { label: "Days", span: "col-span-2" },
                        { label: "Value", span: "col-span-3 text-right" },
                      ].map(({ label, span }) => (
                        <span
                          key={label}
                          className={`${span} text-[9px] font-bold uppercase tracking-[0.12em]`}
                          style={{ color: "#334155", fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Rows */}
                    {dashboardData.topMovers.map((item) => {
                      const days = daysSince(item.acquisition_date);
                      const gradeLabel =
                        item.grading_company && item.grade
                          ? `${item.grading_company} ${item.grade}`
                          : item.condition_status === "graded"
                          ? "Graded"
                          : "Raw";
                      return (
                        <div
                          key={item.id}
                          className="group grid grid-cols-12 gap-2 px-5 py-3 transition-colors hover:bg-white/[0.022]"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                        >
                          <div className="col-span-5 min-w-0 flex items-center">
                            <Link
                              href="/business/ledger"
                              className="block truncate text-xs font-medium transition-colors"
                              style={{ color: "#e2e8f0" }}
                              title={item.title}
                            >
                              {item.title}
                            </Link>
                          </div>

                          <div className="col-span-2 flex items-center">
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
                            >
                              {gradeLabel}
                            </span>
                          </div>

                          <div className="col-span-2 flex items-center">
                            {days != null ? (
                              <span
                                className="text-[11px] tabular-nums"
                                style={{
                                  color: days > 30 ? "#ef4444" : "#64748b",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  ...(days > 30 ? { fontWeight: 600 } : {}),
                                }}
                              >
                                {days}d
                              </span>
                            ) : (
                              <span style={{ color: "#334155", fontSize: "11px" }}>—</span>
                            )}
                          </div>

                          <div className="col-span-3 flex items-center justify-end gap-2">
                            <span
                              className="text-xs font-bold tabular-nums"
                              style={{
                                color: "#10b981",
                                fontFamily: "'JetBrains Mono', monospace",
                                textShadow: "0 0 10px rgba(16,185,129,0.35)",
                              }}
                            >
                              {fmt(item.current_market_value_cents!)}
                            </span>
                            <Link
                              href="/business/ledger"
                              className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold opacity-0 transition-all group-hover:opacity-100"
                              style={{
                                background: "rgba(16,185,129,0.12)",
                                color: "#10b981",
                                border: "1px solid rgba(16,185,129,0.2)",
                              }}
                            >
                              List
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </CardSurface>
            </div>

            {/* RIGHT (40%): Funnel + Recent Sales */}
            <div className="lg:col-span-2 space-y-5">
              {/* Inventory Funnel */}
              <CardSurface className="p-5">
                <SectionLabel>Inventory Funnel</SectionLabel>

                {itemsEmpty ? (
                  <p className="mt-3 text-xs" style={{ color: "#64748b" }}>No inventory data yet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {([
                      {
                        label: "Unlisted",
                        count: dashboardData.unlisted.length,
                        pct: (dashboardData.unlisted.length / funnelTotal) * 100,
                        barColor: "#ef4444",
                        textColor: "#f87171",
                        delay: 0.3,
                      },
                      {
                        label: "Listed",
                        count: dashboardData.listedCount,
                        pct: (dashboardData.listedCount / funnelTotal) * 100,
                        barColor: "#3b82f6",
                        textColor: "#60a5fa",
                        delay: 0.42,
                      },
                      {
                        label: "Sold (30d)",
                        count: soldLast30Count,
                        pct: (soldLast30Count / funnelTotal) * 100,
                        barColor: "#10b981",
                        textColor: "#34d399",
                        delay: 0.54,
                      },
                    ] as const).map(({ label, count, pct, barColor, textColor, delay }) => (
                      <div key={label}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs" style={{ color: "#64748b" }}>{label}</span>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: textColor, fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {recentSalesLoading && label === "Sold (30d)" ? "—" : count}
                          </span>
                        </div>
                        <AnimatedBar pct={pct} color={barColor} delay={delay} />
                      </div>
                    ))}

                    {/* Conversion rates */}
                    <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                      <p
                        className="text-[11px]"
                        style={{ color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {dashboardData.activeCount > 0
                          ? `${Math.round((dashboardData.listedCount / Math.max(dashboardData.activeCount, 1)) * 100)}% list rate`
                          : "0% list rate"}
                        {soldLast30Count > 0 && dashboardData.listedCount > 0
                          ? ` · ${Math.round((soldLast30Count / Math.max(dashboardData.listedCount, 1)) * 100)}% sell-through`
                          : ""}
                      </p>
                      {dashboardData.unlisted.length > 0 &&
                        inventorySummary &&
                        inventorySummary.totalCmvCents > 0 && (
                          <p className="mt-1 text-[11px]" style={{ color: "#475569" }}>
                            Listing unlisted cards could unlock{" "}
                            <span style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                              {fmt(
                                Math.round(
                                  (inventorySummary.totalCmvCents /
                                    Math.max(dashboardData.activeCount, 1)) *
                                    dashboardData.unlisted.length
                                )
                              )}
                            </span>{" "}
                            in revenue
                          </p>
                        )}
                    </div>
                  </div>
                )}
              </CardSurface>

              {/* Recent Sales */}
              <CardSurface className="p-5">
                <div className="flex items-center justify-between">
                  <SectionLabel>Recent Sales</SectionLabel>
                  {recentSales.length > 0 && (
                    <Link
                      href="/business/ledger?tab=sales"
                      className="text-[11px] opacity-50 transition-opacity hover:opacity-90"
                      style={{ color: "#10b981" }}
                    >
                      All →
                    </Link>
                  )}
                </div>

                {recentSalesLoading ? (
                  <div className="mt-4 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="h-9 rounded-lg animate-pulse"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                      />
                    ))}
                  </div>
                ) : recentSales.length === 0 ? (
                  <p className="mt-3 text-xs" style={{ color: "#64748b" }}>
                    No sales yet.{" "}
                    <Link href="/business/ledger?tab=sales" className="underline" style={{ color: "#10b981" }}>
                      Record one
                    </Link>
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {recentSales.slice(0, 6).map((sale) => {
                      const marginPct =
                        sale.profit_cents && sale.gross_revenue_cents > 0
                          ? Math.round((sale.profit_cents / sale.gross_revenue_cents) * 100)
                          : null;
                      return (
                        <li key={sale.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-xs font-medium"
                              style={{ color: "#f8fafc" }}
                              title={sale.inventory_item?.title ?? "Sale"}
                            >
                              {sale.inventory_item?.title ?? "Sale"}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className="text-[10px]" style={{ color: "#475569" }}>
                                {CHANNEL_LABELS[sale.channel] ?? sale.channel}
                              </span>
                              <span style={{ color: "#334155" }}>·</span>
                              <span className="text-[10px]" style={{ color: "#475569" }}>
                                {timeAgo(sale.sold_at)}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className="text-xs font-bold tabular-nums"
                              style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}
                            >
                              {fmt(sale.gross_revenue_cents)}
                            </p>
                            {marginPct !== null && (
                              <span
                                className="text-[10px] font-semibold tabular-nums"
                                style={{
                                  color: marginPct >= 0 ? "#10b981" : "#ef4444",
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                {marginPct >= 0 ? "+" : ""}
                                {marginPct}%
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardSurface>
            </div>
          </motion.div>

          {/* ── 6. Sales Channels (bottom) ───────────────────────────── */}
          <motion.section {...fadeUp(0.32)}>
            <CardSurface className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <SectionLabel>Sales Channels</SectionLabel>
                <Link
                  href="/business/settings?section=storefronts"
                  className="text-[11px] opacity-50 transition-opacity hover:opacity-90"
                  style={{ color: "#94a3b8" }}
                >
                  Manage →
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* eBay */}
                <div
                  className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-3"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0 text-sm font-extrabold leading-none tracking-tighter">
                      <span style={{ color: "#e43137" }}>e</span>
                      <span style={{ color: "#0064d3" }}>B</span>
                      <span style={{ color: "#f5af02" }}>a</span>
                      <span style={{ color: "#86b817" }}>y</span>
                    </span>
                    {ebayAccount?.connected ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Connected
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "#475569" }}>
                        Not connected
                      </span>
                    )}
                    {ebayAccount?.ebay_username && (
                      <span className="truncate text-[10px]" style={{ color: "#475569" }}>
                        {ebayAccount.ebay_username}
                      </span>
                    )}
                  </div>
                  {ebayAccount?.connected ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <GhostBtn onClick={handleSyncEbayOrders} disabled={syncingEbayOrders}>
                        {syncingEbayOrders ? "Syncing…" : "Sync"}
                      </GhostBtn>
                      <Link
                        href="/business/ledger"
                        className="rounded px-2 py-1 text-[11px] font-medium transition-all"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#94a3b8",
                        }}
                      >
                        Ledger
                      </Link>
                    </div>
                  ) : (
                    <a
                      href="/api/auth/ebay"
                      className="shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold transition-all hover:scale-[1.02]"
                      style={{ background: "#10b981", color: "#fff" }}
                    >
                      Connect
                    </a>
                  )}
                </div>

                {/* Whatnot */}
                {(() => {
                  const wn = storefronts.find((s) => s.platform === "whatnot");
                  return (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-3"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: "#a78bfa" }}>
                          Whatnot
                        </span>
                        {wn ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: "#475569" }}>Not configured</span>
                        )}
                      </div>
                      {wn ? (
                        <a
                          href={wn.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                        >
                          View Store
                        </a>
                      ) : (
                        <Link
                          href="/business/settings?section=storefronts"
                          className="shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                        >
                          + Add
                        </Link>
                      )}
                    </div>
                  );
                })()}

                {/* Website */}
                {(() => {
                  const web = storefronts.find((s) => s.platform === "website" || s.platform === "shopify");
                  return (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-3"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: "#38bdf8" }}>
                          Website
                        </span>
                        {web ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "rgba(56,189,248,0.12)", color: "#38bdf8" }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px]" style={{ color: "#475569" }}>Not configured</span>
                        )}
                      </div>
                      {web ? (
                        <a
                          href={web.store_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                        >
                          View Store
                        </a>
                      ) : (
                        <Link
                          href="/business/settings?section=storefronts"
                          className="shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
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
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Active", value: String(ebayKpis.activeEbayListings) },
                    { label: "Sales (30d)", value: String(ebayKpis.salesCount) },
                    { label: "Revenue (30d)", value: fmt(ebayKpis.revenueCents) },
                    { label: "Profit (30d)", value: fmt(ebayKpis.profitCents) },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="rounded-lg px-3 py-2"
                      style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
                    >
                      <p
                        className="mb-0.5 text-[10px] uppercase tracking-wide"
                        style={{ color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {label}
                      </p>
                      <p
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "#f8fafc", fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {syncError && (
                <p className="mt-2 text-[10px]" style={{ color: "#ef4444" }}>
                  {syncError}
                </p>
              )}
            </CardSurface>
          </motion.section>
        </>
      )}

      {showImportWizard && (
        <EbayImportWizard onClose={() => setShowImportWizard(false)} />
      )}
    </div>
  );
}
