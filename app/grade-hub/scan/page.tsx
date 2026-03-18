"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardScanSlot, { type SlotState } from "@/components/grading/CardScanSlot";

const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 10,
};

// ── Status dot ─────────────────────────────────────────────────────────────
function StatusDot({ state }: { state: SlotState }) {
  if (state === "done")      return <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />;
  if (state === "analyzing") return <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />;
  if (state === "error")     return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  if (state === "ready")     return <span className="h-2 w-2 rounded-full bg-amber-400" />;
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
    Array.from({ length: TIER_MAX_SLOTS.business }, () => "idle" as SlotState)
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

  const gridCls =
    activeSlots === 1
      ? "max-w-2xl mx-auto"
      : activeSlots === 2
      ? "grid grid-cols-1 lg:grid-cols-2 gap-5"
      : "grid grid-cols-1 lg:grid-cols-3 gap-5";

  return (
    <AuthenticatedLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pb-2 border-b border-[var(--biz-border)]">
          <div className="flex items-center gap-3">
            <Link
              href="/grade-hub"
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Grade Hub
            </Link>
            <span className="text-[var(--biz-border)]">/</span>
            <h1 className="text-sm font-semibold text-[var(--biz-text)]">Scan Session</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Status indicators */}
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

            {/* Slot selector (business only) */}
            {maxSlots > 1 && (
              <div className="flex items-center gap-1">
                <span className="mr-1 hidden text-[10px] text-[var(--biz-muted)] sm:inline">Cards</span>
                {Array.from({ length: maxSlots }, (_, idx) => idx + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setActiveSlots(n)}
                    className={`h-7 w-7 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                      activeSlots === n
                        ? "bg-blue-600 text-white shadow-md shadow-blue-900/50"
                        : "text-[var(--biz-muted)] hover:text-[var(--biz-text)] hover:bg-[var(--biz-hover)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!tierLoaded ? (
          <div className="flex items-center justify-center py-20">
            <div className="space-y-2 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-xs text-[var(--biz-muted)]">Initializing session…</p>
            </div>
          </div>
        ) : (
          <>
            {tier === "business" && activeSlots === 1 && maxSlots > 1 && (
              <p className="text-center text-[11px] text-[var(--biz-muted)]">
                Use the card selector above to analyze up to 3 cards simultaneously.
              </p>
            )}

            {/* ── Scan slots ──────────────────────────────────────────── */}
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

            {/* ── Post-session actions ─────────────────────────────────── */}
            {allDone && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex justify-center gap-3"
              >
                <Link
                  href="/grade-hub"
                  className="rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-6 py-2.5 text-sm font-semibold text-[var(--biz-muted)] transition-colors hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
                >
                  Back to Hub
                </Link>
                <button
                  onClick={() =>
                    setSlotStates(
                      Array.from({ length: TIER_MAX_SLOTS.business }, () => "idle" as SlotState)
                    )
                  }
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-blue-500 active:scale-[0.97]"
                >
                  New Session
                </button>
              </motion.div>
            )}

            {/* ── Photo tips ───────────────────────────────────────────── */}
            <div className="border-t border-[var(--biz-border)] pt-8">
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--biz-muted)]">
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
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold text-[var(--biz-muted)]">{n}</span>
                    <p className="text-xs leading-relaxed text-[var(--biz-muted)]">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AuthenticatedLayout>
  );
}

export default function GradeHubScanPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--biz-bg)]">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-xs text-[var(--biz-muted)]">Loading…</p>
        </div>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  );
}
