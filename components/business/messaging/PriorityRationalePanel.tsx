"use client";

import StatusPill from "@/components/business/ui/StatusPill";
import type { MessageThread } from "@/lib/messaging/types";
import {
  PRIORITY_LABEL,
  PRIORITY_TONE,
  buildPriorityRationale,
} from "./salesDealDesk";

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))}m`;
  if (value < 24) return `${value < 10 ? value.toFixed(1) : Math.round(value)}h`;
  const days = value / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

interface Props {
  thread: MessageThread;
}

export default function PriorityRationalePanel({ thread }: Props) {
  const rationale = buildPriorityRationale(thread);

  return (
    <div className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--biz-border)] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
          Why this is prioritized
        </p>
        <div className="flex items-center gap-2">
          <span className="biz-mono text-[11px] text-[var(--biz-muted)]">
            {formatHours(rationale.hoursSinceLastActivity)} since last activity
          </span>
          <StatusPill tone={PRIORITY_TONE[rationale.level]} dot>
            {PRIORITY_LABEL[rationale.level]} priority
          </StatusPill>
        </div>
      </div>
      <div className="px-3 py-2">
        {rationale.reasons.length === 0 ? (
          <p className="text-[12px] text-[var(--biz-muted)]">
            No active signals. This thread is here because it is open.
          </p>
        ) : (
          <ul className="space-y-1 text-[12px] text-[var(--biz-text)]">
            {rationale.reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--biz-primary)]"
                  aria-hidden
                />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--biz-faint)] font-mono-num">
          Close score · scoring engine not connected
        </p>
      </div>
    </div>
  );
}
