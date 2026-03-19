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

const SCORED_ATTRIBUTES = [
  {
    label: "Centering",
    blurb: "Front & back alignment",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    chip: "bg-sky-50 text-sky-600 border-sky-200",
    iconBg: "bg-sky-100 text-sky-600",
  },
  {
    label: "Corners",
    blurb: "Sharpness & wear",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3h4M3 5v4M19 3h-4M21 5v4M5 21h4M3 19v-4M19 21h-4M21 19v-4" />
      </svg>
    ),
    chip: "bg-amber-50 text-amber-600 border-amber-200",
    iconBg: "bg-amber-100 text-amber-600",
  },
  {
    label: "Edges",
    blurb: "Fraying & nicks",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="1" strokeWidth={1.8} />
      </svg>
    ),
    chip: "bg-violet-50 text-violet-600 border-violet-200",
    iconBg: "bg-violet-100 text-violet-600",
  },
  {
    label: "Surface",
    blurb: "Scratches & print lines",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    chip: "bg-emerald-50 text-emerald-600 border-emerald-200",
    iconBg: "bg-emerald-100 text-emerald-600",
  },
];

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

      {/* ── Hero header band ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-50 via-white to-white border-b border-emerald-100 px-6 py-7">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shadow-emerald-200">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <span className="text-xs font-semibold tracking-widest uppercase text-emerald-600">Grade Probability Engine</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Estimate your grade odds.</h1>
            <p className="text-sm text-gray-500 mt-1">Upload card images — the engine scores centering, corners, edges &amp; surface and returns calibrated PSA &amp; BGS distributions.</p>
          </div>

          {/* Credit pill */}
          {!isUnlimited && credits && (
            <div className="shrink-0 flex flex-col items-end gap-0.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                remaining === 0
                  ? "bg-rose-50 border-rose-200 text-rose-600"
                  : remaining === 1
                  ? "bg-amber-50 border-amber-200 text-amber-600"
                  : "bg-emerald-50 border-emerald-200 text-emerald-600"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${remaining === 0 ? "bg-rose-500" : remaining === 1 ? "bg-amber-500" : "bg-emerald-500"}`} />
                {remaining} scan{remaining !== 1 ? "s" : ""} left
              </span>
              {remaining < 2 && credits.nextGrantAt && (
                <span className="text-[11px] text-gray-400">+1 in {formatTimeUntil(credits.nextGrantAt)}</span>
              )}
            </div>
          )}
          {isUnlimited && (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Unlimited
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-7 max-w-3xl mx-auto space-y-7">

        {/* ── Action cards ─────────────────────────────────────────────── */}
        <div className={`grid gap-4 ${isBusiness ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-lg"}`}>

          {/* Scan a Card */}
          {canScan ? (
            <Link
              href="/grade-hub/scan?slots=1"
              className="group relative flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10 border-t-[3px] border-t-emerald-500"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <svg className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-base">Scan a Card</p>
                <p className="text-sm text-gray-500 mt-1">Upload front &amp; back for a full grade probability breakdown across PSA &amp; BGS scales.</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {SCORED_ATTRIBUTES.map((a) => (
                  <span key={a.label} className={`text-[10px] font-semibold uppercase tracking-wider border rounded px-2 py-0.5 ${a.chip}`}>
                    {a.label}
                  </span>
                ))}
              </div>
            </Link>
          ) : (
            <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-gray-50 p-6 border-t-[3px] border-t-gray-300 opacity-70">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 text-gray-400">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-base">Scan a Card</p>
                <p className="text-sm text-amber-500 mt-1">No scans remaining — upgrade for unlimited access.</p>
              </div>
            </div>
          )}

          {/* Batch Scan — business only */}
          {isBusiness && (
            canScan ? (
              <Link
                href="/grade-hub/scan?slots=3"
                className="group relative flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 border-t-[3px] border-t-indigo-500"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-2 py-0.5">Business</span>
                    <svg className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 transition-colors mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-base">Batch Scan</p>
                  <p className="text-sm text-gray-500 mt-1">Grade up to 3 cards simultaneously in a single session — side-by-side results.</p>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {["3 cards", "Parallel", "Side-by-side"].map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold uppercase tracking-wider border border-indigo-200 rounded px-2 py-0.5 bg-indigo-50 text-indigo-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ) : (
              <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-gray-50 p-6 border-t-[3px] border-t-gray-300 opacity-70">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 text-gray-400">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-base">Batch Scan</p>
                  <p className="text-sm text-amber-500 mt-1">No scans remaining.</p>
                </div>
              </div>
            )
          )}
        </div>

        {/* ── What gets scored strip ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SCORED_ATTRIBUTES.map((a) => (
            <div key={a.label} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.iconBg}`}>
                {a.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{a.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{a.blurb}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Recent scans ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Scans</p>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>

      </div>
    </AuthenticatedLayout>
  );
}
