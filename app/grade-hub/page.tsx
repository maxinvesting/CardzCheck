"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Personal",
  business: "Business",
};

// ── Engine mark (minimal wordmark svg) ────────────────────────────────────
function EngineMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="url(#gm-grad)" />
      <path
        d="M10 22v-8a6 6 0 0112 0v8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".9"
      />
      <circle cx="16" cy="14" r="2.5" fill="white" opacity=".95" />
      <path d="M10 22h12" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      <defs>
        <linearGradient id="gm-grad" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Tier pill ─────────────────────────────────────────────────────────────
function TierPill({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    free: "text-[var(--biz-muted)] border-white/10",
    pro: "text-blue-400 border-blue-500/30",
    business: "text-amber-400 border-amber-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-widest uppercase ${styles[tier] ?? styles.free}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}

// ── Credit bar (free users) ───────────────────────────────────────────────
function CreditStatus({ remaining, nextGrantAt }: { remaining: number; nextGrantAt: string | null }) {
  const pct = (remaining / 2) * 100;
  const color = remaining === 0 ? "bg-rose-500" : remaining === 1 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = remaining === 0 ? "text-rose-400" : remaining === 1 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${textColor}`}>
          {remaining} of 2 free scan{remaining !== 1 ? "s" : ""} remaining
        </span>
        {nextGrantAt && remaining < 2 && (
          <span className="text-[var(--biz-muted)]">+1 in {formatTimeUntil(nextGrantAt)}</span>
        )}
      </div>
      <div className="h-px w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Feature row item ──────────────────────────────────────────────────────
function Feature({
  icon,
  title,
  desc,
  dimmed,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  dimmed?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${dimmed ? "opacity-40" : ""}`}>
      <div className="mt-0.5 shrink-0 text-[var(--biz-muted)]">{icon}</div>
      <div>
        <p className="text-sm font-medium text-[var(--biz-text)]">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--biz-muted)]">{desc}</p>
      </div>
    </div>
  );
}

