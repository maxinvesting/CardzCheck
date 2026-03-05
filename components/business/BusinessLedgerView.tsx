"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import BusinessAnalystPreviewCard from "@/components/business/BusinessAnalystPreviewCard";
import type { BusinessMetrics as MetricsType, BusinessInventoryItem } from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";

interface Props {
  businessName: string | null;
  ebayStoreHref: string | null;
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
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-white leading-snug">Ledger</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Track inventory, listings, and realized sales
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ebayStoreHref ? (
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
              Add eBay Storefront
            </Link>
          )}

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
                className="cc-btn-primary flex items-center gap-1.5 rounded-l-md border-r border-emerald-500/50 px-3 py-1.5 text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Inventory
              </button>
              <button
                type="button"
                onClick={onToggleAddDropdown}
                className="cc-btn-primary rounded-r-md px-1.5 py-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {showAddDropdown && (
              <div
                style={{ background: "var(--biz-surface)", border: "1px solid var(--biz-border)" }}
                className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => { onToggleAddDropdown(); onAddInventory(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Add Inventory
                </button>
                <button
                  type="button"
                  onClick={() => { onToggleAddDropdown(); onAddWax(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Add Wax
                </button>
                <button
                  type="button"
                  onClick={() => { onToggleAddDropdown(); onManualAdd(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <BusinessMetrics
        metrics={metrics}
        loading={metricsLoading}
        inventorySummary={inventorySummary}
        totalItemCount={totalItemCount}
        compact
      />

      {/* AI insights preview — only on inventory tab */}
      {!needsMigration && activeTab === "inventory" && (
        <BusinessAnalystPreviewCard items={items} />
      )}

      {/* Tab switcher */}
      {!needsMigration && (
        <div className="mb-4 flex items-center gap-1 border-b border-[color:var(--border)]">
          <button
            type="button"
            onClick={() => onTabChange("inventory")}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "inventory"
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-[var(--muted)] hover:text-white"
            }`}
          >
            Inventory
          </button>
          <button
            type="button"
            onClick={() => onTabChange("sales")}
            className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "sales"
                ? "border-emerald-500 text-emerald-300"
                : "border-transparent text-[var(--muted)] hover:text-white"
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
