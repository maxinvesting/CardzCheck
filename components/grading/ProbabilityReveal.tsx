"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { GradeEstimate } from "@/types";
import {
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";

function useCountUp(target: number, durationMs: number, delayMs: number): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    let startTs: number | null = null;

    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      const progress = Math.min(elapsed / durationMs, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    const timerId = window.setTimeout(() => {
      frameRef.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs, delayMs]);

  return value;
}

function AnimatedProbabilityRow({
  outcome,
  isHighlighted,
  index,
}: {
  outcome: GradeOutcome;
  isHighlighted: boolean;
  index: number;
}) {
  const targetPct = Math.round(outcome.probability * 100);
  const delay = index * 90;
  const displayPct = useCountUp(targetPct, 650, delay);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay / 1000, duration: 0.3, ease: "easeOut" }}
      className={targetPct === 0 ? "opacity-40" : ""}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs ${
            isHighlighted ? "text-[#e2eaf3] font-medium" : "text-[#7a91a8]"
          }`}
        >
          {outcome.label}
        </span>
        <span
          className={`text-xs font-mono tabular-nums ${
            isHighlighted ? "text-[#e2eaf3]" : "text-[#3a5068]"
          }`}
        >
          {displayPct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            isHighlighted ? "bg-blue-500" : "bg-blue-500/25"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${targetPct}%` }}
          transition={{
            delay: delay / 1000,
            duration: 0.75,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>
    </motion.div>
  );
}

interface ProbabilityRevealProps {
  estimate: GradeEstimate;
}

export function ProbabilityReveal({ estimate }: ProbabilityRevealProps) {
  const outcomes = normalizePsaDistribution(
    [
      {
        label: "PSA 10",
        probability: estimate.grade_probabilities?.psa?.["10"] ?? 0,
      },
      {
        label: "PSA 9",
        probability: estimate.grade_probabilities?.psa?.["9"] ?? 0,
      },
      {
        label: "PSA 8",
        probability: estimate.grade_probabilities?.psa?.["8"] ?? 0,
      },
      {
        label: "PSA 7 or lower",
        probability: estimate.grade_probabilities?.psa?.["7_or_lower"] ?? 0,
      },
    ],
    { allowPsa10Override: false }
  );

  const likely =
    outcomes.length > 0
      ? outcomes.reduce((max, o) =>
          o.probability > max.probability ? o : max
        )
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full mt-5 space-y-4"
    >
      {/* Most likely outcome */}
      {likely ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="text-center pb-3 border-b border-white/[0.06]"
        >
          <p className="text-[9px] uppercase tracking-[0.16em] text-[#3a5068] mb-1.5">
            Most likely outcome
          </p>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-xl font-bold text-[#e2eaf3]">
              {likely.label}
            </span>
            <span className="text-base font-semibold text-blue-400">
              {Math.round(likely.probability * 100)}%
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Probability bars */}
      <div className="space-y-2.5">
        {outcomes.map((outcome, i) => (
          <AnimatedProbabilityRow
            key={outcome.label}
            outcome={outcome}
            isHighlighted={outcome.label === likely?.label}
            index={i}
          />
        ))}
      </div>
    </motion.div>
  );
}
