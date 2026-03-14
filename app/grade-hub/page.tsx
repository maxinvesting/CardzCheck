"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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

// ── App top bar ────────────────────────────────────────────────────────────
function AppBar({ tier, unlimited }: { tier?: string; unlimited?: boolean }) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-white/[0.06] bg-[#060a12]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        {/* Left: back to app */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white/70"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          CardzCheck
        </Link>

        {/* Center: wordmark */}
        <div className="flex items-center gap-2.5">
          <ScanEngineLogo />
          <div className="leading-none">
            <span className="text-sm font-bold tracking-tight text-white">GradeScan</span>
            <span className="ml-1.5 text-[10px] font-semibold tracking-widest text-blue-400 uppercase">Engine</span>
          </div>
        </div>

        {/* Right: tier pill */}
        <div className="flex items-center gap-3">
          {tier && <TierPill tier={tier} />}
          {unlimited && (
            <span className="hidden sm:inline text-[11px] text-white/30">Unlimited</span>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Logo mark ──────────────────────────────────────────────────────────────
function ScanEngineLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="7" fill="url(#se-g)" />
      {/* scan line */}
      <rect x="6" y="13" width="16" height="1.5" rx="0.75" fill="white" opacity="0.9" />
      {/* card outline */}
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="white" strokeWidth="1.5" opacity="0.45" fill="none" />
      {/* corner markers */}
      <path d="M8 11V8h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M20 11V8h-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M8 17v3h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M20 17v3h-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <defs>
        <linearGradient id="se-g" x1="0" y1="0" x2="28" y2="28">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Tier pill ──────────────────────────────────────────────────────────────
function TierPill({ tier }: { tier: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    free:     { label: "Free",     cls: "text-white/40 border-white/10 bg-white/[0.03]" },
    pro:      { label: "Personal", cls: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    business: { label: "Business", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  };
  const { label, cls } = map[tier] ?? map.free;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase ${cls}`}>
      <span className="h-1 w-1 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

// ── Animated scan lines (decorative) ──────────────────────────────────────
function ScanGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.035]">
      {/* horizontal scan lines */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="absolute w-full border-t border-blue-400" style={{ top: `${i * 5}%` }} />
      ))}
      {/* vertical scan lines */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="absolute h-full border-l border-blue-400" style={{ left: `${i * 5}%` }} />
      ))}
    </div>
  );
}

// ── Grade probability visual ───────────────────────────────────────────────
function GradeBar({ grade, pct, active }: { grade: string; pct: number; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-8 text-right text-[10px] font-bold ${active ? "text-blue-400" : "text-white/30"}`}>{grade}</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-white/[0.06]">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${active ? "bg-blue-500" : "bg-white/20"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`w-8 text-[10px] ${active ? "text-blue-400 font-semibold" : "text-white/20"}`}>{pct}%</span>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
      <p className="text-2xl font-extrabold tracking-tight text-white">{value}</p>
      <p className="text-xs font-semibold text-white/60">{label}</p>
      {sub && <p className="text-[10px] text-white/25">{sub}</p>}
    </div>
  );
}

// ── Credit ring ───────────────────────────────────────────────────────────
function CreditRing({ remaining, total = 2 }: { remaining: number; total?: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const pct = remaining / total;
  const color = remaining === 0 ? "#f43f5e" : remaining === 1 ? "#f59e0b" : "#22c55e";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="white" strokeOpacity="0.06" strokeWidth="3" />
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">{remaining}</text>
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

  const pathname = usePathname();
  const isBusinessContext = pathname?.startsWith("/business");
  const isBusiness = credits?.tier === "business";
  const isUnlimited = credits?.unlimited === true;
  const canScan = isUnlimited || (credits?.remaining ?? 0) > 0;
  const scanSlots = isBusiness ? 3 : 1;
  const scanBase = isBusinessContext ? "/business/grade-hub/scan" : "/grade-hub/scan";
  const scanHref = `${scanBase}?slots=${scanSlots}`;

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: "#060a12" }}>
      <ScanGrid />
      <AppBar tier={credits?.tier} unlimited={isUnlimited} />

      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section className="relative pt-14">
        {/* Glow */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-blue-600/10 blur-[80px]" />

        <div className="mx-auto max-w-6xl px-5">
          <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-16 py-20 lg:flex-row lg:items-start lg:justify-between lg:py-28">

            {/* Left: headline + CTA */}
            <div className="relative z-10 max-w-xl space-y-8 text-center lg:text-left">
              <div className="space-y-2">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-blue-500">
                  AI Pre-Grade Analysis Engine
                </p>
                <h1 className="text-[clamp(2.4rem,5vw,3.6rem)] font-black leading-[1.05] tracking-tight text-white">
                  Know the grade<br />
                  <span className="relative">
                    <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                      before you submit.
                    </span>
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-base leading-relaxed text-white/45">
                  Upload front and back. Our engine scores centering, corners, edges,
                  and surface — delivering calibrated PSA & BGS grade probabilities in seconds.
                </p>
              </div>

              {/* Free credit indicator */}
              {!isUnlimited && credits && (
                <div className="inline-flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-3.5">
                  <CreditRing remaining={credits.remaining ?? 0} />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {credits.remaining === 0 ? "No scans remaining" : `${credits.remaining} scan${credits.remaining !== 1 ? "s" : ""} remaining`}
                    </p>
                    <p className="text-[11px] text-white/35">
                      {credits.nextGrantAt && (credits.remaining ?? 0) < 2
                        ? `+1 free credit in ${formatTimeUntil(credits.nextGrantAt)}`
                        : "2 free credits · replenishes weekly"}
                    </p>
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="flex flex-col items-center gap-3 sm:flex-row lg:items-start">
                {canScan ? (
                  <Link
                    href={scanHref}
                    className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-blue-600 px-7 py-4 text-sm font-bold text-white shadow-2xl shadow-blue-900/50 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-800/60 active:scale-[0.97]"
                  >
                    {/* scan line animation */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <ScanEngineLogo />
                    <span className="text-[15px]">{isBusiness ? "Start Batch Session" : "Start New Scan"}</span>
                    <svg className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                ) : (
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-7 py-4 text-sm font-bold text-amber-400 transition-all hover:bg-amber-500/20 active:scale-[0.97]"
                  >
                    Upgrade for unlimited scans
                  </Link>
                )}
                {isBusiness && (
                  <p className="self-center text-[11px] text-white/25 lg:self-auto">
                    Up to {scanSlots} cards at once
                  </p>
                )}
              </div>
            </div>

            {/* Right: mock grade output panel */}
            <div className="relative w-full max-w-[340px] shrink-0 lg:mt-8">
              {/* Glow behind panel */}
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-blue-600/15 blur-2xl scale-95" />
              <div className="relative rounded-2xl border border-white/[0.09] bg-[#0c1220] p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Grade Analysis</p>
                    <p className="mt-0.5 text-sm font-bold text-white">2023 Topps Chrome · Ohtani RC</p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                    PSA 10 · 68%
                  </span>
                </div>
                <div className="space-y-2.5">
                  <GradeBar grade="10" pct={68} active />
                  <GradeBar grade="9" pct={22} />
                  <GradeBar grade="8" pct={7} />
                  <GradeBar grade="7" pct={3} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/[0.06] pt-4">
                  {[
                    { label: "Centering", val: "9.5" },
                    { label: "Corners", val: "10" },
                    { label: "Edges", val: "9.5" },
                    { label: "Surface", val: "10" },
                  ].map(({ label, val }) => (
                    <div key={label} className="text-center">
                      <p className="text-[13px] font-extrabold text-white">{val}</p>
                      <p className="text-[9px] text-white/30">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard value="4" label="Attributes scored" sub="Centering · Corners · Edges · Surface" />
            <StatCard value="PSA & BGS" label="Grading scales" sub="Full probability distribution" />
            <StatCard value="&lt;60s" label="Average analysis time" sub="Async job processing" />
            <StatCard value={isBusiness ? "3 cards" : "1 card"} label="Simultaneous scans" sub={isBusiness ? "Business plan" : "Upgrade for batch"} />
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="mb-10 text-[11px] font-bold uppercase tracking-[0.18em] text-white/25">How it works</p>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Upload photos",
                desc: "Provide front and back. Add corner or edge close-ups for higher confidence.",
                icon: (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Engine analyzes",
                desc: "Our AI scores each of the four PSA/BGS sub-grades: centering, corners, edges, and surface.",
                icon: (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Grade probabilities",
                desc: "Receive a full distribution across every grade tier — not just a single estimate.",
                icon: (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
              },
            ].map(({ step, title, desc, icon }) => (
              <div key={step} className="group space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.10] hover:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400">
                    {icon}
                  </div>
                  <span className="font-mono text-[10px] font-bold text-white/20">{step}</span>
                </div>
                <div>
                  <p className="font-bold text-white">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/40">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scan history ──────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.18em] text-white/25">Recent scans</p>
          <GradeEstimatorHistoryPanel onSelect={() => {}} />
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05]">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <p className="text-[11px] leading-relaxed text-white/20 max-w-2xl">
            GradeScan Engine provides AI-assisted grade probability estimates. Results are not guaranteed
            and should not replace professional grading judgment. CardzCheck is not affiliated with PSA,
            BGS, SGC, or any grading company.
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
