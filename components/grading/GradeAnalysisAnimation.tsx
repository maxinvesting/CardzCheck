"use client";

/**
 * GradeAnalysisAnimation
 *
 * State machine: scanning → slab → reveal → (complete / waiting)
 *
 * - scanning  (0–1.2 s)   Scan line, shimmer, analysis messages
 * - slab      (1.2 s+)    CardzCheck slab slides in; stays as loading state
 *                          until estimate arrives or until 2.2 s have elapsed
 * - reveal    (≥ 2.2 s,   Probability bars count up; decision panel fades in
 *              estimate    then onComplete() is called
 *              required)
 *
 * If no estimate arrives by 2.2 s the slab stays visible with an animated
 * waiting indicator until the estimate prop becomes non-null.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GradeEstimate, WorthGradingResult } from "@/types";
import { CardScanOverlay } from "./CardScanOverlay";
import { GradeDecisionPanel } from "./GradeDecisionPanel";
import { ProbabilityReveal } from "./ProbabilityReveal";
import { SlabFrame } from "./SlabFrame";

type AnimStage = "scanning" | "slab" | "reveal" | "complete";

interface GradeAnalysisAnimationProps {
  imageUrl: string | null;
  estimate: GradeEstimate | null;
  valueResult: WorthGradingResult | null;
  hasError?: boolean;
  onComplete: () => void;
}

export default function GradeAnalysisAnimation({
  imageUrl,
  estimate,
  valueResult,
  hasError,
  onComplete,
}: GradeAnalysisAnimationProps) {
  const [stage, setStage] = useState<AnimStage>("scanning");
  // Ref so timers can read latest estimate without being stale closures
  const estimateRef = useRef<GradeEstimate | null>(estimate);
  estimateRef.current = estimate;

  const stageRef = useRef<AnimStage>("scanning");
  stageRef.current = stage;

  // Stable reference to onComplete so it doesn't re-trigger effects
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const callComplete = useCallback(() => {
    setStage("complete");
    onCompleteRef.current();
  }, []);

  // ── Core timing: scanning → slab at 1.2 s, then check for reveal at 2.2 s ──
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setStage("slab");
    }, 1200);

    const t2 = window.setTimeout(() => {
      if (estimateRef.current) {
        // Estimate already arrived — go straight to reveal
        setStage("reveal");
      }
      // If no estimate yet, stay in "slab" stage — the estimate watcher
      // below will fire setStage("reveal") when it arrives
    }, 2200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Watch for estimate arriving while in "slab" stage ──
  useEffect(() => {
    if (!estimate) return;
    // Only advance if we're in slab (past the 2.2 s mark)
    // If still scanning or already in reveal/complete, ignore
    if (stageRef.current === "slab") {
      setStage("reveal");
    }
  }, [estimate]);

  // ── Auto-complete after reveal animation runs (~2 s after reveal start) ──
  useEffect(() => {
    if (stage !== "reveal") return;
    const timer = window.setTimeout(() => {
      callComplete();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [stage, callComplete]);

  // ── Hard dismiss on error ──
  useEffect(() => {
    if (!hasError) return;
    callComplete();
  }, [hasError, callComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/[0.06] bg-[#07111d] overflow-hidden"
    >
      <div className="px-6 py-6 flex flex-col items-center">

        {/* ── Stage 1: Card Scan ──────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {stage === "scanning" ? (
            <motion.div
              key="scan-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center"
            >
              <CardScanOverlay imageUrl={imageUrl} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Stages 2 + 3: Slab (persists through reveal) ──────── */}
        <AnimatePresence>
          {(stage === "slab" || stage === "reveal") ? (
            <motion.div
              key="slab-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-[260px]"
            >
              <SlabFrame
                imageUrl={imageUrl}
                isLoading={stage === "slab" || !estimate}
              >
                {/* ── Waiting indicator inside slab (slab stage, no estimate) ── */}
                <AnimatePresence>
                  {stage === "slab" && !estimate ? (
                    <motion.div
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                      className="mt-4 text-center w-full"
                    >
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#3a5068]">
                        Deep analysis in progress…
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* ── Stage 3: Probability reveal ─────────────────────────── */}
                <AnimatePresence>
                  {stage === "reveal" && estimate ? (
                    <motion.div
                      key="reveal"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="w-full px-0.5"
                    >
                      <ProbabilityReveal estimate={estimate} />
                      {valueResult ? (
                        <GradeDecisionPanel result={valueResult} />
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </SlabFrame>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
