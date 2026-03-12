"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardScanSlot, { type SlotState } from "@/components/grading/CardScanSlot";
import { useAuth } from "@/contexts/AuthContext";

const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 3,
};

function StatusDot({ state }: { state: SlotState }) {
  const cls =
    state === "done"
      ? "bg-emerald-500"
      : state === "analyzing"
      ? "bg-blue-500 animate-pulse"
      : state === "error"
      ? "bg-rose-500"
      : state === "ready"
      ? "bg-amber-400"
      : "bg-white/20";
  return <span className={`h-1.5 w-1.5 rounded-full ${cls} inline-block`} />;
}

function ScanPageInner() {
  const searchParams = useSearchParams();
  const { authUser, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<string>("free");
  const [tierLoaded, setTierLoaded] = useState(false);

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

  const gridCls =
    activeSlots === 1
      ? "max-w-2xl mx-auto"
      : activeSlots === 2
      ? "grid grid-cols-1 lg:grid-cols-2 gap-6"
      : "grid grid-cols-1 lg:grid-cols-3 gap-6";

  if (!tierLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-xs text-[var(--biz-muted)] animate-pulse">Loading session…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--biz-bg, #0b1220)" }}>

      {/* Minimal session bar */}
      <div className="sticky top-0 z-20 border-b border-[color:var(--biz-border)] bg-[var(--biz-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/grade-hub"
            className="flex items-center gap-1.5 text-xs text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Grade Hub
          </Link>

          <div className="flex items-center gap-2">
            {visible.map((s, i) => <StatusDot key={i} state={s} />)}
            {activeSlots > 1 && (
              <span className="ml-1 text-[11px] text-[var(--biz-muted)]">
                {doneCount}/{activeSlots}
                {anyAnalyzing ? " · analyzing…" : allDone ? " · complete" : ""}
              </span>
            )}
          </div>

          {maxSlots > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--biz-muted)] hidden sm:inline">Cards:</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setActiveSlots(n)}
                  className={`h-6 w-6 rounded-md text-[11px] font-semibold transition-colors ${
                    activeSlots === n
                      ? "bg-blue-600 text-white"
                      : "text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {tier === "business" && activeSlots === 1 && maxSlots > 1 && (
          <p className="mb-6 text-center text-xs text-[var(--biz-muted)]">
            Tip: use the card count above to analyze up to 3 cards simultaneously.
          </p>
        )}

        <motion.div layout className={gridCls}>
          <AnimatePresence initial={false}>
            {Array.from({ length: activeSlots }).map((_, i) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22, delay: i * 0.04 }}
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

        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 flex justify-center gap-3"
          >
            <Link
              href="/grade-hub"
              className="rounded-lg border border-[color:var(--biz-border)] px-5 py-2.5 text-sm text-[var(--biz-text)] transition-colors hover:bg-white/[0.03]"
            >
              Back to Hub
            </Link>
            <button
              onClick={() => setSlotStates(Array.from({ length: 3 }, () => "idle" as SlotState))}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98]"
            >
              New Session
            </button>
          </motion.div>
        )}

        <div className="mt-14 border-t border-[color:var(--biz-border)] pt-8">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--biz-muted)]">
            For the best results
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 text-xs text-[var(--biz-muted)] leading-relaxed">
            {[
              "Use flat, even lighting — avoid glare, shadows, or direct flash.",
              "Include both front and back for the most accurate analysis.",
              "Add close-ups for corners, edges, and surface to boost confidence.",
              "Fill the frame and keep the card sharp — blurry edges reduce confidence.",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="shrink-0 font-mono text-[10px] opacity-40">{String(i + 1).padStart(2, "0")}</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function GradeHubScanPage() {
  return (
    <AuthenticatedLayout>
      <Suspense fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="text-xs text-[var(--biz-muted)] animate-pulse">Loading…</span>
        </div>
      }>
        <ScanPageInner />
      </Suspense>
    </AuthenticatedLayout>
  );
}
