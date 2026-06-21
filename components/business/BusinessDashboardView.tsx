"use client";

import Link from "next/link";
import { useState } from "react";
import { MicButton } from "@/components/ui/MicButton";
import type { UserStorefront } from "@/types";

/* ── snapshot shape ─────────────────────────────────────────────── */

/**
 * Headline figures shown on the dashboard. Every field is sourced from the
 * Financials summary endpoint (`/api/business/financials/summary`), so the
 * dashboard can never drift from the Financials page or the ledger.
 */
export type DashboardSnapshot = {
  cashOnHandCents: number;
  inventoryValueCents: number;
  totalValueCents: number;
  unrealizedPnlCents: number;
  unrealizedPnlPct: number | null;
  activeCount: number;
  revenueMtdCents: number;
  profitMtdCents: number;
  salesCountMtd: number;
  marginMtdPct: number | null;
};

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

/* ── small presentational atoms ─────────────────────────────────── */

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`desk-eyebrow ${className}`}>{children}</span>;
}

function Metric({
  label,
  value,
  sub,
  subTone = "muted",
  loading,
  big = false,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "muted" | "up" | "down";
  loading: boolean;
  big?: boolean;
}) {
  const subColor =
    subTone === "up"
      ? "var(--biz-profit)"
      : subTone === "down"
        ? "var(--desk-red)"
        : "var(--biz-faint)";
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      {loading ? (
        <div
          className={`mt-2 ${big ? "h-9 w-28" : "h-6 w-20"} animate-pulse rounded-md`}
          style={{ background: "var(--biz-skeleton)" }}
        />
      ) : (
        <p
          className={`desk-figure mt-1.5 leading-none text-[var(--biz-text-strong)] ${
            big ? "text-[30px] sm:text-[34px]" : "text-[21px]"
          }`}
        >
          {value}
        </p>
      )}
      {sub && !loading ? (
        <p className="mt-1.5 text-[11px]" style={{ color: subColor }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/* ── feature shortcuts ──────────────────────────────────────────── */

type Shortcut = {
  label: string;
  detail: string;
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  primary?: boolean;
};

interface Props {
  businessName: string | null;
  snapshot: DashboardSnapshot | null;
  snapshotLoading: boolean;
  storefronts?: UserStorefront[];
  ebayStoreHref: string | null;
  needsMigration: boolean;
  onRecordSale?: () => void;
  onRecordTrade?: () => void;
  onDashboardVoiceCommand?: (transcript: string) => void;
}

export default function BusinessDashboardView({
  businessName,
  snapshot,
  snapshotLoading,
  storefronts = [],
  ebayStoreHref,
  needsMigration,
  onRecordSale,
  onRecordTrade,
  onDashboardVoiceCommand,
}: Props) {
  const [showStorefrontDropdown, setShowStorefrontDropdown] = useState(false);

  const primaryStorefront = storefronts.find((store) => store.is_primary) ?? storefronts[0] ?? null;
  const hasStorefronts = storefronts.length > 0;

  const pnl = snapshot?.unrealizedPnlCents ?? 0;
  const margin = snapshot?.marginMtdPct;

  /* ── shortcuts to key features ────────────────────────────────── */
  const actions: Shortcut[] = [
    {
      label: "Record sale",
      detail: "Log a sale",
      onClick: onRecordSale,
      primary: true,
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      ),
    },
    {
      label: "Record trade",
      detail: "Log a trade",
      onClick: onRecordTrade,
      primary: true,
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      ),
    },
  ];

  const features: Shortcut[] = [
    {
      label: "Ledger",
      detail: "Inventory & records",
      href: "/business/ledger",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      ),
    },
    {
      label: "Analytics",
      detail: "Financials & trends",
      href: "/business/financials",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 3v18h18M7 14l3-3 3 3 5-6" />
      ),
    },
    {
      label: "Sales & trades",
      detail: "Full history",
      href: "/business/sales",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 6h18M3 12h18M3 18h18" />
      ),
    },
    {
      label: "Trade Center",
      detail: "Swap cards P2P",
      href: "/trade",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      ),
    },
    {
      label: "Marketplace",
      detail: "Your storefront",
      href: "/marketplace",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 9l1-5h16l1 5M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M3 9h18" />
      ),
    },
    {
      label: "Grading",
      detail: "Grade ROI simulator",
      href: "/business/grade-hub",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12l2 2 4-4m-6.165-7.303a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      ),
    },
    {
      label: "Business Advisor",
      detail: "Ask the advisor",
      href: "/assistants/advisor",
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 12h8M8 8h8m-8 8h5m4 3l-2-2H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-1 1.732" />
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
          <h1 className="desk-display mt-2 truncate text-[30px] font-medium leading-[1.05] text-[var(--biz-text-strong)] sm:text-[38px]">
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

      {/* ── Business position ────────────────────────────────────── */}
      <section className="desk-rise mt-7" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2.5">
          <Eyebrow>Business position</Eyebrow>
          <Link
            href="/business/financials"
            className="text-[11px] font-medium text-[var(--biz-muted-strong)] transition-colors hover:text-[var(--biz-text)] hover:underline"
          >
            Open financials →
          </Link>
        </div>
        <div className="desk-rule mt-3" />

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
          <Metric
            label="Total value"
            value={fmtCompact(snapshot?.totalValueCents ?? 0)}
            sub="inventory + cash"
            loading={snapshotLoading}
            big
          />
          <Metric
            label="Cash on hand"
            value={fmtCompact(snapshot?.cashOnHandCents ?? 0)}
            sub="manage in ledger"
            loading={snapshotLoading}
            big
          />
          <Metric
            label="Inventory value"
            value={fmtCompact(snapshot?.inventoryValueCents ?? 0)}
            sub={snapshot ? `${snapshot.activeCount} active card${snapshot.activeCount === 1 ? "" : "s"}` : undefined}
            loading={snapshotLoading}
            big
          />
          <Metric
            label="Unrealized P&L"
            value={`${pnl >= 0 ? "" : "−"}${fmtCompact(Math.abs(pnl))}`}
            sub={
              snapshot?.unrealizedPnlPct != null
                ? `${snapshot.unrealizedPnlPct >= 0 ? "+" : "−"}${Math.abs(snapshot.unrealizedPnlPct).toFixed(1)}% vs cost`
                : "vs cost basis"
            }
            subTone={pnl > 0 ? "up" : pnl < 0 ? "down" : "muted"}
            loading={snapshotLoading}
            big
          />
        </div>
      </section>

      {/* ── This month ───────────────────────────────────────────── */}
      <section className="desk-rise mt-8" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2.5">
          <Eyebrow>This month</Eyebrow>
          <span className="text-[11px] text-[var(--biz-faint)]">· month to date</span>
        </div>
        <div className="desk-rule mt-3" />

        <div className="mt-6 grid grid-cols-3 gap-x-8 gap-y-7">
          <Metric
            label="Revenue"
            value={fmtCompact(snapshot?.revenueMtdCents ?? 0)}
            loading={snapshotLoading}
          />
          <Metric
            label="Profit"
            value={`${(snapshot?.profitMtdCents ?? 0) >= 0 ? "" : "−"}${fmtCompact(Math.abs(snapshot?.profitMtdCents ?? 0))}`}
            sub={margin != null ? `${margin.toFixed(1)}% margin` : "no sales yet"}
            subTone={(snapshot?.profitMtdCents ?? 0) > 0 ? "up" : (snapshot?.profitMtdCents ?? 0) < 0 ? "down" : "muted"}
            loading={snapshotLoading}
          />
          <Metric
            label="Sales"
            value={snapshotLoading ? "—" : String(snapshot?.salesCountMtd ?? 0)}
            loading={snapshotLoading}
          />
        </div>
      </section>

      {/* ── Shortcuts ────────────────────────────────────────────── */}
      <section className="desk-rise mt-9" style={{ animationDelay: "180ms" }}>
        <Eyebrow>Shortcuts</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...actions, ...features].map((s) => {
            const inner = (
              <>
                <span className={`desk-action-icon ${s.primary ? "" : ""}`}>
                  <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {s.icon}
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-[var(--biz-text-strong)]">
                    {s.label}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--biz-muted)]">{s.detail}</span>
                </span>
              </>
            );
            const className = `desk-panel group flex items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5 ${
              s.primary ? "ring-1 ring-[var(--biz-border-strong)]" : ""
            }`;
            return s.href ? (
              <Link key={s.label} href={s.href} className={className}>
                {inner}
              </Link>
            ) : (
              <button key={s.label} type="button" onClick={s.onClick} className={className}>
                {inner}
              </button>
            );
          })}
        </div>
      </section>

      {/* eBay — de-emphasized external channel */}
      {ebayStoreHref && (
        <div className="desk-rise mt-7 flex justify-center" style={{ animationDelay: "240ms" }}>
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
