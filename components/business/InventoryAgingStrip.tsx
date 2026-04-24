"use client";

import { useMemo } from "react";
import type { BusinessInventoryItem } from "@/types";
import {
  computeAgingBuckets,
  formatCapitalShort,
  type AgingBucketKey,
} from "@/lib/business/inventory-display";

interface InventoryAgingStripProps {
  items: BusinessInventoryItem[];
  activeBucket: AgingBucketKey | null;
  onBucketChange: (bucket: AgingBucketKey | null) => void;
}

export default function InventoryAgingStrip({
  items,
  activeBucket,
  onBucketChange,
}: InventoryAgingStripProps) {
  const stats = useMemo(() => computeAgingBuckets(items), [items]);
  const totalActive = stats.reduce((sum, b) => sum + b.count, 0);
  if (totalActive === 0) return null;

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto">
      {stats.map((stat) => {
        const isActive = activeBucket === stat.key;
        const isEmpty = stat.count === 0;
        const isStale = stat.key === "91-180" || stat.key === "180+";
        const staleTint = isStale && !isEmpty;

        return (
          <button
            key={stat.key}
            type="button"
            disabled={isEmpty}
            onClick={() => onBucketChange(isActive ? null : stat.key)}
            aria-pressed={isActive}
            className={`group flex flex-1 min-w-[96px] flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
              isEmpty
                ? "border-[#EEE8DF] bg-transparent cursor-default opacity-60"
                : isActive
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-[#F0EDE8]"
                : staleTint
                ? "border-[#E8D5A0] bg-[#FBF5E8] hover:bg-[#F5EDD8] cursor-pointer"
                : "border-[#E5E2DD] bg-white hover:bg-[#FAFAF8] cursor-pointer"
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-[0.06em] ${
                isActive
                  ? "text-[#F0EDE8]/80"
                  : staleTint
                  ? "text-[#8A5C0A]"
                  : "text-[#888]"
              }`}
            >
              {stat.label}
            </span>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className={`text-sm font-medium tabular-nums ${
                  isActive
                    ? "text-[#F0EDE8]"
                    : staleTint
                    ? "text-[#8A5C0A]"
                    : "text-[#1A1A1A]"
                }`}
              >
                {stat.count}
              </span>
              <span
                className={`text-[11px] tabular-nums truncate ${
                  isActive
                    ? "text-[#F0EDE8]/70"
                    : staleTint
                    ? "text-[#8A5C0A]/80"
                    : "text-[#AAA]"
                }`}
              >
                {formatCapitalShort(stat.capitalCents)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
