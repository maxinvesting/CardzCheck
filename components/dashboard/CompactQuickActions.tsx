"use client";

import Link from "next/link";

interface CompactQuickActionsProps {
  onAddCard?: () => void;
  onBulkCert?: () => void;
}

export default function CompactQuickActions({ onAddCard, onBulkCert }: CompactQuickActionsProps) {
  return (
    <section className="rounded-xl border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface,#ffffff)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--biz-text,#111827)]">
        Quick actions
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Add Card */}
        <button
          type="button"
          onClick={onAddCard}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-[color:var(--biz-primary,#0b7a4b)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add card</span>
        </button>

        {/* Bulk add by cert */}
        {onBulkCert ? (
          <button
            type="button"
            onClick={onBulkCert}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface-soft,#f9fafb)] px-3 py-2 text-xs font-medium text-[color:var(--biz-text,#111827)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
          >
            <svg className="h-4 w-4 text-[color:var(--biz-muted,#6b7280)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <span>Bulk add by cert</span>
          </button>
        ) : null}

        {/* Run Search */}
        <Link
          href="/comps"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface-soft,#f9fafb)] px-3 py-2 text-xs font-medium text-[color:var(--biz-text,#111827)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
        >
          <svg className="h-4 w-4 text-[color:var(--biz-muted,#6b7280)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Run search</span>
        </Link>

        {/* View Collection */}
        <Link
          href="/collection"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface-soft,#f9fafb)] px-3 py-2 text-xs font-medium text-[color:var(--biz-text,#111827)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
        >
          <svg className="h-4 w-4 text-[color:var(--biz-muted,#6b7280)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>Open collection</span>
        </Link>

        {/* Export */}
        <Link
          href="/collection"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface-soft,#f9fafb)] px-3 py-2 text-xs font-medium text-[color:var(--biz-text,#111827)] transition-colors hover:bg-[color:var(--biz-hover,#f3f4f6)]"
        >
          <svg className="h-4 w-4 text-[color:var(--biz-muted,#6b7280)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>Export</span>
        </Link>
      </div>
    </section>
  );
}
