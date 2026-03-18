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

function CreditBadge({ remaining, nextGrantAt }: { remaining: number; nextGrantAt: string | null }) {
  const color = remaining === 0
    ? "text-rose-400 border-rose-500/20 bg-rose-500/10"
    : remaining === 1
    ? "text-amber-400 border-amber-500/20 bg-amber-500/10"
    : "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold ${color}`}>
      <span>{remaining} scan{remaining !== 1 ? "s" : ""} left</span>
      {remaining < 2 && nextGrantAt && (
        <span className="text-[var(--biz-muted)] font-normal">· +1 in {formatTimeUntil(nextGrantAt)}</span>
      )}
    </div>
  );
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

  return (
    <AuthenticatedLayout>
      <div className="px-4 py-6 sm:px-6 max-w-3xl mx-auto space-y-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-[var(--biz-border)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--biz-primary)] mb-0.5">Grade Hub</p>
            <h1 className="text-xl font-bold text-[var(--biz-text)] leading-tight">Grade Probability Engine</h1>
            <p className="text-sm text-[var(--biz-muted)] mt-0.5">AI-assisted centering, corners, edges &amp; surface scoring</p>
          </div>
          {!isUnlimited && credits && (
            <CreditBadge remaining={credits.remaining ?? 0} nextGrantAt={credits.nextGrantAt} />
          )}
          {isUnlimited && (
            <span className="text-xs text-[var(--biz-muted)] shrink-0">Unlimited scans</span>
          )}
        </div>

        {/* ── Action cards ────────────────────────────────────────────── */}
        <div className={`grid gap-3 ${isBusiness ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {canScan ? (
            <Link
              href="/grade-hub/scan?slots=1"
              className="group flex items-center gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-5 py-4 transition-all hover:border-[var(--biz-primary)]/40 hover:bg-[var(--biz-hover)] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400 group-hover:bg-blue-600/25 transition-colors">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--biz-text)] text-sm">Scan a Card</p>
                <p className="text-xs text-[var(--biz-muted)] mt-0.5">Upload front &amp; back · get full grade distribution</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-[var(--biz-primary)] group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <Link
              href="/settings"
              className="flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4 transition-all hover:bg-amber-500/[0.08]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-400 text-sm">No scans remaining</p>
                <p className="text-xs text-[var(--biz-muted)] mt-0.5">Upgrade to unlock unlimited scans</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}

          {isBusiness && canScan && (
            <Link
              href="/grade-hub/scan?slots=3"
              className="group flex items-center gap-4 rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-5 py-4 transition-all hover:border-amber-500/30 hover:bg-[var(--biz-hover)] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--biz-text)] text-sm">
                  Batch Scan <span className="text-amber-400/70 text-xs font-normal ml-1">3 cards</span>
                </p>
                <p className="text-xs text-[var(--biz-muted)] mt-0.5">Scan multiple cards simultaneously</p>
              </div>
              <svg className="h-4 w-4 text-[var(--biz-muted)] group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {/* ── What gets scored ────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--biz-muted)] mb-3">What gets scored</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Centering", icon: "⊞" },
              { label: "Corners",   icon: "◢" },
              { label: "Edges",     icon: "▬" },
              { label: "Surface",   icon: "◻" },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg bg-[var(--biz-hover)] px-3 py-2.5">
                <span className="text-base text-[var(--biz-muted)]">{icon}</span>
                <span className="text-xs font-semibold text-[var(--biz-text)]">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--biz-muted)] mt-3 leading-relaxed">
            Returns calibrated PSA &amp; BGS probability distributions — not just a single estimate.
          </p>
        </div>

        {/* ── Scan history ────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--biz-muted)] mb-3">Recent Scans</p>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>

      </div>
    </AuthenticatedLayout>
  );
}
