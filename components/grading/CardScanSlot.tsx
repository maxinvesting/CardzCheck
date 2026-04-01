"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DualCardUploader from "@/components/DualCardUploader";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import GradeAnalysisAnimation from "@/components/grading/GradeAnalysisAnimation";
import { gradingCopy } from "@/copy/grading";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";
import type {
  CardIdentificationResult,
  GradeEstimate,
  GradeScanPhoto,
} from "@/types";
import type {
  GradeEstimateJobStatusResponse,
  GradeEstimateJobSteps,
} from "@/lib/grading/gradeEstimateJob";

export type SlotState = "idle" | "ready" | "analyzing" | "done" | "error";

interface CardScanSlotProps {
  slotIndex: number;
  totalSlots: number;
  disabled?: boolean;
  onStateChange?: (index: number, state: SlotState) => void;
}

function buildQueuedSteps(): GradeEstimateJobSteps {
  return {
    ocr_identity: { status: "queued" },
    grade_model: { status: "queued" },
    parse_validate: { status: "queued" },
    post_grading_value: { status: "queued" },
  };
}

// Slot accent — left-border color per slot index
const SLOT_COLORS = ["border-l-blue-500", "border-l-emerald-500", "border-l-amber-500"];
const SLOT_LABEL_COLORS = ["text-blue-400", "text-emerald-400", "text-amber-400"];
const SLOT_NAMES = ["Card A", "Card B", "Card C"];

