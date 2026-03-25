"use client";

import type { MessageThread, ThreadFilter } from "@/lib/messaging/types";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  question: { label: "Question", color: "bg-blue-50 text-blue-700 border-blue-200" },
  offer: { label: "Offer", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  shipping: { label: "Shipping", color: "bg-purple-50 text-purple-700 border-purple-200" },
  complaint: { label: "Complaint", color: "bg-red-50 text-red-700 border-red-200" },
  return_refund: { label: "Return", color: "bg-amber-50 text-amber-700 border-amber-200" },
  other: { label: "Other", color: "bg-gray-50 text-gray-600 border-gray-200" },
};

const STATUS_DOTS: Record<string, string> = {
  needs_response: "bg-red-500",
  open: "bg-blue-400",
  awaiting_buyer: "bg-amber-400",
  resolved: "bg-emerald-400",
  archived: "bg-gray-300",
};

const FILTER_TABS: { key: ThreadFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "needs_response", label: "Needs Reply" },
  { key: "offers", label: "Offers" },
  { key: "resolved", label: "Resolved" },
  { key: "archived", label: "Archived" },
];

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
    <div className="flex h-full flex-col">
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--biz-border)] bg-[#FAFAFA] px-3 py-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              filter === tab.key
                ? "bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-sm"
                : "text-[var(--biz-muted)] hover:bg-white hover:text-[var(--biz-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--biz-muted)]">
            No messages match this filter.
          </div>
        ) : (
          threads.map((thread) => {
            const cat = CATEGORY_LABELS[thread.category] ?? CATEGORY_LABELS.other;
            const isSelected = thread.id === selectedId;
            const hasUnread = thread.unread_count > 0;
            const isPinned = pinnedThreadIds.includes(thread.id);

            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className={`w-full border-b border-[var(--biz-border)] px-4 py-3.5 text-left transition-colors ${
                  isSelected
                    ? "border-l-2 border-l-[var(--biz-primary)] bg-gradient-to-r from-emerald-50 to-white"
                    : "hover:bg-[#F9FAFB]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Buyer + status */}
                    <div className="flex items-center gap-2">
                      {isPinned && (
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700">
                          PIN
                        </span>
                      )}
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          STATUS_DOTS[thread.status] ?? "bg-gray-300"
                        }`}
                      />
                      <span
                        className={`truncate text-sm ${
                          hasUnread
                            ? "font-semibold text-[var(--biz-text)]"
                            : "font-medium text-[var(--biz-text)]"
                        }`}
                      >
                        {thread.buyer_display_name ?? thread.buyer_username}
                      </span>
                      {hasUnread && (
                        <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {thread.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Item title */}
                    {thread.item_title && (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--biz-muted)]">
                        {thread.item_title}
                      </p>
                    )}

                    {/* Preview */}
                    <p
                      className={`mt-1 line-clamp-2 text-xs ${
                        hasUnread ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {thread.last_message_preview}
                    </p>
                  </div>

                  {/* Right side: time + category */}
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[10px] tabular-nums text-[var(--biz-muted)]">
                      {relativeTime(thread.last_message_at)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(thread.id);
                      }}
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                        isPinned
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-[var(--biz-border)] bg-white text-[var(--biz-muted)]"
                      }`}
                    >
                      {isPinned ? "Unpin" : "Pin"}
                    </button>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${cat.color}`}
                    >
                      {cat.label}
                    </span>
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
