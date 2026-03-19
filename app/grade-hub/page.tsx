"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import GradeEstimatorHistoryPanel from "@/components/grading/GradeEstimatorHistoryPanel";

type CreditStatus = {
  tier: "free" | "pro" | "business";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
};

function formatTimeUntil(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function GradeHubPage() {
  const { authUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const [credits, setCredits] = useState<CreditStatus | null>(null);

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  useEffect(() => {
    fetch("/api/grading/credits")
      .then((r) => r.json())
      .then(setCredits)
      .catch(() => {});
  }, []);

  const isBusiness = credits?.tier === "business";
  const isUnlimited = credits?.unlimited === true;
  const canScan = isUnlimited || (credits?.remaining ?? 0) > 0;
  const remaining = credits?.remaining ?? 0;

  return (
    <AuthenticatedLayout>
      <div className="px-4 py-6 sm:px-6 max-w-2xl mx-auto space-y-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--biz-border)]">
          <div>
            <h1 className="text-lg font-semibold text-[var(--biz-text)]">Grade Probability Engine</h1>
            <p className="text-sm text-[var(--biz-muted)] mt-0.5">
              Upload card images to get PSA &amp; BGS grade probability estimates
            </p>
          </div>
          {!isUnlimited && credits && (
            <div className={`shrink-0 text-right`}>
              <p className={`text-sm font-semibold tabular-nums ${
                remaining === 0 ? "text-rose-500" : remaining === 1 ? "text-amber-500" : "text-[var(--biz-text)]"
              }`}>
                {remaining} scan{remaining !== 1 ? "s" : ""} left
              </p>
              {remaining < 2 && credits.nextGrantAt && (
                <p className="text-xs text-[var(--biz-muted)]">+1 in {formatTimeUntil(credits.nextGrantAt)}</p>
              )}
            </div>
          )}
          {isUnlimited && (
            <span className="shrink-0 text-xs text-[var(--biz-muted)]">Unlimited</span>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          {canScan ? (
            <Link
              href="/grade-hub/scan?slots=1"
              className="group flex items-center gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-3 transition-colors hover:border-[var(--biz-primary)]/40 hover:bg-[var(--biz-hover)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--biz-primary)]/10 text-[var(--biz-primary)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--biz-text)]">Scan a Card</p>
                <p className="text-xs text-[var(--biz-muted)]">Front &amp; back upload · full grade distribution</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-[var(--biz-primary)] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-3 opacity-60"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--biz-hover)] text-[var(--biz-muted)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--biz-text)]">Scan a Card</p>
                <p className="text-xs text-amber-500">No scans remaining — upgrade for unlimited</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          {isBusiness && canScan && (
            <Link
              href="/grade-hub/scan?slots=3"
              className="group flex items-center gap-3 rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-3 transition-colors hover:border-[var(--biz-primary)]/40 hover:bg-[var(--biz-hover)]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--biz-primary)]/10 text-[var(--biz-primary)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--biz-text)]">
                  Batch Scan
                  <span className="ml-1.5 text-xs text-[var(--biz-muted)] font-normal">3 cards simultaneously</span>
                </p>
                <p className="text-xs text-[var(--biz-muted)]">Process multiple cards in parallel</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-[var(--biz-primary)] transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {/* ── Scan history ────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--biz-muted)] mb-3">Recent Scans</p>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>

      </div>
    </AuthenticatedLayout>
  );
}
