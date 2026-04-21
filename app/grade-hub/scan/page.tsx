"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Playfair_Display } from "next/font/google";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import CardScanSlot, {
  type CardScanSlotCompleteResult,
  type SlotState,
} from "@/components/grading/CardScanSlot";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import MockSubmissionFlow from "@/components/grading/MockSubmissionFlow";
import { MicButton } from "@/components/ui/MicButton";
import {
  buildDeclaredScanPrefaceFromTitle,
  buildParsedCardDetailLine,
} from "@/lib/grading/cardTitleInput";
import { saveGradeHubResultsSession } from "@/lib/grading/gradeHubResultsSession";
import { persistGradeEstimatorHistoryRun } from "@/lib/grading/persistHistoryRun";
import { appendSpeechTranscript } from "@/lib/speech";
import type { GradeEstimatorHistoryRun } from "@/types";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600"] });

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = "#FFFFFF";
const SURFACE = "#F7F7F7";
const CARD_BG = "#FAFAFA";
const RED     = "#B91C1C";
const TEXT    = "#111111";
const MUTED   = "#888888";
const BORDER  = "#E5E5E5";

// ── Tier slot limits ──────────────────────────────────────────────────────────
const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 10,
};

type WizardStep = 1 | 2 | 3 | 4;
type GradingCompany = "PSA" | "BGS" | "SGC";
type ScanMode = "scan" | "mock";

