"use client";

import { formatPrice } from "@/lib/pricing";
import type { MessageThread } from "@/lib/messaging/types";
import { buildPriorityRationale } from "./salesDealDesk";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "—";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function clipTitle(title: string | null, max = 44): string {
  const value = (title ?? "").trim();
  if (!value) return "Untitled card";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

interface Props {
  thread: MessageThread;
  selected: boolean;
  onSelect: (id: string) => void;
  autoResolvedLabel?: string | null;
}

export default function ConversationRow({
  thread,
  selected,
  onSelect,
  autoResolvedLabel = null,
}: Props) {
  const priority = buildPriorityRationale(thread);
  const offerText =
    typeof thread.offer_amount_cents === "number"
      ? formatPrice(thread.offer_amount_cents / 100)
      : null;
  const buyerLabel = thread.buyer_display_name ?? thread.buyer_username;
  const hasUnread = thread.unread_count > 0;
  const preview = thread.last_message_preview ?? "";

  const priorityColor =
    priority.level === "urgent"
      ? "var(--biz-danger)"
      : priority.level === "high"
        ? "var(--biz-warning)"
        : priority.level === "medium"
          ? "var(--biz-primary)"
          : "transparent";

  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      className={`group relative w-full border-b border-[var(--biz-border-subtle)] px-3 py-2 text-left transition-colors ${
        selected
          ? "bg-[var(--biz-hover)]"
          : "bg-transparent hover:bg-[var(--biz-surface-soft)]"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: priorityColor }}
      />
      <div className="flex items-center gap-2 pl-1.5">
        {hasUnread ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--biz-danger)" }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-[13px] ${
                hasUnread
                  ? "font-semibold text-[var(--biz-text-strong)]"
                  : "font-medium text-[var(--biz-text)]"
              }`}
            >
              {buyerLabel}
            </span>
            {offerText ? (
              <span className="biz-mono shrink-0 text-[10px] text-[var(--biz-primary)]">
                {offerText}
              </span>
            ) : null}
            {autoResolvedLabel ? (
              <span className="shrink-0 rounded-sm border border-[var(--biz-automation-border)] bg-[var(--biz-automation-soft)] px-1 py-px text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--biz-automation)]">
                Agent resolved
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[var(--biz-muted)]">
            {preview || clipTitle(thread.item_title)}
          </p>
        </div>
        <span className="biz-mono shrink-0 text-[10px] text-[var(--biz-muted)]">
          {relativeTime(thread.last_message_at)}
        </span>
      </div>
    </button>
  );
}
