import type { MessageThread, ThreadFilter } from "@/lib/messaging/types";

export const SALES_STATUS_STYLES: Record<MessageThread["status"], string> = {
  needs_response: "border-amber-200 bg-amber-50 text-amber-700",
  open: "border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] text-[var(--biz-secondary)]",
  awaiting_buyer: "border-violet-200 bg-violet-50 text-violet-700",
  resolved: "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

export const SALES_STATUS_LABELS: Record<MessageThread["status"], string> = {
  needs_response: "Needs action",
  open: "Open deal",
  awaiting_buyer: "Awaiting buyer",
  resolved: "Resolved",
  archived: "Archived",
};

export interface SalesDealDeskSnapshot {
  activeOfferThreads: MessageThread[];
  staleThreads: MessageThread[];
  needsReplyThreads: MessageThread[];
  unreadThreads: MessageThread[];
  openDealCount: number;
  pipelineOfferValueCents: number;
  awaitingBuyerCount: number;
}

function getTimeValue(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function byNewestActivity(a: MessageThread, b: MessageThread): number {
  return getTimeValue(b.last_message_at) - getTimeValue(a.last_message_at);
}

function byNeedsAction(a: MessageThread, b: MessageThread): number {
  if (a.unread_count !== b.unread_count) {
    return b.unread_count - a.unread_count;
  }
  return byNewestActivity(a, b);
}

function byOfferPriority(a: MessageThread, b: MessageThread): number {
  const offerDiff = (b.offer_amount_cents ?? 0) - (a.offer_amount_cents ?? 0);
  if (offerDiff !== 0) return offerDiff;
  return byNewestActivity(a, b);
}

function byOldestActivity(a: MessageThread, b: MessageThread): number {
  return getTimeValue(a.last_message_at) - getTimeValue(b.last_message_at);
}

export function isClosedSalesThread(thread: MessageThread): boolean {
  return thread.status === "resolved" || thread.status === "archived";
}

export function isStaleSalesThread(
  thread: Pick<MessageThread, "status" | "last_message_at">,
  now = Date.now()
): boolean {
  const lastTouch = getTimeValue(thread.last_message_at);
  if (lastTouch === 0) return false;
  const lastTouchHours = (now - lastTouch) / 3_600_000;
  if (!Number.isFinite(lastTouchHours) || lastTouchHours < 0) return false;
  if (thread.status === "awaiting_buyer") {
    return lastTouchHours >= 36;
  }
  return lastTouchHours >= 72;
}

export function matchesThreadFilter(
  thread: MessageThread,
  filter: ThreadFilter
): boolean {
  switch (filter) {
    case "unread":
      return thread.unread_count > 0;
    case "needs_response":
      return thread.status === "needs_response";
    case "offers":
      return thread.category === "offer";
    case "resolved":
      return thread.status === "resolved";
    case "archived":
      return thread.status === "archived";
    default:
      return true;
  }
}

export function buildSalesDealDeskSnapshot(
  threads: MessageThread[],
  now = Date.now()
): SalesDealDeskSnapshot {
  const activeThreads = threads.filter((thread) => !isClosedSalesThread(thread));
  const activeOfferThreads = activeThreads
    .filter(
      (thread) =>
        thread.category === "offer" || typeof thread.offer_amount_cents === "number"
    )
    .sort(byOfferPriority);
  const needsReplyThreads = activeThreads
    .filter((thread) => thread.status === "needs_response")
    .sort(byNeedsAction);
  const staleThreads = activeThreads
    .filter((thread) => isStaleSalesThread(thread, now))
    .sort(byOldestActivity);
  const unreadThreads = activeThreads
    .filter((thread) => thread.unread_count > 0)
    .sort(byNeedsAction);
  const openDealCount = activeThreads.filter(
    (thread) =>
      thread.status === "needs_response" ||
      thread.status === "awaiting_buyer" ||
      thread.category === "offer" ||
      typeof thread.offer_amount_cents === "number"
  ).length;

  return {
    activeOfferThreads,
    staleThreads,
    needsReplyThreads,
    unreadThreads,
    openDealCount,
    pipelineOfferValueCents: activeOfferThreads.reduce(
      (sum, thread) => sum + (thread.offer_amount_cents ?? 0),
      0
    ),
    awaitingBuyerCount: activeThreads.filter(
      (thread) => thread.status === "awaiting_buyer"
    ).length,
  };
}