const QUICK_FLAGS = [
  "Centering concern",
  "Surface scratch",
  "Corner wear",
  "Edge chip",
] as const;

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatEstimateRange(run: GradeEstimatorHistoryRun): string {
  const low = run.estimate.estimated_grade_low;
  const high = run.estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "Grade unavailable";
  return low === high
    ? `PSA ${formatGradeNumber(low)}`
    : `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildCardMeta(run: GradeEstimatorHistoryRun): string {
  return [
    run.card.year,
    run.card.set_name,
    run.card.parallel_type,
    run.card.card_number ? `#${run.card.card_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Light-background confidence pills (scan page theme) */
const SCAN_CONFIDENCE_CLASS: Record<string, string> = {
  high: "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800",
  medium:
    "rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800",
  low: "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900",
};

// ── Progress step indicator ───────────────────────────────────────────────────
const STEP_LABELS: Record<WizardStep, string> = {
  1: "Card Details",
  2: "Card Upload",
  3: "Notes & Context",
  4: "Run Analysis",
};

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {([1, 2, 3, 4] as WizardStep[]).map((step, i) => {
        const done    = current > step;
        const active  = current === step;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              {/* Circle */}
              <div style={{
                width: 24, height: 24,
                borderRadius: "50%",
                border: `1px solid ${done || active ? RED : BORDER}`,
                background: done ? RED : active ? CARD_BG : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {done ? (
                  <svg width="10" height="10" fill="none" stroke={BG} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    color: active ? RED : MUTED,
                  }}>
                    {step}
                  </span>
                )}
              </div>
              {/* Label */}
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.8px",
                textTransform: "uppercase",
                color: active ? RED : done ? TEXT : MUTED,
                whiteSpace: "nowrap",
              }}>
                {STEP_LABELS[step]}
              </span>
            </div>

            {/* Connector line */}
            {i < 3 && (
              <div style={{
                width: 48,
                height: 1,
                background: done ? RED : BORDER,
                margin: "0 4px",
                marginBottom: 20,
                flexShrink: 0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status dot (multi-slot) ───────────────────────────────────────────────────
function StatusDot({ state }: { state: SlotState }) {
  if (state === "done")      return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 6px rgba(34,197,94,0.7)" }} />;
  if (state === "analyzing") return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3b82f6", display: "inline-block", boxShadow: "0 0 6px rgba(59,130,246,0.7)", animation: "pulse 1s ease-in-out infinite" }} />;
  if (state === "error")     return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />;
  if (state === "ready")     return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />;
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#333", display: "inline-block" }} />;
}

// ── Main inner component ──────────────────────────────────────────────────────
function ScanPageInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { authUser, loading: authLoading } = useAuth();

  const [tier,       setTier]       = useState<string>("free");
  const [tierLoaded, setTierLoaded] = useState(false);

  const gradeHubBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";

  // ── Wizard state ────────────────────────────────────────────────────────────
  const rawMode          = searchParams.get("mode");
  const [mode]           = useState<ScanMode>(rawMode === "mock" ? "mock" : "scan");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // Step 1 — Card identity via a single free-form title
  const [cardTitle,      setCardTitle]      = useState("");
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>("PSA");

  // Step 3 — Notes & context
  const [notes,      setNotes]      = useState("");
  const [quickFlags, setQuickFlags] = useState<string[]>([]);

  // Step 4 — Slot states for multi-card
  const [slotStates, setSlotStates] = useState<SlotState[]>(
    Array.from({ length: TIER_MAX_SLOTS.business }, () => "idle" as SlotState)
  );
  const [completedRuns, setCompletedRuns] = useState<Record<number, GradeEstimatorHistoryRun>>({});
  const resultsSessionSavedRef = useRef(false);
  const [savedResultsSession, setSavedResultsSession] = useState<{
    id: string;
    jobsParam: string;
    createdAt: string;
  } | null>(null);

  // ── Tier ────────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    setActiveSlots((p) => Math.min(p, maxSlots));
  }, [maxSlots]);

  const handleStateChange = useCallback((i: number, s: SlotState) => {
    setSlotStates((prev) => {
      const next = [...prev];
      next[i] = s;
      return next;
    });
    if (s !== "done") {
      resultsSessionSavedRef.current = false;
      setSavedResultsSession(null);
      setCompletedRuns((prev) => {
        if (!(i in prev)) return prev;
        const next = { ...prev };
        delete next[i];
        return next;
      });
    }
  }, []);

  const handleSlotComplete = useCallback(async (
    slotIndex: number,
    result: CardScanSlotCompleteResult
  ) => {
    const run = await persistGradeEstimatorHistoryRun({
      jobId: result.jobId,
      card: result.card,
      estimate: result.estimate,
      postGradingValue: result.postGradingValue ?? null,
    });

    setCompletedRuns((prev) => {
      const existing = prev[slotIndex];
      if (existing?.job_id === run.job_id) return prev;
      return { ...prev, [slotIndex]: run };
    });
  }, []);

  const visible      = slotStates.slice(0, activeSlots);
  const allDone      = visible.every((s) => s === "done");
  const anyAnalyzing = visible.some((s) => s === "analyzing");
  const doneCount    = visible.filter((s) => s === "done").length;
  const orderedCompletedRuns = useMemo(
    () =>
      Array.from({ length: activeSlots }, (_, index) => completedRuns[index]).filter(
        (run): run is GradeEstimatorHistoryRun => Boolean(run)
      ),
    [activeSlots, completedRuns]
  );

  /** Plan: local “results visible” gate — all slots done and history runs persisted per slot */
  const inlineResultsVisible = useMemo(
    () =>
      mode === "scan" &&
      wizardStep === 4 &&
      tierLoaded &&
      allDone &&
      orderedCompletedRuns.length === activeSlots,
    [activeSlots, allDone, mode, orderedCompletedRuns, tierLoaded, wizardStep]
  );

  const gridCls =
    activeSlots === 1
      ? "max-w-2xl mx-auto"
      : activeSlots === 2
        ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
        : "grid grid-cols-1 lg:grid-cols-3 gap-4";

  const wideScanLayout =
    wizardStep === 4 || (wizardStep === 2 && activeSlots > 1);

  // ── Combined notes for pre-fill ─────────────────────────────────────────────
  const buildNotes = useCallback((): string => {
    const flagText = quickFlags.length > 0
      ? `Flagged concerns: ${quickFlags.join(", ")}.${notes.trim() ? " " : ""}`
      : "";
    return (flagText + notes.trim()).trim();
  }, [quickFlags, notes]);

  const buildSlotInitialNotes = useCallback((): string => {
    const preface = buildDeclaredScanPrefaceFromTitle({
      cardTitle,
      gradingCompany,
    });
    const body = buildNotes();
    return preface + (body ? body : "");
  }, [cardTitle, gradingCompany, buildNotes]);

  const trimmedCardTitle = cardTitle.trim();
  const cardIdentityHeadline = trimmedCardTitle || "Card scan";
  const cardIdentitySubline = buildParsedCardDetailLine(trimmedCardTitle);

  useEffect(() => {
    if (mode !== "scan" || wizardStep !== 4 || !allDone) return;
    if (orderedCompletedRuns.length !== activeSlots) return;
    if (resultsSessionSavedRef.current) return;

    const session = saveGradeHubResultsSession({
      createdAt: new Date().toISOString(),
      activeSlots,
      cardTitle: trimmedCardTitle,
      gradingCompany,
      notes,
      quickFlags,
      jobIds: orderedCompletedRuns.map((run) => run.job_id),
      runIds: orderedCompletedRuns.map((run) => run.id),
    });

    resultsSessionSavedRef.current = true;
    setSavedResultsSession({
      id: session.id,
      jobsParam: session.jobIds.join(","),
      createdAt: session.createdAt,
    });
  }, [
    activeSlots,
    allDone,
    gradingCompany,
    mode,
    notes,
    orderedCompletedRuns,
    quickFlags,
    trimmedCardTitle,
    wizardStep,
  ]);

  // When user moves from step 3 → 4, advance wizard
  const handleStep3Continue = useCallback(() => {
    setWizardStep(4);
  }, []);

  // ── Derived slot step for progress indicator ────────────────────────────────
  // While in wizard steps 1-3, show step 1/2/3.
  // Step 4 = slot analysis (maps to "Run Analysis")
  const effectiveStep: WizardStep =
    wizardStep < 4
      ? wizardStep
      : anyAnalyzing
        ? 4
        : allDone
          ? 4
          : 4;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AuthenticatedLayout>
      <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>

        {/* ── Top nav ────────────────────────────────────────────────────── */}
        <nav style={{
          background: SURFACE,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "stretch",
          padding: "0 24px",
        }}>
          <div style={{ flex: 1, display: "flex", alignItems: "stretch" }}>
            <Link
              href={gradeHubBasePath}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                color: MUTED, textDecoration: "none",
                padding: "13px 20px 13px 0",
                borderBottom: "2px solid transparent",
              }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Grade Hub
            </Link>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: TEXT,
              padding: "13px 20px",
              borderBottom: `2px solid ${RED}`,
              marginBottom: -1,
            }}>
              <span>{mode === "mock" ? "Mock Submission" : "Scan Session"}</span>
              {wizardStep === 4 && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {visible.map((s, i) => <StatusDot key={i} state={s} />)}
                </div>
              )}
              {anyAnalyzing && (
                <span style={{ fontSize: 9, color: RED, fontWeight: 600 }}>Analyzing…</span>
              )}
              {allDone && activeSlots > 0 && wizardStep === 4 && (
                <span style={{ fontSize: 9, color: "#6ee7b7", fontWeight: 600 }}>
                  {doneCount === 1 ? "Complete" : `${doneCount}/${activeSlots} complete`}
                </span>
              )}
            </div>

            {/* Mode badge */}
            <div style={{
              display: "flex", alignItems: "center",
              marginLeft: 12,
              padding: "4px 10px",
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              alignSelf: "center",
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: RED }}>
                {mode === "mock" ? "MOCK" : "SCAN"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
            {/* Slot selector for business */}
            {wizardStep === 4 && maxSlots > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                <span style={{ fontSize: 9, color: MUTED, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" }}>Cards</span>
                {Array.from({ length: maxSlots }, (_, idx) => idx + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setActiveSlots(n)}
                    style={{
                      width: 26, height: 26, borderRadius: 3,
                      fontSize: 10, fontWeight: 700,
                      border: `1px solid ${activeSlots === n ? RED : BORDER}`,
                      background: activeSlots === n ? CARD_BG : "transparent",
                      color: activeSlots === n ? RED : MUTED,
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push(gradeHubBasePath)}
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                color: "#fff", background: RED,
                border: "none", borderRadius: 4,
                padding: "6px 16px", cursor: "pointer",
              }}
            >
              New Scan
            </button>
          </div>
        </nav>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: mode === "mock" ? 860 : wideScanLayout ? 1200 : 680, margin: "0 auto", padding: "40px 24px 64px" }}>

          {/* Page header */}
          <div style={{ marginBottom: mode === "mock" ? 24 : 32 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2.5px", color: RED, textTransform: "uppercase", marginBottom: 10 }}>
              Grade Probability Engine
            </p>
            <h1 className={playfair.className} style={{ fontSize: 24, color: TEXT, lineHeight: 1.25, marginBottom: mode === "mock" ? 0 : 20 }}>
              {mode === "mock"
                ? "Mock Submission"
                : wizardStep < 4
                  ? "New scan session."
                  : activeSlots === 1 ? "Analyze your card." : `Analyze ${activeSlots} cards.`}
            </h1>
          </div>

          {/* ── MOCK SUBMISSION FLOW ─────────────────────────────────────── */}
          {mode === "mock" && (
            <MockSubmissionFlow tier={tier} tierLoaded={tierLoaded} />
          )}

          {/* ── SCAN WIZARD ─────────────────────────────────────────────── */}
          {mode === "scan" && (
            <>
            {/* 4-step progress indicator */}
            <div style={{ marginBottom: 32 }}>
              <StepIndicator current={effectiveStep} />
            </div>

          {/* ── Step 1: Card Details ──────────────────────────────────────── */}
          {wizardStep === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{
                background: CARD_BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                overflow: "hidden",
              }}>
                <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase" }}>
                    Step 1 — Card Details
                  </p>
                </div>

                <div style={{ padding: "24px" }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase" }}>
                        Card Title
                      </label>
                      <MicButton
                        size="sm"
                        onResult={(text) => setCardTitle((prev) => appendSpeechTranscript(prev, text))}
                        className="h-7 w-7 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      />
                    </div>
                    <input
                      type="text"
                      value={cardTitle}
                      onChange={(e) => setCardTitle(e.target.value)}
                      placeholder="e.g. 2023 Prizm Victor Wembanyama Silver #136"
                      style={{
                        display: "block", width: "100%", boxSizing: "border-box",
                        padding: "10px 12px",
                        fontSize: 13, color: TEXT,
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 4,
                        outline: "none",
                      }}
                      onFocus={(e) => (e.target.style.borderColor = RED)}
                      onBlur={(e) => (e.target.style.borderColor = BORDER)}
                    />
                    <p style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                      Enter the full card name once. The engine will parse year, set, player, parallel, and card number from the title when possible.
                    </p>
                  </div>

                  {/* Grading company */}
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase", marginBottom: 10 }}>
                      Target Grading Company
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["PSA", "BGS", "SGC"] as GradingCompany[]).map((co) => (
                        <button
                          key={co}
                          type="button"
                          onClick={() => setGradingCompany(co)}
                          style={{
                            padding: "8px 20px",
                            fontSize: 11, fontWeight: 700, letterSpacing: "1px",
                            textTransform: "uppercase",
                            color: gradingCompany === co ? BG : MUTED,
                            background: gradingCompany === co ? RED : "transparent",
                            border: `1px solid ${gradingCompany === co ? RED : BORDER}`,
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          {co}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Next button */}
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    style={{
                      display: "block", width: "100%",
                      padding: "12px",
                      fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
                      color: "#fff", background: RED,
                      border: "none", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    Continue to Card Upload →
                  </button>
                </div>
              </div>

              {/* Tips */}
              <div style={{ marginTop: 24, padding: "16px 20px", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 4 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase", marginBottom: 12 }}>
                  Tips for best results
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { n: "01", tip: "Use flat, even lighting — avoid glare, shadows, or direct flash." },
                    { n: "02", tip: "Always include both front and back for the most accurate analysis." },
                    { n: "03", tip: "Add close-ups of corners, edges, and surface to boost confidence." },
                    { n: "04", tip: "Fill the frame and keep the card sharp — blur reduces accuracy." },
                  ].map(({ n, tip }) => (
                    <div key={n} style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: RED, flexShrink: 0, paddingTop: 1 }}>{n}</span>
                      <p style={{ fontSize: 11, lineHeight: 1.5, color: MUTED, margin: 0 }}>{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Steps 2–4: upload + analysis (slots stay mounted through step 3 so uploads persist) ─ */}
          {wizardStep >= 2 && wizardStep <= 4 && (
            <div style={{ display: wizardStep === 3 ? "none" : "block" }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  background: wizardStep === 2 ? CARD_BG : "transparent",
                  border: wizardStep === 2 ? `1px solid ${BORDER}` : "none",
                  borderRadius: wizardStep === 2 ? 4 : 0,
                  overflow: "hidden",
                  marginBottom: wizardStep === 2 ? 16 : 0,
                }}
              >
                {wizardStep === 2 && (
                  <>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "20px 24px",
                      borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase" }}>
                        Step 2 — Card Upload
                      </p>
                      <p style={{ fontSize: 10, color: MUTED }}>Up to 10 images · front, back + close-ups</p>
                    </div>
                    <div style={{ padding: "24px 24px 0" }}>
                      {trimmedCardTitle && (
                        <div style={{
                          padding: "10px 14px", marginBottom: 20,
                          background: SURFACE,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 4,
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: RED, flexShrink: 0,
                          }} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {trimmedCardTitle}
                            </p>
                            {cardIdentitySubline && (
                              <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                                {cardIdentitySubline}
                              </p>
                            )}
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: "1px",
                            color: RED, background: CARD_BG,
                            border: `1px solid ${BORDER}`,
                            borderRadius: 3, padding: "3px 8px",
                            textTransform: "uppercase", marginLeft: "auto",
                          }}>
                            {gradingCompany}
                          </span>
                        </div>
                      )}
                      <p style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>
                        Add photos or scans below. You can tag close-ups (corners, edges, surface) before identification runs. Analysis starts in the final step after notes.
                      </p>
                    </div>
                  </>
                )}

                {wizardStep === 4 && (
                  <div style={{
                    padding: "14px 20px", marginBottom: 20,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <p style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>
                        {cardIdentityHeadline}
                      </p>
                      {cardIdentitySubline && (
                        <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                          {cardIdentitySubline}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                        color: RED, background: CARD_BG,
                        border: `1px solid ${BORDER}`, borderRadius: 3, padding: "3px 8px",
                      }}>
                        {gradingCompany}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                        color: RED,
                        background: CARD_BG,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 3, padding: "3px 8px",
                      }}>
                        SCAN
                      </span>
                      {(notes.trim() || quickFlags.length > 0) && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                          color: MUTED, background: CARD_BG,
                          border: `1px solid ${BORDER}`, borderRadius: 3, padding: "3px 8px",
                        }}>
                          Notes added
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      style={{
                        fontSize: 10, color: MUTED, background: "none",
                        border: "none", cursor: "pointer", textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      Edit
                    </button>
                  </div>
                )}

                {!tierLoaded ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        border: `2px solid ${RED}`, borderTopColor: "transparent",
                        margin: "0 auto 12px", animation: "spin 0.8s linear infinite",
                      }} />
                      <p style={{ fontSize: 12, color: MUTED }}>Initializing session…</p>
                    </div>
                  </div>
                ) : (
                  <motion.div
                    layout
                    className={gridCls}
                    style={{ padding: wizardStep === 2 ? "0 24px 24px" : 0 }}
                  >
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
                            onComplete={(result) => {
                              void handleSlotComplete(i, result);
                            }}
                            initialNotes={buildSlotInitialNotes()}
                            deferAnalysis={wizardStep < 4}
                            hidePreScanNotesEditor
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.div>
            </div>
          )}

          {/* ── Step 4: full results in scan theme (no redirect) ─ */}
          {inlineResultsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                style={{ marginTop: 28 }}
              >
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "2.5px",
                    color: RED,
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Scan results
                </p>
                <h2
                  className={playfair.className}
                  style={{ fontSize: 22, color: TEXT, lineHeight: 1.25, marginBottom: 8 }}
                >
                  Grade probability &amp; value
                </h2>
                <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.55, marginBottom: 20, maxWidth: 560 }}>
                  Full grade probability output and grading value guidance for this session — same data as the
                  standalone results page, without leaving your scan.
                </p>

                <div
                  style={{
                    background: CARD_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    padding: "20px 24px",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "1.5px",
                        color: MUTED,
                        textTransform: "uppercase",
                        margin: 0,
                      }}
                    >
                      Session summary
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: TEXT,
                          background: SURFACE,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 3,
                          padding: "4px 10px",
                        }}
                      >
                        {activeSlots} card{activeSlots === 1 ? "" : "s"}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: TEXT,
                          background: SURFACE,
                          border: `1px solid ${BORDER}`,
                          borderRadius: 3,
                          padding: "4px 10px",
                        }}
                      >
                        Target grader: {gradingCompany}
                      </span>
                      {(savedResultsSession?.createdAt || orderedCompletedRuns[0]?.created_at) ? (
                        <span style={{ fontSize: 10, color: MUTED }}>
                          {formatSessionDate(
                            savedResultsSession?.createdAt ?? orderedCompletedRuns[0]!.created_at
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {trimmedCardTitle ? (
                    <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: "0 0 8px" }}>
                      {trimmedCardTitle}
                    </p>
                  ) : null}
                  {notes.trim() ? (
                    <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: 0 }}>
                      {notes.trim()}
                    </p>
                  ) : null}
                  {quickFlags.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {quickFlags.map((flag) => (
                        <span
                          key={flag}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#92400e",
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderRadius: 3,
                            padding: "4px 10px",
                          }}
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {orderedCompletedRuns.length > 1 ? (
                  <section
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                      gap: 12,
                      marginBottom: 24,
                    }}
                  >
                    {orderedCompletedRuns.map((run, index) => {
                      const imageUrl =
                        run.card.imageUrl ||
                        run.card.imageUrls?.[0] ||
                        run.card.scanPhotos?.[0]?.url ||
                        "";
                      const confidence = run.estimate.grade_probabilities?.confidence ?? null;
                      const confidenceClass = confidence
                        ? (SCAN_CONFIDENCE_CLASS[confidence] ?? SCAN_CONFIDENCE_CLASS.medium)
                        : null;
                      return (
                        <a
                          key={run.id}
                          href={`#scan-result-${index + 1}`}
                          style={{
                            display: "flex",
                            gap: 14,
                            padding: 14,
                            background: CARD_BG,
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={run.card.player_name || `Result ${index + 1}`}
                              width={64}
                              height={96}
                              unoptimized
                              style={{
                                height: 96,
                                width: 64,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: `1px solid ${BORDER}`,
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                height: 96,
                                width: 64,
                                borderRadius: 4,
                                border: `1px solid ${BORDER}`,
                                background: SURFACE,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "1.2px",
                                color: MUTED,
                                textTransform: "uppercase",
                                margin: 0,
                              }}
                            >
                              Result {index + 1}
                            </p>
                            <p
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: TEXT,
                                margin: "6px 0 0",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {run.card.player_name || trimmedCardTitle || "Card"}
                            </p>
                            {buildCardMeta(run) ? (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: MUTED,
                                  margin: "4px 0 0",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {buildCardMeta(run)}
                              </p>
                            ) : null}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: TEXT,
                                  background: SURFACE,
                                  border: `1px solid ${BORDER}`,
                                  borderRadius: 3,
                                  padding: "3px 8px",
                                }}
                              >
                                {formatEstimateRange(run)}
                              </span>
                              {confidence && confidenceClass ? (
                                <span className={confidenceClass}>{confidence}</span>
                              ) : null}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </section>
                ) : null}

                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                  {orderedCompletedRuns.map((run, index) => {
                    const galleryUrls =
                      run.card.imageUrls && run.card.imageUrls.length > 0
                        ? run.card.imageUrls
                        : run.card.scanPhotos?.map((photo) => photo.url) ?? [];
                    const imageUrl =
                      run.card.imageUrl || galleryUrls[0] || run.card.scanPhotos?.[0]?.url || "";
                    const confidence = run.estimate.grade_probabilities?.confidence ?? null;
                    const confidenceClass = confidence
                      ? (SCAN_CONFIDENCE_CLASS[confidence] ?? SCAN_CONFIDENCE_CLASS.medium)
                      : null;

                    return (
                      <section key={run.id} id={`scan-result-${index + 1}`} style={{ scrollMarginTop: 96 }}>
                        <div
                          style={{
                            background: CARD_BG,
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            padding: "20px 24px",
                            marginBottom: 12,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 20,
                              alignItems: "flex-start",
                            }}
                          >
                            {imageUrl ? (
                              <div style={{ flexShrink: 0 }}>
                                <Image
                                  src={imageUrl}
                                  alt={run.card.player_name || `Result ${index + 1}`}
                                  width={128}
                                  height={176}
                                  unoptimized
                                  style={{
                                    height: 176,
                                    width: 128,
                                    objectFit: "cover",
                                    borderRadius: 8,
                                    border: `1px solid ${BORDER}`,
                                  }}
                                />
                                {galleryUrls.length > 1 ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                                    {galleryUrls.slice(1, 5).map((url, imageIndex) => (
                                      <Image
                                        key={`${url}-${imageIndex}`}
                                        src={url}
                                        alt={`${run.card.player_name || "Card"} ${imageIndex + 2}`}
                                        width={40}
                                        height={56}
                                        unoptimized
                                        style={{
                                          height: 56,
                                          width: 40,
                                          objectFit: "cover",
                                          borderRadius: 4,
                                          border: `1px solid ${BORDER}`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  alignItems: "flex-start",
                                }}
                              >
                                <div>
                                  <p
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      letterSpacing: "1.2px",
                                      color: MUTED,
                                      textTransform: "uppercase",
                                      margin: 0,
                                    }}
                                  >
                                    Result {index + 1}
                                  </p>
                                  <p
                                    className={playfair.className}
                                    style={{
                                      fontSize: 22,
                                      fontWeight: 600,
                                      color: TEXT,
                                      margin: "8px 0 0",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {run.card.player_name || trimmedCardTitle || "Card"}
                                  </p>
                                  {buildCardMeta(run) ? (
                                    <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0" }}>
                                      {buildCardMeta(run)}
                                    </p>
                                  ) : null}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: TEXT,
                                      background: SURFACE,
                                      border: `1px solid ${BORDER}`,
                                      borderRadius: 3,
                                      padding: "5px 10px",
                                    }}
                                  >
                                    {formatEstimateRange(run)}
                                  </span>
                                  {confidence && confidenceClass ? (
                                    <span className={confidenceClass}>{confidence}</span>
                                  ) : null}
                                  <span style={{ fontSize: 11, color: MUTED }}>
                                    Saved {formatSessionDate(run.created_at)}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                                {run.card.year ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: TEXT,
                                      border: `1px solid ${BORDER}`,
                                      borderRadius: 3,
                                      padding: "4px 10px",
                                    }}
                                  >
                                    Year {run.card.year}
                                  </span>
                                ) : null}
                                {run.card.set_name ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: TEXT,
                                      border: `1px solid ${BORDER}`,
                                      borderRadius: 3,
                                      padding: "4px 10px",
                                    }}
                                  >
                                    {run.card.set_name}
                                  </span>
                                ) : null}
                                {run.card.parallel_type ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: TEXT,
                                      border: `1px solid ${BORDER}`,
                                      borderRadius: 3,
                                      padding: "4px 10px",
                                    }}
                                  >
                                    {run.card.parallel_type}
                                  </span>
                                ) : null}
                                {run.card.card_number ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: TEXT,
                                      border: `1px solid ${BORDER}`,
                                      borderRadius: 3,
                                      padding: "4px 10px",
                                    }}
                                  >
                                    #{run.card.card_number}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        <GradeProbabilityPanel
                          estimate={run.estimate}
                          cardIdentity={{
                            owner_declared_title: trimmedCardTitle || undefined,
                            player_name: run.card.player_name,
                            year: run.card.year,
                            set_name: run.card.set_name,
                            parallel_type: run.card.parallel_type,
                            variation: run.card.variation,
                            insert: run.card.insert,
                            card_number: run.card.card_number,
                          }}
                          primaryImageUrl={run.card.imageUrl}
                          imageUrls={run.card.imageUrls}
                          scanPhotos={run.card.scanPhotos}
                          headerLabel="Grade Probability Results"
                        />

                        {run.post_grading_value ? (
                          <GradeEstimatorValuePanel result={run.post_grading_value} />
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </motion.div>
            )}

          {wizardStep === 2 && (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                style={{
                  flex: "0 0 auto",
                  padding: "12px 20px",
                  fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  color: MUTED, background: "none",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                style={{
                  flex: 1,
                  padding: "12px",
                  fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
                  color: "#fff", background: RED,
                  border: "none", borderRadius: 4, cursor: "pointer",
                }}
              >
                Continue to Notes →
              </button>
            </div>
          )}

          {/* ── Step 3: Notes & Context ──────────────────────────────────── */}
          {wizardStep === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{
                background: CARD_BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 16,
              }}>
                <div style={{ padding: "20px 24px", borderBottom: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase" }}>
                    Step 3 — Notes &amp; Context
                  </p>
                </div>

                <div style={{ padding: "24px" }}>
                  {/* Notes textarea */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase" }}>
                        Notes for the Model
                        <span style={{ fontWeight: 400, color: MUTED, marginLeft: 8 }}>(optional)</span>
                      </label>
                      <MicButton
                        size="sm"
                        onResult={(text) => setNotes((prev) => appendSpeechTranscript(prev, text, "newline"))}
                        className="h-7 w-7 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      />
                    </div>
                    <textarea
                      rows={4}
                      maxLength={400}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Possible surface scratch near the top edge, centering looks slightly left heavy…"
                      style={{
                        display: "block", width: "100%", boxSizing: "border-box",
                        padding: "10px 12px",
                        fontSize: 13, color: TEXT, lineHeight: 1.5,
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 4,
                        outline: "none",
                        resize: "vertical",
                        minHeight: 96,
                      }}
                      onFocus={(e) => (e.target.style.borderColor = RED)}
                      onBlur={(e) => (e.target.style.borderColor = BORDER)}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: notes.length > 360 ? "#ef4444" : MUTED }}>
                        {notes.length}/400
                      </span>
                    </div>
                  </div>

                  {/* Quick-flag checkboxes */}
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase", marginBottom: 10 }}>
                      Quick Flags
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {QUICK_FLAGS.map((flag) => {
                        const checked = quickFlags.includes(flag);
                        return (
                          <label
                            key={flag}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px",
                              background: checked ? "rgba(185,28,28,0.08)" : SURFACE,
                              border: `1px solid ${checked ? RED : BORDER}`,
                              borderRadius: 4,
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <div style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              border: `1px solid ${checked ? RED : MUTED}`,
                              background: checked ? RED : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {checked && (
                                <svg width="8" height="8" fill="none" stroke={BG} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setQuickFlags((prev) =>
                                  checked ? prev.filter((f) => f !== flag) : [...prev, flag]
                                )
                              }
                              style={{ display: "none" }}
                            />
                            <span style={{ fontSize: 12, color: checked ? TEXT : MUTED }}>{flag}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  style={{
                    flex: "0 0 auto",
                    padding: "12px 20px",
                    fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                    color: MUTED, background: "none",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4, cursor: "pointer",
                  }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleStep3Continue}
                  style={{
                    flex: 1,
                    padding: "12px",
                    fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase",
                    color: "#fff", background: RED,
                    border: "none", borderRadius: 4, cursor: "pointer",
                  }}
                >
                  Continue to Analysis →
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: post-session actions (upload + analysis UI lives in shared block above) ─ */}
          {wizardStep === 4 && tierLoaded && allDone && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 12,
                marginTop: 24,
              }}
            >
              <Link
                href={gradeHubBasePath}
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  borderRadius: 4,
                  border: `1px solid ${BORDER}`,
                  color: MUTED, background: SURFACE,
                  padding: "10px 20px", textDecoration: "none",
                }}
              >
                Back to Hub
              </Link>
              {savedResultsSession ? (
                <Link
                  href={`${gradeHubBasePath}/results?session=${encodeURIComponent(
                    savedResultsSession.id
                  )}&jobs=${encodeURIComponent(savedResultsSession.jobsParam)}`}
                  style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    color: TEXT,
                    background: BG,
                    padding: "10px 20px",
                    textDecoration: "none",
                  }}
                >
                  Open standalone results
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => router.push(gradeHubBasePath)}
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  borderRadius: 4, border: "none",
                  color: "#fff", background: RED,
                  padding: "10px 20px", cursor: "pointer",
                }}
              >
                New Session
              </button>
            </motion.div>
          )}

          {/* Close scan wizard fragment */}
          </>
          )}

        </div>
      </div>

      {/* CSS animations */}
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </AuthenticatedLayout>
  );
}

// ── Suspense wrapper ──────────────────────────────────────────────────────────
export default function GradeHubScanPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: "100vh", background: BG,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "2px solid #B91C1C", borderTopColor: "transparent",
              margin: "0 auto 12px", animation: "spin 0.8s linear infinite",
            }} />
            <p style={{ fontSize: 12, color: "#888888" }}>Loading…</p>
          </div>
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}