export default function CardScanSlot({
  slotIndex,
  totalSlots,
  disabled = false,
  onStateChange,
}: CardScanSlotProps) {
  const accentBorder = SLOT_COLORS[slotIndex % SLOT_COLORS.length];
  const accentText = SLOT_LABEL_COLORS[slotIndex % SLOT_LABEL_COLORS.length];
  const slotName = totalSlots > 1 ? (SLOT_NAMES[slotIndex] ?? `Card ${slotIndex + 1}`) : null;

  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [gradeEstimate, setGradeEstimate] = useState<GradeEstimate | null>(null);
  const [gradeJob, setGradeJob] = useState<GradeEstimateJobStatusResponse | null>(null);
  const [gradeJobId, setGradeJobId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotState, setSlotState] = useState<SlotState>("idle");

  // Pre-scan notes (typed before upload — fed to AI as initial context)
  const [preScanNotes, setPreScanNotes] = useState("");

  // Refinement state (post-scan correction)
  const [refinePanelOpen, setRefinePanelOpen] = useState(false);
  const [refinementText, setRefinementText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [appliedRefinement, setAppliedRefinement] = useState<string | null>(null);

  const notify = useCallback(
    (s: SlotState) => { setSlotState(s); onStateChange?.(slotIndex, s); },
    [slotIndex, onStateChange]
  );

  const handleReset = useCallback(() => {
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setGradeJob(null);
    setGradeJobId(null);
    setAnalyzing(false);
    setShowAnimation(false);
    setError(null);
    setPreScanNotes("");
    setRefinePanelOpen(false);
    setRefinementText("");
    setRefining(false);
    setRefineError(null);
    setAppliedRefinement(null);
    notify("idle");
  }, [notify]);

  /**
   * Core grade-analysis logic. Accepts the card data directly so it can be
   * called immediately after identification (before React state has flushed).
   */
  const runGradeAnalysis = useCallback(async (card: CardIdentificationResult) => {
    const rawUrls = card.imageUrls ??
      (card.imageUrl ? [card.imageUrl] : []);
    const fallbackPhotos: GradeScanPhoto[] = rawUrls.map((url, i) => ({
      url,
      kind: (i === 0 ? "front" : "back") as GradeScanPhoto["kind"],
      sort_order: i,
    }));
    const scanPhotos = normalizeGradeScanPhotos(
      card.scanPhotos?.length ? card.scanPhotos : fallbackPhotos
    );

    const front = scanPhotos.find((p) => p.kind === "front");
    const back = scanPhotos.find((p) => p.kind === "back");
    if (!front || !back) {
      setError("Front and back photos are required before analysis.");
      notify("error");
      return;
    }
    const closeups = scanPhotos.filter((p) => p.kind !== "front" && p.kind !== "back");

    setAnalyzing(true);
    setError(null);
    setGradeEstimate(null);
    setGradeJob(null);
    setGradeJobId(null);
    setShowAnimation(true);
    notify("analyzing");

    try {
      const res = await fetch("/api/grade-estimate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front_url: front.url,
          back_url: back.url,
          closeups: closeups.map((p, i) => ({ url: p.url, kind: p.kind, sort_order: i })),
          scanPhotos: scanPhotos.map((p, i) => ({ ...p, sort_order: i })),
          card: {
            player_name: card.player_name,
            game: card.cardIdentity?.sport ?? undefined,
            sport: card.cardIdentity?.sport ?? undefined,
            year: card.year,
            set_name: card.set_name,
            card_number: card.card_number,
            parallel_type: card.parallel_type,
            variation: card.variation,
            insert: card.insert,
          },
          preScanNotes: preScanNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? payload?.reason ?? gradingCopy.status.estimateFailedFallback);
      }

      const payload: GradeEstimateJobStatusResponse & { jobId?: string } = await res.json();
      if (!payload?.jobId) throw new Error(gradingCopy.status.estimateFailedFallback);

      setGradeJob(payload);

      // The start endpoint runs the pipeline synchronously and returns the
      // completed (or errored) job state. Handle it without polling.
      if (payload.status === "done") {
        if (payload.final?.estimate) setGradeEstimate(payload.final.estimate);
        setAnalyzing(false);
        setShowAnimation(false);
        notify("done");
      } else if (payload.status === "error") {
        throw new Error(payload.error ?? gradingCopy.status.estimateFailedFallback);
      } else {
        // Fallback: status still queued/running — start polling (legacy async path).
        setGradeJobId(payload.jobId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : gradingCopy.status.estimateFailedFallback);
      setAnalyzing(false);
      setShowAnimation(false);
      notify("error");
    }
  }, [notify, preScanNotes]);

  /**
   * Called by DualCardUploader once photos are uploaded and identified.
   * Immediately triggers grade analysis — no extra button click needed.
   */
  const handleIdentified = useCallback((data: CardIdentificationResult) => {
    setIdentifiedCard(data);
    setGradeEstimate(null);
    setGradeJob(null);
    setGradeJobId(null);
    setError(null);
    setShowAnimation(false);
    // Auto-trigger grade analysis with fresh data (skip the "ready" intermediate state)
    void runGradeAnalysis(data);
  }, [runGradeAnalysis]);

  /** Retry — re-runs analysis using stored card data. */
  const handleAnalyze = useCallback(async () => {
    if (!identifiedCard) return;
    await runGradeAnalysis(identifiedCard);
  }, [identifiedCard, runGradeAnalysis]);

  /** Refinement — re-runs grade model with user correction text injected. No credit consumed. */
  const runRefinement = useCallback(async () => {
    if (!identifiedCard || !refinementText.trim()) return;
    setRefining(true);
    setRefineError(null);

    const rawUrls = identifiedCard.imageUrls ?? (identifiedCard.imageUrl ? [identifiedCard.imageUrl] : []);
    const fallbackPhotos: GradeScanPhoto[] = rawUrls.map((url, i) => ({
      url,
      kind: (i === 0 ? "front" : "back") as GradeScanPhoto["kind"],
      sort_order: i,
    }));
    const scanPhotos = normalizeGradeScanPhotos(
      identifiedCard.scanPhotos?.length ? identifiedCard.scanPhotos : fallbackPhotos
    );

    try {
      const res = await fetch("/api/grade-estimate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctionText: refinementText.trim(),
          scanPhotos: scanPhotos.map((p, i) => ({ ...p, sort_order: i })),
          front_url: scanPhotos.find((p) => p.kind === "front")?.url,
          back_url: scanPhotos.find((p) => p.kind === "back")?.url,
          closeups: scanPhotos
            .filter((p) => p.kind !== "front" && p.kind !== "back")
            .map((p, i) => ({ url: p.url, kind: p.kind, sort_order: i })),
          card: {
            player_name: identifiedCard.player_name,
            game: identifiedCard.cardIdentity?.sport ?? undefined,
            sport: identifiedCard.cardIdentity?.sport ?? undefined,
            year: identifiedCard.year,
            set_name: identifiedCard.set_name,
            card_number: identifiedCard.card_number,
            parallel_type: identifiedCard.parallel_type,
            variation: identifiedCard.variation,
            insert: identifiedCard.insert,
          },
          priorIdentity: identifiedCard.cardIdentity ?? undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Re-analysis failed. Please try again.");
      }

      const payload: GradeEstimateJobStatusResponse = await res.json();

      if (payload.status === "done" && payload.final?.estimate) {
        setGradeEstimate(payload.final.estimate);
        setAppliedRefinement(refinementText.trim());
        setRefinementText("");
        setRefinePanelOpen(false);
        setGradeJob(payload);
      } else if (payload.status === "error") {
        throw new Error(payload.error ?? "Re-analysis failed. Please try again.");
      }
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : "Re-analysis failed. Please try again.");
    } finally {
      setRefining(false);
    }
  }, [identifiedCard, refinementText]);

  useEffect(() => {
    if (!gradeJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/grade-estimate/status?jobId=${gradeJobId}`);
        if (!res.ok) throw new Error(gradingCopy.status.estimateFailedFallback);
        const payload: GradeEstimateJobStatusResponse = await res.json();
        if (cancelled) return;

        setGradeJob(payload);
        if (payload.final?.estimate) setGradeEstimate(payload.final.estimate);

        if (payload.status === "done") {
          setAnalyzing(false); setShowAnimation(false); notify("done");
          if (timer) clearInterval(timer);
        } else if (payload.status === "error") {
          setError(payload.error ?? gradingCopy.status.estimateFailedFallback);
          setAnalyzing(false); setShowAnimation(false); notify("error");
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : gradingCopy.status.estimateFailedFallback);
        setAnalyzing(false); setShowAnimation(false); notify("error");
        if (timer) clearInterval(timer);
      }
    };

    void poll();
    timer = setInterval(poll, 900);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [gradeJobId, notify]);

  const isDone = slotState === "done";
  const isAnalyzing = slotState === "analyzing";
  const isError = slotState === "error";

  return (
    <div className={`cc-surface overflow-hidden ${totalSlots > 1 ? `border-l-2 ${accentBorder}` : ""}`}>

      {/* Slot label — only for multi-card sessions */}
      {slotName && (
        <div className="flex items-center justify-between border-b border-[color:var(--biz-border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold tracking-wide ${accentText}`}>{slotName}</span>
            {isDone && (
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-px text-[10px] font-medium text-emerald-400">
                Done
              </span>
            )}
            {isAnalyzing && (
              <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-px text-[10px] font-medium text-blue-400 animate-pulse">
                Analyzing
              </span>
            )}
          </div>
          {(identifiedCard || isDone) && !isAnalyzing && (
            <button
              onClick={handleReset}
              className="text-[11px] text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {isDone && gradeEstimate && (
            <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <GradeProbabilityPanel
                estimate={gradeEstimate}
                cardIdentity={identifiedCard}
                primaryImageUrl={identifiedCard?.imageUrl}
                imageUrls={identifiedCard?.imageUrls}
                scanPhotos={identifiedCard?.scanPhotos}
                compact={totalSlots > 1}
                appliedRefinement={appliedRefinement}
              />

              {/* Refine Analysis — collapsible correction panel */}
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] overflow-hidden">
                <button
                  onClick={() => { setRefinePanelOpen((o) => !o); setRefineError(null); }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                >
                  <span className="text-[11px] font-semibold text-amber-400/80 tracking-wide">
                    ✦ Refine Analysis
                  </span>
                  <span className="text-[10px] text-white/30">{refinePanelOpen ? "▴" : "▾"}</span>
                </button>

                <AnimatePresence>
                  {refinePanelOpen && (
                    <motion.div
                      key="refine-panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2.5 border-t border-white/8">
                        {refining ? (
                          <div className="flex items-center gap-2 py-3 text-amber-400/70 text-xs">
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                            Re-analyzing with your correction…
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] text-white/40 pt-3">
                              Saw something the AI missed? Describe it and we&apos;ll re-analyze — no credit used.
                            </p>
                            <textarea
                              rows={3}
                              maxLength={500}
                              value={refinementText}
                              onChange={(e) => setRefinementText(e.target.value)}
                              placeholder="e.g. there's a scratch on the top-left corner you missed…"
                              className="w-full resize-none rounded-md border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                            />
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] ${refinementText.length > 450 ? "text-rose-400" : "text-white/25"}`}>
                                {refinementText.length}/500
                              </span>
                              <button
                                onClick={runRefinement}
                                disabled={!refinementText.trim()}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-black transition-opacity disabled:opacity-30 hover:opacity-90"
                              >
                                Re-analyze
                              </button>
                            </div>
                            {refineError && (
                              <p className="text-[11px] text-rose-400">{refineError}</p>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {isAnalyzing && (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {showAnimation && (
                <GradeAnalysisAnimation
                  imageUrl={identifiedCard?.imageUrl ?? null}
                  estimate={gradeEstimate}
                  valueResult={null}
                  onComplete={() => setShowAnimation(false)}
                />
              )}
              {gradeJob && (
                <GradeEstimateProgressPanel
                  status={gradeJob.status}
                  steps={gradeJob.steps}
                  elapsedLabel={null}
                />
              )}
            </motion.div>
          )}

          {isError && error && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-sm text-rose-400">{error}</p>
              <button onClick={handleReset} className="text-xs text-[var(--biz-muted)] underline hover:text-[var(--biz-text)]">
                Try again
              </button>
            </motion.div>
          )}

          {slotState === "idle" && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Pre-scan notes — optional context the user types before uploading */}
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 space-y-2">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 tracking-wide">
                  <svg className="h-3 w-3 text-amber-400/70" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/>
                  </svg>
                  Your observations <span className="font-normal text-white/25">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={preScanNotes}
                  onChange={(e) => setPreScanNotes(e.target.value)}
                  placeholder="e.g. I think the centering is slightly off, possible scratch near top-left corner…"
                  className="w-full resize-none rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                />
                {preScanNotes.length > 0 && (
                  <p className={`text-right text-[10px] ${preScanNotes.length > 360 ? "text-rose-400" : "text-white/20"}`}>
                    {preScanNotes.length}/400
                  </p>
                )}
              </div>
              <DualCardUploader
                onIdentified={handleIdentified}
                disabled={disabled || isAnalyzing}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