// ── Slot preview dots ─────────────────────────────────────────────────────
function SlotDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={`h-6 w-5 rounded border transition-all duration-300 ${
            i < count
              ? "border-blue-500/60 bg-blue-500/10"
              : "border-white/10 bg-white/[0.02]"
          }`}
        />
      ))}
      <span className="ml-1 text-[11px] text-[var(--biz-muted)]">
        {count} card{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export default function GradeHubPage() {
  const [credits, setCredits] = useState<CreditStatus | null>(null);

  const isBusiness = credits?.tier === "business";
  const isUnlimited = credits?.unlimited === true;
  const canScan = isUnlimited || (credits?.remaining ?? 0) > 0;
  const scanSlots = isBusiness ? 3 : 1;
  const scanHref = `/grade-hub/scan?slots=${scanSlots}`;

  useEffect(() => {
    fetch("/api/grading/credits")
      .then((r) => r.json())
      .then(setCredits)
      .catch(() => {});
  }, []);

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen" style={{ background: "var(--biz-bg, #0b1220)" }}>

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <div className="border-b border-[color:var(--biz-border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <EngineMark />
              <div className="leading-tight">
                <p className="text-sm font-bold text-[var(--biz-text)] tracking-tight">GradeScan Engine</p>
                <p className="text-[10px] text-[var(--biz-muted)] tracking-widest uppercase">by CardzCheck</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {credits && <TierPill tier={credits.tier} />}
              {isUnlimited && (
                <span className="text-xs text-[var(--biz-muted)]">Unlimited scans</span>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6">

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <div className="py-16">
            <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">

              {/* Left: headline */}
              <div className="max-w-md space-y-5">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-blue-400">
                  AI-Powered Pre-Grade Analysis
                </p>
                <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-extrabold leading-[1.1] tracking-tight text-[var(--biz-text)]">
                  Know your card's grade<br />
                  <span className="text-blue-400">before you submit.</span>
                </h1>
                <p className="text-sm leading-relaxed text-[var(--biz-muted)] max-w-sm">
                  Upload front and back photos. Our engine analyzes centering, corners,
                  edges, and surface to produce calibrated PSA & BGS grade probabilities.
                </p>

                {/* Free credit status */}
                {!isUnlimited && credits && (
                  <div className="max-w-xs pt-1">
                    <CreditStatus
                      remaining={credits.remaining ?? 0}
                      nextGrantAt={credits.nextGrantAt}
                    />
                  </div>
                )}
              </div>

              {/* Right: scan CTA */}
              <div className="lg:min-w-[260px]">
                <div className="space-y-4">
                  {/* Slot dots */}
                  {credits && <SlotDots count={scanSlots} />}

                  {canScan ? (
                    <Link
                      href={scanHref}
                      className="group flex items-center justify-between gap-3 rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all duration-150 hover:bg-blue-500 active:scale-[0.98]"
                    >
                      <span>{isBusiness ? "Start Batch Session" : "Start New Scan"}</span>
                      <svg className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs text-rose-400 font-medium">No scans remaining</p>
                      <Link
                        href="/settings"
                        className="flex items-center justify-between gap-3 rounded-xl bg-blue-600 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500"
                      >
                        <span>Upgrade for Unlimited</span>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </Link>
                      {credits?.nextGrantAt && (
                        <p className="text-center text-[11px] text-[var(--biz-muted)]">
                          Free credit arrives in {formatTimeUntil(credits.nextGrantAt)}
                        </p>
                      )}
                    </div>
                  )}

                  {isBusiness && (
                    <p className="text-[11px] text-[var(--biz-muted)]">
                      Analyze 1, 2, or 3 cards simultaneously in one session.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <div className="h-px bg-[color:var(--biz-border)]" />

          {/* ── What we analyze ────────────────────────────────────────── */}
          <div className="py-12">
            <p className="mb-8 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
              What the engine analyzes
            </p>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                }
                title="Centering"
                desc="Left/right and top/bottom ratios measured against grading standards."
              />
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1M4.22 4.22l.707.707m12.728 12.728l.707.707M1 12h1m18 0h1M4.22 19.78l.707-.707M18.364 5.636l.707-.707" />
                  </svg>
                }
                title="Corners"
                desc="Each corner analyzed for wear, fraying, and edge degradation."
              />
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                }
                title="Edges"
                desc="All four edges scanned for nicks, chips, and border integrity."
              />
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z" />
                  </svg>
                }
                title="Surface"
                desc="Print defects, scratches, staining, and gloss loss detected."
              />
            </div>

            {/* Grading + export row */}
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
                title="PSA & BGS Distributions"
                desc="Calibrated probability across every grade tier, not just a single prediction."
              />
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                }
                title="Batch Scanning"
                desc="Business members analyze up to 3 cards simultaneously."
                dimmed={!isBusiness}
              />
              <Feature
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="PDF & PNG Export"
                desc="Professional grade reports ready to share with buyers or submission services."
              />
            </div>
          </div>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <div className="h-px bg-[color:var(--biz-border)]" />

          {/* ── Scan History ───────────────────────────────────────────── */}
          <div className="py-12">
            <p className="mb-6 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
              Recent scans
            </p>
            <GradeEstimatorHistoryPanel onSelectRun={() => {}} activeRunId={null} />
          </div>

          {/* ── Footer disclaimer ──────────────────────────────────────── */}
          <div className="border-t border-[color:var(--biz-border)] py-8">
            <p className="text-[11px] leading-relaxed text-[var(--biz-muted)] max-w-2xl">
              GradeScan Engine provides AI-assisted grade probability estimates and is not guaranteed accurate.
              Results should not replace professional grading judgment. CardzCheck is not affiliated with PSA,
              BGS, SGC, or any third-party grading company.
            </p>
          </div>

        </div>
      </div>
    </AuthenticatedLayout>
  );
}
