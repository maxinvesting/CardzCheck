"use client";

import { useState } from "react";
import StatusPill from "@/components/business/ui/StatusPill";
import type { BriefingObservations } from "@/lib/messaging/briefing";

function pluralize(count: number, single: string, multiple: string): string {
  return count === 1 ? single : multiple;
}

function buildOperationalLines(obs: BriefingObservations): string[] {
  const lines: string[] = [];
  if (obs.openConversations === 0) {
    lines.push("No open buyer conversations in the queue right now.");
    return lines;
  }
  if (obs.needsReply > 0) {
    lines.push(
      `${obs.needsReply} ${pluralize(obs.needsReply, "buyer is", "buyers are")} waiting on you.`
    );
  }
  if (obs.openOffers > 0) {
    lines.push(
      `${obs.openOffers} ${pluralize(obs.openOffers, "offer is", "offers are")} still open.`
    );
  }
  if (obs.quietLong > 0) {
    lines.push(
      `${obs.quietLong} ${pluralize(obs.quietLong, "conversation has", "conversations have")} gone quiet over 72h.`
    );
  }
  if (obs.awaitingBuyer > 0) {
    lines.push(
      `${obs.awaitingBuyer} ${pluralize(obs.awaitingBuyer, "thread is", "threads are")} sitting on the buyer's court.`
    );
  }
  if (obs.needsReply > 0) {
    lines.push("Start with needs-action threads before stale follow-ups.");
  } else if (obs.openOffers > 0) {
    lines.push("Move open offers next — they have the most signal.");
  } else if (obs.quietLong > 0) {
    lines.push("Re-engage stale threads to recover lost momentum.");
  } else {
    lines.push("Queue is clean — keep cadence steady.");
  }
  return lines;
}

interface Props {
  observations: BriefingObservations;
  source: "ai" | "fallback";
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  greetingName: string;
}

export default function AgentBriefing({
  observations,
  source,
  loading,
  onRefresh,
  refreshing,
  greetingName,
}: Props) {
  const lines = buildOperationalLines(observations);
  const [expanded, setExpanded] = useState(false);
  const headline = lines[0] ?? "Queue is clean.";

  return (
    <section className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)]">
      <header className="flex items-center justify-between gap-3 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--biz-automation)" }}
            aria-hidden
          />
          <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
            Briefing
          </p>
          <StatusPill tone={source === "ai" ? "automation" : "muted"}>
            {source === "ai" ? "AI" : "Live"}
          </StatusPill>
          {!expanded ? (
            <span className="truncate text-[12px] text-[var(--biz-text)]">
              {loading ? "Loading…" : headline}
            </span>
          ) : null}
          <svg
            className={`h-3 w-3 shrink-0 text-[var(--biz-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[var(--biz-muted)] sm:inline">
            {greetingName}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--biz-text)] transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {expanded ? (
        <div className="border-t border-[var(--biz-border)] px-3 py-2">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--biz-skeleton)]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--biz-skeleton)]" />
            </div>
          ) : (
            <ul className="space-y-1 text-[12px] leading-relaxed text-[var(--biz-text)]">
              {lines.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span
                    className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--biz-muted)]"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
