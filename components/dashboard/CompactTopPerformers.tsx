"use client";

import Link from "next/link";
import type { CollectionItem } from "@/types";
import { computePerformers } from "@/lib/values";

interface CompactTopPerformersProps {
  items: CollectionItem[];
  loading?: boolean;
}

export default function CompactTopPerformers({ items, loading }: CompactTopPerformersProps) {
  const performers = computePerformers(items, 3); // Only top 3

  const formatCurrency = (value: number | null) => {
    if (value === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface,#ffffff)] p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)]" />
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-10 rounded-full bg-[color:var(--biz-skeleton,#e5e7eb)]" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[color:var(--biz-border,#e5e7eb)] bg-[color:var(--biz-surface,#ffffff)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--biz-text,#111827)]">
          Top Movers
        </h2>
        {items.length > 0 && (
          <Link
            href="/collection"
            className="text-xs font-medium text-[color:var(--biz-primary,#0b7a4b)] hover:underline"
          >
            View all
          </Link>
        )}
      </div>

      {performers.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-xs text-[color:var(--biz-muted,#6b7280)]">
            Add cards to see top movers.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--biz-border,#e5e7eb)]">
          {performers.map((perf) => {
            const { item, estCmv, pctChange } = perf;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.player_name}
                    className="h-11 w-8 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[color:var(--biz-text,#111827)]">
                    {item.player_name}
                  </p>
                  <p className="truncate text-[10px] text-[color:var(--biz-muted,#6b7280)]">
                    {[item.year, item.set_name].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[color:var(--biz-text,#111827)] tabular-nums">
                    {formatCurrency(estCmv ?? null)}
                  </p>
                  {pctChange !== null && (
                    <p
                      className={`text-[10px] tabular-nums ${
                      pctChange >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                    >
                      {pctChange >= 0 ? "+" : ""}{(pctChange * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
