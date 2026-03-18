"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
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

function CreditRing({ remaining, total = 2 }: { remaining: number; total?: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(remaining / total, 1);
  const color = remaining === 0 ? "#f43f5e" : remaining === 1 ? "#f59e0b" : "#22c55e";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="shrink-0">
      <circle cx="19" cy="19" r={r} fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="2.5" />
      <circle
        cx="19" cy="19" r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 19 19)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="19" y="23" textAnchor="middle" fontSize="10" fontWeight="700" fill="white">{remaining}</text>
    </svg>
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
    <div className="min-h-screen" style={{ background: "#060a12" }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.06] px-6 py-5">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Grade Probability Engine</h1>
            <p className="mt-0.5 text-xs text-white/35">
              AI-scored centering, corners, edges &amp; surface — PSA &amp; BGS distributions
            </p>
          </div>

          {/* Credits status */}
          {isUnlimited ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="text-xs font-semibold text-amber-400">Unlimited scans</span>
            </div>
          ) : credits && (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-2">
              <CreditRing remaining={credits.remaining ?? 0} />
              <div>
                <p className="text-xs font-semibold text-white">
                  {credits.remaining === 0 ? "No scans left" : `${credits.remaining} scan${credits.remaining !== 1 ? "s" : ""} left`}
                </p>
                <p className="text-[10px] text-white/30">
                  {credits.nextGrantAt && (credits.remaining ?? 0) < 2
                    ? `+1 in ${formatTimeUntil(credits.nextGrantAt)}`
                    : "Replenishes weekly"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">

        {/* ── Action cards ─────────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">Start a scan</p>
          <div className={`grid gap-3 ${isBusiness ? "sm:grid-cols-2" : ""}`}>

            {/* Single scan */}
            {canScan ? (
              <Link
                href="/grade-hub/scan?slots=1"
                className="group flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition-all hover:border-blue-500/30 hover:bg-blue-500/[0.04]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/15 text-blue-400 transition-colors group-hover:bg-blue-600/20">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Single Card Scan</p>
                  <p className="mt-0.5 text-xs text-white/40">Upload front &amp; back · get full grade distribution</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/settings"
                className="group flex items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 transition-all hover:bg-amber-500/[0.08]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-400">No scans remaining</p>
                  <p className="mt-0.5 text-xs text-white/40">Upgrade for unlimited scans</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-amber-400/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}

            {/* Batch scan — business only */}
            {isBusiness && (
              <Link
                href={canScan ? "/grade-hub/scan?slots=3" : "#"}
                className={`group flex items-center gap-4 rounded-xl border p-5 transition-all ${
                  canScan
                    ? "border-white/[0.08] bg-white/[0.025] hover:border-amber-500/30 hover:bg-amber-500/[0.04]"
                    : "border-white/[0.04] bg-white/[0.015] opacity-50 pointer-events-none"
                }`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 transition-colors group-hover:bg-amber-500/15">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">Batch Scan</p>
                    <span className="rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400">Business</span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/40">3 cards simultaneously · side-by-side results</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* ── What gets scored ─────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">What gets scored</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Centering", desc: "Left/right & top/bottom ratio" },
              { label: "Corners", desc: "All four corner sharpness" },
              { label: "Edges", desc: "Chipping, nicks, roughness" },
              { label: "Surface", desc: "Scratches, print defects, gloss" },
            ].map(({ label, desc }) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                <p className="text-xs font-semibold text-white">{label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-white/30">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scan history ─────────────────────────────────────────────────── */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">Recent scans</p>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>

        {/* ── Disclaimer ───────────────────────────────────────────────────── */}
        <p className="text-[10px] leading-relaxed text-white/15 pb-4">
          Grade probability estimates are AI-assisted and not guaranteed. CardzCheck is not affiliated with PSA, BGS, SGC, or any grading company.
        </p>
      </div>
    </div>
  );
}
