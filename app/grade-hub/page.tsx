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
      <div className="px-6 py-8 max-w-3xl mx-auto space-y-8">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--biz-text)] tracking-tight">Grade Probability Engine</h1>
            <p className="text-sm text-[var(--biz-muted)] mt-1">
              AI-assisted PSA &amp; BGS grade estimation from card images
            </p>
          </div>
          {!isUnlimited && credits && (
            <div className="shrink-0 text-right">
              <p className={`text-sm font-semibold tabular-nums ${
                remaining === 0 ? "text-rose-500" : remaining === 1 ? "text-amber-500" : "text-[var(--biz-text)]"
              }`}>
                {remaining} scan{remaining !== 1 ? "s" : ""} remaining
              </p>
              {remaining < 2 && credits.nextGrantAt && (
                <p className="text-xs text-[var(--biz-muted)]">+1 in {formatTimeUntil(credits.nextGrantAt)}</p>
              )}
            </div>
          )}
          {isUnlimited && (
            <span className="shrink-0 text-xs font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              Unlimited
            </span>
          )}
        </div>

        {/* ── Action cards ─────────────────────────────────────────────── */}
        <div className={`grid gap-4 ${isBusiness ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>

          {/* Scan a Card */}
          {canScan ? (
            <Link
              href="/grade-hub/scan?slots=1"
              className="group relative flex flex-col gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-5 transition-all hover:border-[var(--biz-primary)]/50 hover:shadow-md hover:shadow-[var(--biz-primary)]/5"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--biz-primary)]/10 text-[var(--biz-primary)]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-[var(--biz-primary)] transition-colors mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[var(--biz-text)]">Scan a Card</p>
                <p className="text-sm text-[var(--biz-muted)] mt-0.5">Upload front &amp; back for a full PSA/BGS grade probability breakdown</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Centering</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Corners</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Edges</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Surface</span>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-5 opacity-60">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--biz-hover)] text-[var(--biz-muted)]">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[var(--biz-text)]">Scan a Card</p>
                <p className="text-sm text-amber-500 mt-0.5">No scans remaining — upgrade for unlimited</p>
              </div>
            </div>
          )}

          {/* Batch Scan — business only */}
          {isBusiness && (
            canScan ? (
              <Link
                href="/grade-hub/scan?slots=3"
                className="group relative flex flex-col gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-5 transition-all hover:border-[var(--biz-primary)]/50 hover:shadow-md hover:shadow-[var(--biz-primary)]/5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--biz-primary)]/10 text-[var(--biz-primary)]">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--biz-primary)] bg-[var(--biz-primary)]/10 border border-[var(--biz-primary)]/20 rounded px-2 py-0.5">Business</span>
                    <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-[var(--biz-primary)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-[var(--biz-text)]">Batch Scan</p>
                  <p className="text-sm text-[var(--biz-muted)] mt-0.5">Grade up to 3 cards simultaneously in a single session</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-auto">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">3 cards</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Parallel</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--biz-muted)] border border-[var(--biz-border)] rounded px-2 py-0.5">Side-by-side</span>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-5 opacity-50">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--biz-hover)] text-[var(--biz-muted)]">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-[var(--biz-text)]">Batch Scan</p>
                  <p className="text-sm text-amber-500 mt-0.5">No scans remaining</p>
                </div>
              </div>
            )
          )}
        </div>

        {/* ── Recent scans ─────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--biz-muted)] mb-4">Recent Scans</p>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>

      </div>
    </AuthenticatedLayout>
  );
}
