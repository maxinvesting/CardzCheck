"use client";

import type { BriefingChip, BriefingChipKey } from "@/lib/messaging/briefing";

interface Props {
  narrative: string;
  chips: BriefingChip[];
  loading: boolean;
  source: "ai" | "fallback";
  activeChip: BriefingChipKey | null;
  onChipClick: (key: BriefingChipKey) => void;
  greetingName: string;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function SalesBriefingCard({
  narrative,
  chips,
  loading,
  source,
  activeChip,
  onChipClick,
  greetingName,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--biz-border)] bg-[radial-gradient(circle_at_top_left,rgba(46,160,103,0.18)_0%,rgba(255,255,255,0.98)_46%,rgba(245,250,247,0.98)_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-6 lg:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--biz-primary-border)] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-primary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--biz-primary)]" />
              Sales briefing
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--biz-text)] sm:text-4xl">
              Sales
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--biz-text)]">
              {loading ? (
                <span className="inline-block h-4 w-3/4 animate-pulse rounded bg-[var(--biz-border)]" />
              ) : (
                narrative
              )}
            </p>
            <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[var(--biz-muted)]">
              {greetingName} · {source === "ai" ? "AI summary" : "Live snapshot"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/business/ledger?tab=sales"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--biz-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
            >
              Open ledger sales
            </a>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--biz-primary)] px-4 py-2 text-sm font-semibold text-[var(--biz-primary-foreground)] shadow-[0_12px_30px_var(--biz-primary-border)] transition-colors hover:bg-[var(--biz-primary-hover)]"
            >
              {refreshing ? "Refreshing..." : "Refresh live feed"}
            </button>
          </div>
        </div>

        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const isActive = activeChip === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => onChipClick(chip.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    isActive
                      ? "border-[var(--biz-primary)] bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                      : "border-[var(--biz-border)] bg-white/85 text-[var(--biz-text)] hover:bg-white"
                  }`}
                  aria-pressed={isActive}
                >
                  {chip.label}
                </button>
              );
            })}
            {activeChip ? (
              <button
                type="button"
                onClick={() => onChipClick(activeChip)}
                className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-1.5 text-[12px] font-medium text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
              >
                Clear filter
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
