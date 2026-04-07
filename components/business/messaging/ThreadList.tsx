"use client";

import { formatPrice } from "@/lib/pricing";
import type { MessageThread, ThreadFilter } from "@/lib/messaging/types";

const FILTER_TABS: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "needs_response", label: "Needs Reply" },
  { key: "offers", label: "Offers" },
  { key: "resolved", label: "Resolved" },
  { key: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<MessageThread["status"], string> = {
  needs_response: "border-amber-200 bg-amber-50 text-amber-700",
  open: "border-blue-200 bg-blue-50 text-blue-700",
  awaiting_buyer: "border-violet-200 bg-violet-50 text-violet-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

const STATUS_LABELS: Record<MessageThread["status"], string> = {
  needs_response: "Needs reply",
  open: "Open",
  awaiting_buyer: "Awaiting buyer",
  resolved: "Resolved",
  archived: "Archived",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function formatMoney(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return formatPrice(cents / 100);
}

interface Props {
  threads: MessageThread[];
  selectedId: string | null;
  filter: ThreadFilter;
  pinnedThreadIds: string[];
  onSelectThread: (id: string) => void;
  onFilterChange: (f: ThreadFilter) => void;
  onTogglePin: (id: string) => void;
}

export default function ThreadList({
  threads,
  selectedId,
  filter,
  pinnedThreadIds,
  onSelectThread,
  onFilterChange,
  onTogglePin,
}: Props) {
  return (
    <div className="flex h-full flex-col bg-[#FBFCFD]">
      <div className="border-b border-[var(--biz-border)] bg-white px-3 py-3">
        <div className="flex gap-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onFilterChange(tab.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                filter === tab.key
                  ? "bg-[linear-gradient(135deg,#18a06f_0%,#117d58_100%)] text-white shadow-[0_8px_18px_rgba(17,125,88,0.18)]"
                  : "text-[var(--biz-muted)] hover:bg-[#F4F7F9] hover:text-[var(--biz-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--biz-muted)]">
            No conversations match this view.
          </div>
        ) : (
          threads.map((thread) => {
            const isSelected = thread.id === selectedId;
            const hasUnread = thread.unread_count > 0;
            const isPinned = pinnedThreadIds.includes(thread.id);
            const offerText = formatMoney(thread.offer_amount_cents);

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className={`w-full border-b border-[var(--biz-border)] px-4 py-3 text-left transition-all ${
                  isSelected
                    ? "bg-[linear-gradient(135deg,#eefaf4_0%,#ffffff_72%)] shadow-[inset_3px_0_0_0_var(--biz-primary)]"
                    : "bg-transparent hover:bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-semibold text-slate-600">
                    {(thread.buyer_display_name ?? thread.buyer_username).slice(0, 1).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`truncate text-sm ${
                              hasUnread
                                ? "font-semibold text-[var(--biz-text)]"
                                : "font-medium text-[var(--biz-text)]"
                            }`}
                          >
                            {thread.buyer_display_name ?? thread.buyer_username}
                          </span>
                          {hasUnread ? (
                            <span className="rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-bold text-white">
                              {thread.unread_count}
                            </span>
                          ) : null}
                          {isPinned ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                        {thread.item_title ? (
                          <p className="mt-0.5 truncate text-[12px] text-[var(--biz-muted)]">
                            {thread.item_title}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] font-medium tabular-nums text-[var(--biz-muted)]">
                          {relativeTime(thread.last_message_at)}
                        </span>
                      </div>
                    </div>

                    <p
                      className={`mt-1.5 line-clamp-1 text-[13px] leading-relaxed ${
                        hasUnread ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {thread.last_message_preview}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[thread.status]}`}
                      >
                        {STATUS_LABELS[thread.status]}
                      </span>
                      {offerText ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Offer {offerText}
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {thread.platform === "ebay" ? "eBay" : thread.platform}
                        </span>
                      )}
                      {isSelected ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onTogglePin(thread.id);
                          }}
                          className="rounded-full border border-[var(--biz-border)] bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--biz-muted)] transition-colors hover:bg-[#F8FAFC]"
                        >
                          {isPinned ? "Unpin" : "Pin"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
