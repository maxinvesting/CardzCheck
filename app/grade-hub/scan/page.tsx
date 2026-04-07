"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Playfair_Display } from "next/font/google";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardScanSlot, { type SlotState } from "@/components/grading/CardScanSlot";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600"] });
const CC_BLUE = "#2563eb";
const GOLD = "#c8a951";

const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 10,
};

function StatusDot({ state }: { state: SlotState }) {
  if (state === "done")      return <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />;
  if (state === "analyzing") return <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />;
  if (state === "error")     return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  if (state === "ready")     return <span className="h-2 w-2 rounded-full bg-amber-400" />;
  return <span className="h-2 w-2 rounded-full bg-gray-300" />;
}

function ScanPageInner() {
  const pathname = usePathname();
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
  const gradeHubBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";

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
      <div className="min-h-screen bg-[#111]">

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div
          style={{ backgroundColor: CC_BLUE, borderBottom: `3px solid ${GOLD}` }}
          className="flex items-center gap-0 px-6"
        >
          <div className="flex items-stretch flex-1">
            <Link
              href={gradeHubBasePath}
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.6px",
                color: "rgba(255,255,255,0.55)",
                borderBottom: "3px solid transparent",
                marginBottom: -3,
                padding: "14px 20px 14px 0",
                display: "flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
            >
              <svg style={{ width: 12, height: 12 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Grade Hub
            </Link>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.6px",
                color: "#fff",
                borderBottom: `3px solid ${GOLD}`,
                marginBottom: -3,
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Scan Session
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {visible.map((s, i) => <StatusDot key={i} state={s} />)}
              </div>
              {anyAnalyzing && (
                <span style={{ fontSize: 10, color: "#bfdbfe", fontWeight: 600 }}>Analyzing…</span>
              )}
              {allDone && activeSlots > 0 && (
                <span style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600 }}>
                  {doneCount === 1 ? "Complete" : `${doneCount}/${activeSlots} complete`}
                </span>
              )}
            </div>
          </div>

          {/* Slot selector (business) + New scan */}
          <div className="flex items-center gap-2 py-2">
            {maxSlots > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>Cards</span>
                {Array.from({ length: maxSlots }, (_, idx) => idx + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setActiveSlots(n)}
                    style={{
                      width: 28, height: 28,
                      borderRadius: 2,
                      fontSize: 11,
                      fontWeight: 700,
                      border: "none",
                      background: activeSlots === n ? GOLD : "transparent",
                      color: activeSlots === n ? "#1e3a8a" : "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push(gradeHubBasePath)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.6px",
                borderRadius: 2,
                border: "none",
                color: "#1e3a8a",
                background: GOLD,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              New scan
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">

          {/* Page title */}
          <div className="space-y-1">
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: GOLD }}>
              Grade Probability Engine
            </p>
            <h1 className={playfair.className} style={{ fontSize: 22, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>
              {activeSlots === 1 ? "Analyze your card." : `Analyze ${activeSlots} cards.`}
            </h1>
          </div>

          {!tierLoaded ? (
            <div className="flex items-center justify-center py-20">
              <div className="space-y-3 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Initializing session…</p>
              </div>
            </div>
          ) : (
            <>
              {/* Scan slots */}
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

              {/* Post-session actions */}
              {allDone && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex justify-center gap-3"
                >
                  <Link
                    href={gradeHubBasePath}
                    style={{
                      fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                      borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)",
                      background: "rgba(255,255,255,0.06)", padding: "9px 20px", textDecoration: "none",
                    }}
                  >
                    Back to Hub
                  </Link>
                  <button
                    onClick={() => router.push(gradeHubBasePath)}
                    style={{
                      fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                      borderRadius: 2, border: "none", color: "#fff",
                      background: CC_BLUE, padding: "9px 20px", cursor: "pointer",
                    }}
                  >
                    New Session
                  </button>
                </motion.div>
              )}

              {/* Photo tips — only show when idle (no results yet) */}
              {!anyAnalyzing && doneCount === 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 32, marginTop: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
                    Tips for best results
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderTop: `3px solid ${CC_BLUE}`,
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.03)",
                      padding: "16px 20px",
                    }}
                  >
                    {[
                      { n: "01", tip: "Use flat, even lighting — avoid glare, shadows, or direct flash." },
                      { n: "02", tip: "Always include both front and back for the most accurate analysis." },
                      { n: "03", tip: "Add close-ups of corners, edges, and surface to boost confidence." },
                      { n: "04", tip: "Fill the frame and keep the card sharp — blur reduces accuracy." },
                    ].map(({ n, tip }) => (
                      <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: GOLD, flexShrink: 0, marginTop: 2 }}>{n}</span>
                        <p style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.35)", margin: 0 }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

export default function GradeHubScanPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</p>
        </div>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  );
}
