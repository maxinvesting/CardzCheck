"use client";

import type { MessagingStats } from "@/lib/messaging/types";

interface Props {
  stats: MessagingStats;
  loading: boolean;
}

export default function MessagingStatsBar({ stats, loading }: Props) {
  const cards = [
    { label: "Threads", value: stats.total_threads, color: "text-[var(--biz-text)]" },
    { label: "Unread", value: stats.unread_count, color: stats.unread_count > 0 ? "text-red-600" : "text-[var(--biz-text)]" },
    { label: "Needs reply", value: stats.needs_response, color: stats.needs_response > 0 ? "text-amber-600" : "text-[var(--biz-text)]" },
    { label: "Active offers", value: stats.open_offers, color: stats.open_offers > 0 ? "text-emerald-600" : "text-[var(--biz-text)]" },
    { label: "Avg response", value: stats.avg_response_time_hours != null ? `${stats.avg_response_time_hours}h` : "—", color: "text-[var(--biz-text)]" },
  ];

  return (
    <div className="grid min-w-0 grid-cols-2 divide-y divide-[var(--biz-border)] sm:grid-cols-5 sm:divide-x sm:divide-y-0">
      {cards.map(({ label, value, color }, i) => (
        <div
          key={label}
          className={`flex min-w-0 items-baseline gap-2 px-3 py-2 sm:flex-col sm:items-start sm:gap-0.5 ${
            i % 2 === 1 ? "border-l border-[var(--biz-border)] sm:border-l-0" : ""
          }`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--biz-muted)] truncate">
            {label}
          </p>
          {loading ? (
            <div className="h-5 w-10 animate-pulse rounded bg-gray-100" />
          ) : (
            <p className={`text-base font-semibold tabular-nums ${color} truncate`}>
              {value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
