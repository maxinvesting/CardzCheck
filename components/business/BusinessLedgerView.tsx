"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import type { BusinessMetrics as MetricsType, BusinessInventoryItem } from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";
import { Surface } from "@/components/ui/Surface";

interface Props {
  businessName: string | null;
  ebayStoreHref: string | null;
  /** Whether an active eBay OAuth account is connected */
  ebayConnected?: boolean;
  /** Whether the user has a Whatnot storefront configured */
  whatnotConnected?: boolean;
  whatnotUrl?: string | null;
  /** Whether the user has a website/storefront configured */
  websiteConnected?: boolean;
  websiteUrl?: string | null;
  metrics: MetricsType | null;
  metricsLoading: boolean;
  inventorySummary: InventoryValueSummary | null;
  totalItemCount: number;
  activeTab: "inventory" | "sales";
  onTabChange: (tab: "inventory" | "sales") => void;
  needsMigration: boolean;
  items: BusinessInventoryItem[];
  showAddDropdown: boolean;
  onToggleAddDropdown: () => void;
  onAddInventory: () => void;
  onAddWax: () => void;
  onManualAdd: () => void;
  children: ReactNode;
}


export default function BusinessLedgerView({
  ebayStoreHref,
  ebayConnected = false,
  whatnotConnected = false,
  whatnotUrl,
  websiteConnected = false,
  websiteUrl,
  metrics,
  metricsLoading,
  inventorySummary,
  totalItemCount,
  activeTab,
  onTabChange,
  needsMigration,
  items,
  showAddDropdown,
  onToggleAddDropdown,
  onAddInventory,
  onAddWax,
  onManualAdd,
  children,
}: Props) {
  return (
    <>
      {/* Top band: header + KPIs */}
      <Surface className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold leading-snug text-[var(--biz-text)]">
              Ledger
            </h1>
            <p className="mt-1 text-sm text-[var(--biz-muted)]">
              Track inventory, listings, and realized sales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ── Sales channels status bar ───────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* eBay */}
              {ebayConnected ? (
                ebayStoreHref ? (
                  <a
                    href={ebayStoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-primary)] hover:bg-[var(--biz-primary-soft-strong)] transition-colors"
                  >
                    <span className="font-extrabold tracking-tighter text-[10px] leading-none">
                      <span style={{ color: "#e43137" }}>e</span>
                      <span style={{ color: "#0064d3" }}>B</span>
                      <span style={{ color: "#f5af02" }}>a</span>
                      <span style={{ color: "#86b817" }}>y</span>
                    </span>
                    Connected
                    <svg className="w-3 h-3 text-[var(--biz-primary)]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-primary)]">
                    <span className="font-extrabold tracking-tighter text-[10px] leading-none">
                      <span style={{ color: "#e43137" }}>e</span>
                      <span style={{ color: "#0064d3" }}>B</span>
                      <span style={{ color: "#f5af02" }}>a</span>
                      <span style={{ color: "#86b817" }}>y</span>
                    </span>
                    Connected
                    <svg className="w-3 h-3 text-[var(--biz-primary)]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                )
              ) : (
                <a
                  href="/api/auth/ebay"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <span className="font-extrabold tracking-tighter text-[10px] leading-none">
                    <span style={{ color: "#e43137" }}>e</span>
                    <span style={{ color: "#0064d3" }}>B</span>
                    <span style={{ color: "#f5af02" }}>a</span>
                    <span style={{ color: "#86b817" }}>y</span>
                  </span>
                  Connect
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </a>
              )}

              {/* Whatnot */}
              {whatnotConnected && whatnotUrl ? (
                <a
                  href={whatnotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-secondary)] hover:bg-[var(--biz-secondary-soft-strong)] transition-colors"
                >
                  Whatnot
                  <svg className="w-3 h-3 text-[var(--biz-secondary)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </a>
              ) : (
                <Link
                  href="/business/settings?section=storefronts"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-muted)] hover:bg-[var(--biz-hover)] transition-colors"
                >
                  Whatnot
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Link>
              )}

              {/* Website / Storefront */}
              {websiteConnected && websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-tertiary-border)] bg-[var(--biz-tertiary-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-tertiary)] hover:bg-[var(--biz-tertiary-soft-strong)] transition-colors"
                >
                  Website
                  <svg className="w-3 h-3 text-[var(--biz-tertiary)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </a>
              ) : (
                <Link
                  href="/business/settings?section=storefronts"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--biz-muted)] hover:bg-[var(--biz-hover)] transition-colors"
                >
                  Website
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Link>
              )}
            </div>

            <a
              href="/api/business/export?type=inventory"
              className="cc-btn-secondary whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Export for Accounting
            </a>

            {/* Add inventory split button */}
            <div className="relative">
              <div className="flex">
                <button
                  type="button"
                  onClick={onAddInventory}
                  className="cc-btn-primary flex items-center gap-1.5 rounded-l-md border-r border-[var(--biz-primary-border)] px-3 py-1.5 text-xs font-medium"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Inventory
                </button>
                <button
                  type="button"
                  onClick={onToggleAddDropdown}
                  className="cc-btn-primary rounded-r-md px-1.5 py-1.5"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {showAddDropdown && (
                <div
                  style={{ background: "var(--biz-surface)", border: "1px solid var(--biz-border)" }}
                  className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAddDropdown();
                      onAddInventory();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--biz-text)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
                  >
                    <svg className="h-4 w-4 text-[var(--biz-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Add Inventory
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAddDropdown();
                      onAddWax();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--biz-text)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
                  >
                    <svg className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    Add Wax
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAddDropdown();
                      onManualAdd();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--biz-text)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
                  >
                    <svg className="h-4 w-4 text-[var(--biz-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Manual Entry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI metrics row */}
        <div className="mt-4">
          <BusinessMetrics
            metrics={metrics}
            loading={metricsLoading}
            inventorySummary={inventorySummary}
            totalItemCount={totalItemCount}
          />
        </div>
      </Surface>

      {/* Tab switcher */}
      {!needsMigration && (
        <div className="mb-4 flex items-center gap-1 border-b border-[color:var(--biz-border)]">
          <button
            type="button"
            onClick={() => onTabChange("inventory")}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "inventory"
                ? "border-[var(--biz-primary)] text-[var(--biz-primary)]"
                : "border-transparent text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
            }`}
          >
            Inventory
          </button>
          <button
            type="button"
            onClick={() => onTabChange("sales")}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "sales"
                ? "border-[var(--biz-primary)] text-[var(--biz-primary)]"
                : "border-transparent text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
            }`}
          >
            Sales
          </button>
        </div>
      )}

      {/* Tab content (tables, migration banner, etc.) */}
      {children}
    </>
  );
}
