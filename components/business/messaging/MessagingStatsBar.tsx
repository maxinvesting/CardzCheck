"use client";

import type { MessagingStats } from "@/lib/messaging/types";

interface Props {
  stats: MessagingStats;
  loading: boolean;
}

export default function MessagingStatsBar({ stats, loading }: Props) {
  const cards = [
    { label: "Total Threads", value: stats.total_threads, color: "text-[var(--biz-text)]" },
    { label: "Unread", value: stats.unread_count, color: stats.unread_count > 0 ? "text-red-600" : "text-[var(--biz-text)]" },
    { label: "Needs Reply", value: stats.needs_response, color: stats.needs_response > 0 ? "text-amber-600" : "text-[var(--biz-text)]" },
    { label: "Active Offers", value: stats.open_offers, color: stats.open_offers > 0 ? "text-emerald-600" : "text-[var(--biz-text)]" },
    { label: "Avg Response", value: stats.avg_response_time_hours != null ? `${stats.avg_response_time_hours}h` : "—", color: "text-[var(--biz-text)]" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          className="rounded-xl border border-[var(--biz-border)] bg-white px-3 py-2.5 shadow-[0_3px_10px_rgba(0,0,0,0.04)]"
        >
          <p className="text-[10px] uppercase tracking-wide text-[var(--biz-muted)]">{label}</p>
          {loading ? (
            <div className="mt-1 h-5 w-10 animate-pulse rounded bg-gray-100" />
          ) : (
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>
              {value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
