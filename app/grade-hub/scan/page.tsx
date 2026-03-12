"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import CardScanSlot, { type SlotState } from "@/components/grading/CardScanSlot";

const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 3,
};

// ── Logo ───────────────────────────────────────────────────────────────────
function ScanEngineLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="7" fill="url(#scan-logo-g)" />
      <rect x="6" y="13" width="16" height="1.5" rx="0.75" fill="white" opacity="0.9" />
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="white" strokeWidth="1.5" opacity="0.45" fill="none" />
      <path d="M8 11V8h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M20 11V8h-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M8 17v3h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M20 17v3h-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <defs>
        <linearGradient id="scan-logo-g" x1="0" y1="0" x2="28" y2="28">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────
function StatusDot({ state }: { state: SlotState }) {
  if (state === "done") return <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />;
  if (state === "analyzing") return <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />;
  if (state === "error") return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  if (state === "ready") return <span className="h-2 w-2 rounded-full bg-amber-400" />;
  return <span className="h-2 w-2 rounded-full bg-white/15" />;
}

function ScanPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { authUser, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<string>("free");
  const [tierLoaded, setTierLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  useEffect(() => {
    if (authLoading) return;
    fetch("/api/grading/credits")
      .then((r) => r.json())
      .then((d) => { setTier(d.tier ?? "free"); setTierLoaded(true); })
      .catch(() => setTierLoaded(true));
  }, [authLoading]);

  const maxSlots = TIER_MAX_SLOTS[tier] ?? 1;
  const requestedSlots = Math.min(
    Math.max(1, parseInt(searchParams.get("slots") ?? "1", 10) || 1),
    maxSlots
  );
  const [activeSlots, setActiveSlots] = useState(requestedSlots);
  const [slotStates, setSlotStates] = useState<SlotState[]>(
    Array.from({ length: 3 }, () => "idle" as SlotState)
  );

  useEffect(() => {
    setActiveSlots((p) => Math.min(p, maxSlots));
  }, [maxSlots]);

  const handleStateChange = useCallback((i: number, s: SlotState) => {
    setSlotStates((prev) => { const n = [...prev]; n[i] = s; return n; });
  }, []);

  const visible = slotStates.slice(0, activeSlots);
  const allDone = visible.every((s) => s === "done");
  const anyAnalyzing = visible.some((s) => s === "analyzing");
  const doneCount = visible.filter((s) => s === "done").length;

  if (!tierLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#060a12" }}>
        <div className="space-y-2 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-xs text-white/25">Initializing session…</p>
        </div>
      </div>
    );
  }

  const gridCls =
    activeSlots === 1
      ? "max-w-2xl mx-auto"
      : activeSlots === 2
      ? "grid grid-cols-1 lg:grid-cols-2 gap-5"
      : "grid grid-cols-1 lg:grid-cols-3 gap-5";

  return (
    <div className="relative min-h-screen" style={{ background: "#060a12" }}>

      {/* ── Session top bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#060a12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-5 gap-4">

          {/* Back */}
          <Link
            href="/grade-hub"
            className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-white/35 transition-colors hover:text-white/70"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Grade Hub
          </Link>

          {/* Center: brand + status */}
          <div className="flex flex-1 items-center justify-center gap-3">
            <ScanEngineLogo size={20} />
            <span className="hidden sm:inline text-xs font-bold text-white/60 tracking-tight">Scan Session</span>
            <div className="flex items-center gap-1.5">
              {visible.map((s, i) => <StatusDot key={i} state={s} />)}
            </div>
            {anyAnalyzing && (
              <span className="text-[10px] font-semibold text-blue-400 animate-pulse">Analyzing…</span>
            )}
            {allDone && activeSlots > 0 && (
              <span className="text-[10px] font-semibold text-emerald-400">
                {doneCount === 1 ? "Complete" : `${doneCount}/${activeSlots} complete`}
              </span>
            )}
          </div>

          {/* Slot selector (business only) */}
          {maxSlots > 1 ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-1 hidden text-[10px] text-white/25 sm:inline">Cards</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setActiveSlots(n)}
                  className={`h-7 w-7 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                    activeSlots === n
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/50"
                      : "text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <div className="w-20" /> /* spacer for flex balance */
          )}
        </div>
      </header>

      {/* ── Scan slots ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-5 py-8">

        {tier === "business" && activeSlots === 1 && maxSlots > 1 && (
          <p className="mb-6 text-center text-[11px] text-white/25">
            Use the card selector above to analyze up to 3 cards simultaneously.
          </p>
        )}

        <motion.div layout className={gridCls}>
          <AnimatePresence initial={false}>
            {Array.from({ length: activeSlots }).map((_, i) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
              >
                <CardScanSlot
                  slotIndex={i}
                  totalSlots={activeSlots}
                  onStateChange={handleStateChange}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* ── Post-session actions ──────────────────────────────────────── */}
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-10 flex justify-center gap-3"
          >
            <Link
              href="/grade-hub"
              className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-6 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              Back to Hub
            </Link>
            <button
              onClick={() => setSlotStates(Array.from({ length: 3 }, () => "idle" as SlotState))}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500 active:scale-[0.97]"
            >
              New Session
            </button>
          </motion.div>
        )}

        {/* ── Photo tips ────────────────────────────────────────────────── */}
        <div className="mt-16 border-t border-white/[0.05] pt-10">
          <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/20">
            Tips for best results
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", tip: "Use flat, even lighting — avoid glare, shadows, or direct flash." },
              { n: "02", tip: "Always include both front and back for the most accurate analysis." },
              { n: "03", tip: "Add close-ups of corners, edges, and surface to boost confidence." },
              { n: "04", tip: "Fill the frame and keep the card sharp — blur reduces accuracy." },
            ].map(({ n, tip }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-white/15">{n}</span>
                <p className="text-xs leading-relaxed text-white/30">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function GradeHubScanPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#060a12" }}>
        <div className="space-y-2 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-xs text-white/25">Loading…</p>
        </div>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  );
}
