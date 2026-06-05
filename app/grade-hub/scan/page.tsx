"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
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

// Two-tier model: only business_pro gets multi-slot sessions.
// Legacy values stay mapped for safety against unmigrated rows.
const TIER_MAX_SLOTS: Record<string, number> = {
  free: 1,
  pro: 1,
  business: 1,
  business_pro: 10,
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

const SCAN_CONFIDENCE_CLASS: Record<string, string> = {
  high: "rounded-full border border-[#20B26B]/40 bg-[#20B26B]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#20B26B]",
  medium:
    "rounded-full border border-[#C9A227]/40 bg-[#C9A227]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C9A227]",
  low: "rounded-full border border-[#dc2626]/40 bg-[#dc2626]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#dc2626]",
};

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Card Details",
  2: "Card Upload",
  3: "Notes & Context",
  4: "Run Analysis",
};

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center">
      {([1, 2, 3, 4] as WizardStep[]).map((step, i) => {
        const done    = current > step;
        const active  = current === step;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-[#20B26B] bg-[#20B26B]"
                    : active
                      ? "border-[#E6E8EB] bg-[#13171B]"
                      : "border-[#24282D] bg-transparent"
                }`}
              >
                {done ? (
                  <svg width="10" height="10" fill="none" stroke="#07100B" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={`font-mono text-[10px] font-semibold ${active ? "text-[#E6E8EB]" : "text-[#77808C]"}`}>
                    {step}
                  </span>
                )}
              </div>
              <span
                className={`whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] ${
                  active ? "text-[#E6E8EB]" : done ? "text-[#B8C0CC]" : "text-[#77808C]"
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>

            {i < 3 && (
              <div
                className={`mx-1 mb-5 h-px w-12 shrink-0 ${done ? "bg-[#20B26B]" : "bg-[#24282D]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ state }: { state: SlotState }) {
  if (state === "done")      return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#20B26B", display: "inline-block", boxShadow: "0 0 6px rgba(32,178,107,0.7)" }} />;
  if (state === "analyzing") return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8e96a3", display: "inline-block", boxShadow: "0 0 6px rgba(142,150,163,0.7)", animation: "pulse 1s ease-in-out infinite" }} />;
  if (state === "error")     return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />;
  if (state === "ready")     return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C9A227", display: "inline-block" }} />;
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#343941", display: "inline-block" }} />;
}

function ScanPageInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { authUser, loading: authLoading } = useAuth();

  const [tier,       setTier]       = useState<string>("free");
  const [tierLoaded, setTierLoaded] = useState(false);

  const gradeHubBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";

  const rawMode          = searchParams.get("mode");
  const [mode]           = useState<ScanMode>(rawMode === "mock" ? "mock" : "scan");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  const [cardTitle,      setCardTitle]      = useState("");
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>("PSA");

  const [notes,      setNotes]      = useState("");
  const [quickFlags, setQuickFlags] = useState<string[]>([]);

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

  const handleStep3Continue = useCallback(() => {
    setWizardStep(4);
  }, []);

  const effectiveStep: WizardStep =
    wizardStep < 4
      ? wizardStep
      : anyAnalyzing
        ? 4
        : allDone
          ? 4
          : 4;

  return (
    <>
      <div className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href={gradeHubBasePath}
              className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C] hover:text-[#B8C0CC]"
            >
              ← Grading
            </Link>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                {mode === "mock" ? "Mock Submission" : "Scan Session"}
              </div>
              <h1 className="mt-0.5 flex items-center gap-3 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
                {mode === "mock"
                  ? "Mock Submission"
                  : wizardStep < 4
                    ? "New Scan Session"
                    : activeSlots === 1 ? "Analyze Card" : `Analyze ${activeSlots} Cards`}
                {wizardStep === 4 && (
                  <span className="flex items-center gap-1">
                    {visible.map((s, i) => <StatusDot key={i} state={s} />)}
                  </span>
                )}
                {anyAnalyzing && (
                  <span className="text-[10px] font-medium text-[#8e96a3]">Analyzing…</span>
                )}
                {allDone && activeSlots > 0 && wizardStep === 4 && (
                  <span className="text-[10px] font-medium text-[#20B26B]">
                    {doneCount === 1 ? "Complete" : `${doneCount}/${activeSlots} complete`}
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {wizardStep === 4 && maxSlots > 1 && (
              <div className="mr-2 flex items-center gap-1">
                <span className="mr-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">Cards</span>
                {Array.from({ length: maxSlots }, (_, idx) => idx + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setActiveSlots(n)}
                    className={`h-7 w-7 border text-[10px] font-semibold transition-colors ${
                      activeSlots === n
                        ? "border-[#5A626E] bg-[#13171B] text-[#E6E8EB]"
                        : "border-[#24282D] text-[#77808C] hover:border-[#343941] hover:text-[#B8C0CC]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push(gradeHubBasePath)}
              className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C]"
            >
              + New Scan
            </button>
          </div>
        </header>

        {/* Body */}
        <div
          className="mx-auto px-6 pb-16 pt-10"
          style={{ maxWidth: mode === "mock" ? 860 : wideScanLayout ? 1200 : 680 }}
        >

          {mode === "mock" && (
            <MockSubmissionFlow tier={tier} tierLoaded={tierLoaded} />
          )}

          {mode === "scan" && (
            <>
            <div className="mb-8">
              <StepIndicator current={effectiveStep} />
            </div>

          {/* Step 1: Card Details */}
          {wizardStep === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="overflow-hidden border border-[#24282D] bg-[#0F1317]">
                <div className="border-b border-[#24282D] px-6 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                    Step 1 — Card Details
                  </p>
                </div>

                <div className="p-6">
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#B8C0CC]">
                        Card Title
                      </label>
                      <MicButton
                        size="sm"
                        onResult={(text) => setCardTitle((prev) => appendSpeechTranscript(prev, text))}
                        className="h-7 w-7 rounded border border-[#24282D] bg-[#13171B] text-[#77808C] hover:border-[#343941] hover:text-[#B8C0CC]"
                      />
                    </div>
                    <input
                      type="text"
                      value={cardTitle}
                      onChange={(e) => setCardTitle(e.target.value)}
                      placeholder="e.g. 2023 Prizm Victor Wembanyama Silver #136"
                      className="block w-full rounded border border-[#24282D] bg-[#0B0D0F] px-3 py-2.5 text-[13px] text-[#E6E8EB] outline-none transition-colors placeholder:text-[#5A626E] focus:border-[#5A626E]"
                    />
                    <p className="mt-2 text-[11px] leading-relaxed text-[#77808C]">
                      Enter the full card name once. The engine will parse year, set, player, parallel, and card number from the title when possible.
                    </p>
                  </div>

                  <div className="mb-7">
                    <label className="mb-2.5 block text-[9px] font-semibold uppercase tracking-[0.16em] text-[#B8C0CC]">
                      Target Grading Company
                    </label>
                    <div className="flex gap-2">
                      {(["PSA", "BGS", "SGC"] as GradingCompany[]).map((co) => (
                        <button
                          key={co}
                          type="button"
                          onClick={() => setGradingCompany(co)}
                          className={`rounded border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                            gradingCompany === co
                              ? "border-[#5A626E] bg-[#13171B] text-[#E6E8EB]"
                              : "border-[#24282D] bg-transparent text-[#77808C] hover:border-[#343941] hover:text-[#B8C0CC]"
                          }`}
                        >
                          {co}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="block w-full rounded border border-[#20B26B] bg-[#20B26B] py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#07100B] transition-colors hover:bg-[#33C47C]"
                  >
                    Continue to Card Upload →
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded border border-[#24282D] bg-[#0B0D0F] px-5 py-4">
                <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                  Tips for best results
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { n: "01", tip: "Use flat, even lighting — avoid glare, shadows, or direct flash." },
                    { n: "02", tip: "Always include both front and back for the most accurate analysis." },
                    { n: "03", tip: "Add close-ups of corners, edges, and surface to boost confidence." },
                    { n: "04", tip: "Fill the frame and keep the card sharp — blur reduces accuracy." },
                  ].map(({ n, tip }) => (
                    <div key={n} className="flex gap-2.5">
                      <span className="shrink-0 pt-0.5 font-mono text-[10px] font-semibold text-[#B8C0CC]">{n}</span>
                      <p className="m-0 text-[11px] leading-relaxed text-[#77808C]">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Steps 2-4: upload + analysis */}
          {wizardStep >= 2 && wizardStep <= 4 && (
            <div style={{ display: wizardStep === 3 ? "none" : "block" }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`overflow-hidden ${
                  wizardStep === 2 ? "mb-4 rounded border border-[#24282D] bg-[#0F1317]" : ""
                }`}
              >
                {wizardStep === 2 && (
                  <>
                    <div className="flex items-center justify-between border-b border-[#24282D] px-6 py-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                        Step 2 — Card Upload
                      </p>
                      <p className="text-[10px] text-[#77808C]">Up to 10 images · front, back + close-ups</p>
                    </div>
                    <div className="px-6 pt-6">
                      {trimmedCardTitle && (
                        <div className="mb-5 flex items-center gap-3 rounded border border-[#24282D] bg-[#0B0D0F] px-3.5 py-2.5">
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#20B26B]" />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] text-[#E6E8EB]">
                              {trimmedCardTitle}
                            </p>
                            {cardIdentitySubline && (
                              <p className="mt-0.5 text-[10px] text-[#77808C]">
                                {cardIdentitySubline}
                              </p>
                            )}
                          </div>
                          <span className="ml-auto rounded border border-[#24282D] bg-[#13171B] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC]">
                            {gradingCompany}
                          </span>
                        </div>
                      )}
                      <p className="mb-4 text-[12px] leading-relaxed text-[#77808C]">
                        Add photos or scans below. You can tag close-ups (corners, edges, surface) before identification runs. Analysis starts in the final step after notes.
                      </p>
                    </div>
                  </>
                )}

                {wizardStep === 4 && (
                  <div className="mb-5 flex flex-wrap items-center gap-4 rounded border border-[#24282D] bg-[#0B0D0F] px-5 py-3.5">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-[12px] font-semibold text-[#E6E8EB]">
                        {cardIdentityHeadline}
                      </p>
                      {cardIdentitySubline && (
                        <p className="mt-0.5 text-[10px] text-[#77808C]">
                          {cardIdentitySubline}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[#24282D] bg-[#13171B] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC]">
                        {gradingCompany}
                      </span>
                      <span className="rounded border border-[#24282D] bg-[#13171B] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC]">
                        SCAN
                      </span>
                      {(notes.trim() || quickFlags.length > 0) && (
                        <span className="rounded border border-[#24282D] bg-[#13171B] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                          Notes added
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="cursor-pointer text-[10px] text-[#77808C] underline underline-offset-2 hover:text-[#B8C0CC]"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {!tierLoaded ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div
                        className="mx-auto mb-3 h-6 w-6 rounded-full border-2 border-[#5A626E] border-t-transparent"
                        style={{ animation: "spin 0.8s linear infinite" }}
                      />
                      <p className="text-[12px] text-[#77808C]">Initializing session…</p>
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

          {/* Step 4 results */}
          {inlineResultsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-7"
              >
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#77808C]">
                  Scan results
                </p>
                <h2 className="mb-2 text-[22px] font-semibold leading-tight text-[#E6E8EB]">
                  Grade probability &amp; value
                </h2>
                <p className="mb-5 max-w-[560px] text-[12px] leading-relaxed text-[#77808C]">
                  Full grade probability output and grading value guidance for this session — same data as the
                  standalone results page, without leaving your scan.
                </p>

                <div className="mb-5 rounded border border-[#24282D] bg-[#0F1317] px-6 py-5">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                      Session summary
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[#24282D] bg-[#0B0D0F] px-2.5 py-1 text-[10px] font-semibold text-[#E6E8EB]">
                        {activeSlots} card{activeSlots === 1 ? "" : "s"}
                      </span>
                      <span className="rounded border border-[#24282D] bg-[#0B0D0F] px-2.5 py-1 text-[10px] font-semibold text-[#E6E8EB]">
                        Target grader: {gradingCompany}
                      </span>
                      {(savedResultsSession?.createdAt || orderedCompletedRuns[0]?.created_at) ? (
                        <span className="text-[10px] text-[#77808C]">
                          {formatSessionDate(
                            savedResultsSession?.createdAt ?? orderedCompletedRuns[0]!.created_at
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {trimmedCardTitle ? (
                    <p className="mb-2 text-[14px] font-semibold text-[#E6E8EB]">
                      {trimmedCardTitle}
                    </p>
                  ) : null}
                  {notes.trim() ? (
                    <p className="m-0 text-[12px] leading-relaxed text-[#77808C]">
                      {notes.trim()}
                    </p>
                  ) : null}
                  {quickFlags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickFlags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded border border-[#C9A227]/40 bg-[#C9A227]/10 px-2.5 py-1 text-[10px] font-semibold text-[#C9A227]"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {orderedCompletedRuns.length > 1 ? (
                  <section
                    className="mb-6 grid gap-3"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
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
                          className="flex gap-3.5 rounded border border-[#24282D] bg-[#0F1317] p-3.5 text-[#E6E8EB] no-underline transition-colors hover:border-[#343941]"
                        >
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={run.card.player_name || `Result ${index + 1}`}
                              width={64}
                              height={96}
                              unoptimized
                              className="h-24 w-16 shrink-0 rounded border border-[#24282D] object-cover"
                            />
                          ) : (
                            <div className="h-24 w-16 shrink-0 rounded border border-[#24282D] bg-[#0B0D0F]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#77808C]">
                              Result {index + 1}
                            </p>
                            <p className="mt-1.5 truncate text-[14px] font-semibold text-[#E6E8EB]">
                              {run.card.player_name || trimmedCardTitle || "Card"}
                            </p>
                            {buildCardMeta(run) ? (
                              <p className="mt-1 truncate text-[11px] text-[#77808C]">
                                {buildCardMeta(run)}
                              </p>
                            ) : null}
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              <span className="rounded border border-[#24282D] bg-[#0B0D0F] px-2 py-0.5 text-[10px] font-semibold text-[#E6E8EB]">
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

                <div className="flex flex-col gap-7">
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
                      <section key={run.id} id={`scan-result-${index + 1}`} className="scroll-mt-24">
                        <div className="mb-3 rounded border border-[#24282D] bg-[#0F1317] px-6 py-5">
                          <div className="flex flex-row flex-wrap items-start gap-5">
                            {imageUrl ? (
                              <div className="shrink-0">
                                <Image
                                  src={imageUrl}
                                  alt={run.card.player_name || `Result ${index + 1}`}
                                  width={128}
                                  height={176}
                                  unoptimized
                                  className="h-44 w-32 rounded-lg border border-[#24282D] object-cover"
                                />
                                {galleryUrls.length > 1 ? (
                                  <div className="mt-2.5 flex flex-wrap gap-2">
                                    {galleryUrls.slice(1, 5).map((url, imageIndex) => (
                                      <Image
                                        key={`${url}-${imageIndex}`}
                                        src={url}
                                        alt={`${run.card.player_name || "Card"} ${imageIndex + 2}`}
                                        width={40}
                                        height={56}
                                        unoptimized
                                        className="h-14 w-10 rounded border border-[#24282D] object-cover"
                                      />
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#77808C]">
                                    Result {index + 1}
                                  </p>
                                  <p className="mt-2 text-[22px] font-semibold leading-tight text-[#E6E8EB]">
                                    {run.card.player_name || trimmedCardTitle || "Card"}
                                  </p>
                                  {buildCardMeta(run) ? (
                                    <p className="mt-2 text-[12px] text-[#77808C]">
                                      {buildCardMeta(run)}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded border border-[#24282D] bg-[#0B0D0F] px-2.5 py-1 text-[10px] font-semibold text-[#E6E8EB]">
                                    {formatEstimateRange(run)}
                                  </span>
                                  {confidence && confidenceClass ? (
                                    <span className={confidenceClass}>{confidence}</span>
                                  ) : null}
                                  <span className="text-[11px] text-[#77808C]">
                                    Saved {formatSessionDate(run.created_at)}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3.5 flex flex-wrap gap-2">
                                {run.card.year ? (
                                  <span className="rounded border border-[#24282D] px-2.5 py-1 text-[10px] text-[#B8C0CC]">
                                    Year {run.card.year}
                                  </span>
                                ) : null}
                                {run.card.set_name ? (
                                  <span className="rounded border border-[#24282D] px-2.5 py-1 text-[10px] text-[#B8C0CC]">
                                    {run.card.set_name}
                                  </span>
                                ) : null}
                                {run.card.parallel_type ? (
                                  <span className="rounded border border-[#24282D] px-2.5 py-1 text-[10px] text-[#B8C0CC]">
                                    {run.card.parallel_type}
                                  </span>
                                ) : null}
                                {run.card.card_number ? (
                                  <span className="rounded border border-[#24282D] px-2.5 py-1 text-[10px] text-[#B8C0CC]">
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
                          postGradingValue={run.post_grading_value}
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
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                className="shrink-0 rounded border border-[#24282D] bg-transparent px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77808C] transition-colors hover:border-[#343941] hover:text-[#B8C0CC]"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                className="flex-1 rounded border border-[#20B26B] bg-[#20B26B] py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#07100B] transition-colors hover:bg-[#33C47C]"
              >
                Continue to Notes →
              </button>
            </div>
          )}

          {/* Step 3 */}
          {wizardStep === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-4 overflow-hidden rounded border border-[#24282D] bg-[#0F1317]">
                <div className="border-b border-[#24282D] px-6 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                    Step 3 — Notes &amp; Context
                  </p>
                </div>

                <div className="p-6">
                  <div className="mb-5">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <label className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-[#B8C0CC]">
                        Notes for the Model
                        <span className="ml-2 font-normal text-[#77808C]">(optional)</span>
                      </label>
                      <MicButton
                        size="sm"
                        onResult={(text) => setNotes((prev) => appendSpeechTranscript(prev, text, "newline"))}
                        className="h-7 w-7 rounded border border-[#24282D] bg-[#13171B] text-[#77808C] hover:border-[#343941] hover:text-[#B8C0CC]"
                      />
                    </div>
                    <textarea
                      rows={4}
                      maxLength={400}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Possible surface scratch near the top edge, centering looks slightly left heavy…"
                      className="block min-h-[96px] w-full resize-y rounded border border-[#24282D] bg-[#0B0D0F] px-3 py-2.5 text-[13px] leading-relaxed text-[#E6E8EB] outline-none transition-colors placeholder:text-[#5A626E] focus:border-[#5A626E]"
                    />
                    <div className="mt-1 flex justify-end">
                      <span className={`text-[10px] ${notes.length > 360 ? "text-[#dc2626]" : "text-[#77808C]"}`}>
                        {notes.length}/400
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#B8C0CC]">
                      Quick Flags
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_FLAGS.map((flag) => {
                        const checked = quickFlags.includes(flag);
                        return (
                          <label
                            key={flag}
                            className={`flex cursor-pointer select-none items-center gap-2.5 rounded border px-3.5 py-2.5 transition-colors ${
                              checked
                                ? "border-[#5A626E] bg-[#13171B]"
                                : "border-[#24282D] bg-[#0B0D0F] hover:border-[#343941]"
                            }`}
                          >
                            <div
                              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                                checked ? "border-[#20B26B] bg-[#20B26B]" : "border-[#5A626E] bg-transparent"
                              }`}
                            >
                              {checked && (
                                <svg width="8" height="8" fill="none" stroke="#07100B" viewBox="0 0 24 24">
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
                              className="hidden"
                            />
                            <span className={`text-[12px] ${checked ? "text-[#E6E8EB]" : "text-[#B8C0CC]"}`}>{flag}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="shrink-0 rounded border border-[#24282D] bg-transparent px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#77808C] transition-colors hover:border-[#343941] hover:text-[#B8C0CC]"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleStep3Continue}
                  className="flex-1 rounded border border-[#20B26B] bg-[#20B26B] py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#07100B] transition-colors hover:bg-[#33C47C]"
                >
                  Continue to Analysis →
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 4 actions */}
          {wizardStep === 4 && tierLoaded && allDone && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 flex flex-wrap justify-center gap-3"
            >
              <Link
                href={gradeHubBasePath}
                className="rounded border border-[#24282D] bg-[#0B0D0F] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC] no-underline transition-colors hover:border-[#343941] hover:text-[#E6E8EB]"
              >
                Back to Hub
              </Link>
              {savedResultsSession ? (
                <Link
                  href={`${gradeHubBasePath}/results?session=${encodeURIComponent(
                    savedResultsSession.id
                  )}&jobs=${encodeURIComponent(savedResultsSession.jobsParam)}`}
                  className="rounded border border-[#343941] bg-[#13171B] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#E6E8EB] no-underline transition-colors hover:border-[#5A626E]"
                >
                  Open standalone results
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => router.push(gradeHubBasePath)}
                className="rounded border border-[#20B26B] bg-[#20B26B] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#07100B] transition-colors hover:bg-[#33C47C]"
              >
                New Session
              </button>
            </motion.div>
          )}

          </>
          )}

        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}

export default function GradeHubScanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#090B0D]">
          <div className="text-center">
            <div
              className="mx-auto mb-3 h-6 w-6 rounded-full border-2 border-[#5A626E] border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            <p className="text-[12px] text-[#77808C]">Loading…</p>
          </div>
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}
