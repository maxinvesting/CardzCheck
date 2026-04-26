"use client";

import type { SalesPulseSnapshot } from "@/lib/messaging/pulse";

interface Props {
  snapshot: SalesPulseSnapshot;
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 1) {
    const mins = Math.max(1, Math.round(value * 60));
    return `${mins}m`;
  }
  if (value < 24) {
    return `${value < 10 ? value.toFixed(1) : Math.round(value).toString()}h`;
  }
  const days = value / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days).toString()}d`;
}

export default function SalesPulseStrip({ snapshot }: Props) {
  const tiles = [
    {
      label: "Open conversations",
      value: snapshot.openConversations.toString(),
      hint: "active in the queue",
    },
    {
      label: "Active in last 24h",
      value: snapshot.newActivity24h.toString(),
      hint: "buyer or seller movement",
    },
    {
      label: "Awaiting your reply",
      value: snapshot.awaitingReply.toString(),
      hint: "buyer is waiting",
    },
    {
      label: "Median response",
      value: formatHours(snapshot.avgResponseHours),
      hint: "your recent cadence",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-[var(--biz-border)] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
            {tile.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--biz-text)]">
            {tile.value}
          </p>
          <p className="mt-1 text-[12px] text-[var(--biz-muted)]">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}
