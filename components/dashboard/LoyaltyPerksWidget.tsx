"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LoyaltyData {
  purchaseCount: number;
  nextMilestone: number;
  milestonesEarned: number;
  purchasesInCurrentCycle: number;
  milestoneInterval: number;
}

export default function LoyaltyPerksWidget() {
  const [data, setData] = useState<LoyaltyData | null>(null);

  useEffect(() => {
    fetch("/api/shop/loyalty")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => {/* silently skip if unauthenticated */});
  }, []);

  if (!data) return null;

  const { purchaseCount, nextMilestone, purchasesInCurrentCycle, milestoneInterval } = data;
  const progress = milestoneInterval > 0 ? purchasesInCurrentCycle / milestoneInterval : 0;
  const remaining = nextMilestone - purchaseCount;

  return (
    <div className="rounded-xl border border-[var(--biz-border,#e2e8f0)] bg-[var(--biz-surface,#fff)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg" aria-hidden="true">🎁</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--biz-text,#0f172a)]">
              Repeat Buyer Perks
            </p>
            <p className="text-xs text-[var(--biz-muted,#64748b)]">
              {purchaseCount === 0
                ? `${milestoneInterval} purchases = 5% off your order`
                : remaining === 1
                ? `1 more purchase unlocks 5% off your next order`
                : `${remaining} more purchase${remaining !== 1 ? "s" : ""} to unlock 5% off (every ${milestoneInterval}th)`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-[var(--biz-muted,#64748b)]">
              {purchasesInCurrentCycle}/{milestoneInterval}
            </span>
          </div>
          <Link
            href="/shop"
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            Shop deals
          </Link>
        </div>
      </div>
    </div>
  );
}
