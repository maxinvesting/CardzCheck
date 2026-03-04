"use client";

import { motion } from "framer-motion";
import type { WorthGradingResult } from "@/types";

function getActionLabel(rating: WorthGradingResult["rating"]): string {
  if (rating === "strong_yes") return "GRADE";
  if (rating === "yes") return "GRADE";
  if (rating === "maybe") return "CONSIDER";
  return "HOLD";
}

function getActionStyles(rating: WorthGradingResult["rating"]): {
  badge: string;
  label: string;
  container: string;
} {
  if (rating === "strong_yes" || rating === "yes") {
    return {
      badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
      label: "text-emerald-300",
      container: "border-emerald-500/15 bg-emerald-500/[0.04]",
    };
  }
  if (rating === "maybe") {
    return {
      badge: "bg-amber-500/15 text-amber-300 border border-amber-500/25",
      label: "text-amber-300",
      container: "border-amber-500/15 bg-amber-500/[0.04]",
    };
  }
  return {
    badge: "bg-white/[0.06] text-[#7a91a8] border border-white/[0.08]",
    label: "text-[#7a91a8]",
    container: "border-white/[0.06] bg-white/[0.02]",
  };
}

interface GradeDecisionPanelProps {
  result: WorthGradingResult;
}

export function GradeDecisionPanel({ result }: GradeDecisionPanelProps) {
  const action = getActionLabel(result.rating);
  const styles = getActionStyles(result.rating);
  const netGain = result.psa?.netGain;
  const hasEdge = Number.isFinite(netGain) && netGain !== 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.35, ease: "easeOut" }}
      className={`mt-3 rounded-xl border px-4 py-3 ${styles.container}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-[#3a5068] mb-1">
            Recommended Action
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${styles.badge}`}
            >
              {action}
            </span>
          </div>
        </div>

        {hasEdge ? (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.14em] text-[#3a5068] mb-1">
              Expected Edge
            </p>
            <p className={`text-sm font-semibold tabular-nums ${styles.label}`}>
              {netGain >= 0 ? "+" : "−"}${Math.abs(netGain).toFixed(0)}
            </p>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
