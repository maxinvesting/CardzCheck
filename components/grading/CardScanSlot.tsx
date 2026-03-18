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

  const notify = useCallback(
    (s: SlotState) => { setSlotState(s); onStateChange?.(slotIndex, s); },
    [slotIndex, onStateChange]
  );

  const handleIdentified = useCallback((data: CardIdentificationResult) => {
    setIdentifiedCard(data);
    setGradeEstimate(null);
    setGradeJob(null);
    setGradeJobId(null);
    setError(null);
    setShowAnimation(false);
    notify("ready");
  }, [notify]);

  const handleReset = useCallback(() => {
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setGradeJob(null);
    setGradeJobId(null);
    setAnalyzing(false);
    setShowAnimation(false);
    setError(null);
    notify("idle");
  }, [notify]);

  const handleAnalyze = useCallback(async () => {
    if (!identifiedCard) return;

    const rawUrls = identifiedCard.imageUrls ??
      (identifiedCard.imageUrl ? [identifiedCard.imageUrl] : []);
    const fallbackPhotos: GradeScanPhoto[] = rawUrls.map((url, i) => ({
      url,
      kind: (i === 0 ? "front" : "back") as GradeScanPhoto["kind"],
      sort_order: i,
    }));
    const scanPhotos = normalizeGradeScanPhotos(
      identifiedCard.scanPhotos?.length ? identifiedCard.scanPhotos : fallbackPhotos
    );

    const front = scanPhotos.find((p) => p.kind === "front");
    const back = scanPhotos.find((p) => p.kind === "back");
    if (!front || !back) {
      setError("Front and back photos are required before analysis.");
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
          card: identifiedCard
            ? {
                player_name: identifiedCard.player_name,
                game: identifiedCard.cardIdentity?.sport ?? undefined,
                sport: identifiedCard.cardIdentity?.sport ?? undefined,
                year: identifiedCard.year,
                set_name: identifiedCard.set_name,
                card_number: identifiedCard.card_number,
                parallel_type: identifiedCard.parallel_type,
                variation: identifiedCard.variation,
                insert: identifiedCard.insert,
              }
            : undefined,
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
  }, [identifiedCard, notify]);

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
              />
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

          {(slotState === "idle" || slotState === "ready") && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <DualCardUploader
                onIdentified={handleIdentified}
                disabled={disabled || isAnalyzing}
                onReset={handleReset}
              />
              {slotState === "ready" && identifiedCard && (
                <button
                  onClick={handleAnalyze}
                  disabled={disabled}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50"
                >
                  Analyze Grade
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
