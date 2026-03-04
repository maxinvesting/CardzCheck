"use client";

import { useMemo } from "react";
import type { BusinessInventoryItem } from "@/types";
import {
  generateBusinessAnalystInsights,
  type ActionSignal,
  type ActionSignalType,
} from "@/lib/business/analyst-insights";

interface Props {
  items: BusinessInventoryItem[];
}

// ---------------------------------------------------------------------------
// Visual config per signal type
// ---------------------------------------------------------------------------

const SIGNAL_META: Record<
  ActionSignalType,
  { label: string; accent: string; dot: string; border: string; bg: string }
> = {
  list: {
    label: "List",
    accent: "text-amber-300",
    dot: "bg-amber-400",
    border: "border-amber-700/40",
    bg: "bg-amber-950/20",
  },
  reprice: {
    label: "Reprice",
    accent: "text-sky-300",
    dot: "bg-sky-400",
    border: "border-sky-700/40",
    bg: "bg-sky-950/20",
  },
  market_pulse_gainer: {
    label: "Market Pulse",
    accent: "text-emerald-300",
    dot: "bg-emerald-400",
    border: "border-emerald-700/40",
    bg: "bg-emerald-950/20",
  },
  market_pulse_loser: {
    label: "Market Pulse",
    accent: "text-rose-300",
    dot: "bg-rose-400",
    border: "border-rose-700/40",
    bg: "bg-rose-950/20",
  },
};

function SignalCard({ signal }: { signal: ActionSignal }) {
  const meta = SIGNAL_META[signal.type];

  return (
    <div
      className={`rounded-md border ${meta.border} ${meta.bg} px-2.5 py-2`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${meta.accent}`}
        >
          {meta.label}
        </span>
        {signal.daysHeld !== null && (
          <span className="text-[10px] tabular-nums text-gray-500">
            {signal.daysHeld}d held
          </span>
        )}
      </div>

      <p className="mt-1 text-xs font-medium text-gray-100 leading-snug truncate">
        {signal.title}
      </p>

      <p className="mt-0.5 text-[11px] text-gray-400 leading-snug">
        {signal.detail}
      </p>
    </div>
  );
}

export default function BusinessAnalystPanel({ items }: Props) {
  const insights = useMemo(() => generateBusinessAnalystInsights(items), [items]);

  const hasActions = insights.actions.length > 0;

  return (
    <section className="mb-3 rounded-lg border border-gray-800 bg-gray-900/80">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Today&apos;s Actions
          </h2>
          <p className="text-xs text-gray-400">
            Actionable signals from your inventory data
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 font-medium uppercase tracking-wider text-emerald-300">
            AI
          </span>
          <span className="text-gray-500">
            {insights.coverage.totalItems} tracked
          </span>
        </div>
      </div>

      {/* Coverage metrics strip */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-gray-800 px-3 py-2 text-[10px] text-gray-400 md:grid-cols-4">
        <div>
          Active
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.activeItems}
          </span>
        </div>
        <div>
          Est. MV Coverage
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.cmvCoveragePct}%
          </span>
        </div>
        <div>
          LIST Coverage
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.listCoveragePct}%
          </span>
        </div>
        <div className="text-gray-500">
          {insights.summary.actionCount} signal{insights.summary.actionCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Signal cards */}
      <div className="p-3">
        {hasActions ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {insights.actions.map((signal) => (
              <SignalCard key={`${signal.type}-${signal.itemId}`} signal={signal} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-gray-500">
            No actionable signals right now. Check back when inventory data changes.
          </p>
        )}
      </div>
    </section>
  );
}
