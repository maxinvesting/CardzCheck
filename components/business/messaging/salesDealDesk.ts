import type { MessageThread, ThreadFilter } from "@/lib/messaging/types";
import type { StatusTone } from "@/components/business/ui/StatusPill";

export const SALES_STATUS_STYLES: Record<MessageThread["status"], string> = {
  needs_response: "border-amber-700/40 bg-amber-900/25 text-amber-400",
  open: "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]",
  awaiting_buyer: "border-violet-700/40 bg-violet-900/25 text-violet-400",
  resolved: "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-muted)]",
  archived: "border-[#222] bg-[#111] text-[#555]",
};

export const SALES_STATUS_TONE: Record<MessageThread["status"], StatusTone> = {
  needs_response: "warning",
  open: "primary",
  awaiting_buyer: "automation",
  resolved: "muted",
  archived: "muted",
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

// ─── Priority + recommended action ──────────────────────────────────────

export type RecommendedActionLabel =
  | "Reply now"
  | "Send counter"
  | "Accept if price works"
  | "Follow up"
  | "Archive / low priority"
  | "Awaiting buyer";

export type PriorityLevel = "urgent" | "high" | "medium" | "low";

export const PRIORITY_TONE: Record<PriorityLevel, StatusTone> = {
  urgent: "danger",
  high: "warning",
  medium: "primary",
  low: "muted",
};

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Watch",
  low: "Low",
};

const QUESTION_PATTERN = /\?\s*$/;
const PAYMENT_PATTERN = /\b(pay|payment|invoice|paypal|venmo|zelle)\b/i;
const SHIPPING_PATTERN = /\b(ship|shipping|tracking|mail|deliver|arrived)\b/i;
const AVAILABILITY_PATTERN = /\b(available|in stock|still have|do you have)\b/i;
const HOUR_MS = 60 * 60 * 1000;

export interface PriorityRationale {
  level: PriorityLevel;
  reasons: string[];
  hoursSinceLastActivity: number | null;
}

export function buildPriorityRationale(
  thread: MessageThread,
  now = Date.now()
): PriorityRationale {
  const reasons: string[] = [];
  const lastTouch = getTimeValue(thread.last_message_at);
  const hoursSinceLastActivity =
    lastTouch === 0 ? null : Math.max(0, (now - lastTouch) / HOUR_MS);

  if (thread.status === "needs_response") {
    reasons.push("Buyer is waiting on your reply");
  }
  if (thread.unread_count > 0) {
    reasons.push(
      `${thread.unread_count} unread message${thread.unread_count === 1 ? "" : "s"}`
    );
  }
  if (typeof thread.offer_amount_cents === "number") {
    reasons.push("Open offer on the table");
  } else if (thread.category === "offer") {
    reasons.push("Thread is in active negotiation");
  }
  if (isStaleSalesThread(thread, now)) {
    reasons.push(
      thread.status === "awaiting_buyer"
        ? "Buyer has gone quiet over 36h"
        : "Quiet over 72h — at risk of going cold"
    );
  } else if (
    hoursSinceLastActivity !== null &&
    hoursSinceLastActivity <= 24
  ) {
    reasons.push("Recent activity in last 24h");
  }
  const preview = thread.last_message_preview ?? "";
  if (preview && QUESTION_PATTERN.test(preview.trim())) {
    reasons.push("Last message ended with a direct question");
  }
  if (preview && PAYMENT_PATTERN.test(preview)) {
    reasons.push("Buyer mentioned payment");
  } else if (preview && SHIPPING_PATTERN.test(preview)) {
    reasons.push("Buyer asked about shipping");
  } else if (preview && AVAILABILITY_PATTERN.test(preview)) {
    reasons.push("Buyer asked about availability");
  }

  let level: PriorityLevel = "low";
  if (
    thread.status === "needs_response" ||
    (typeof thread.offer_amount_cents === "number" && !isClosedSalesThread(thread))
  ) {
    level = "urgent";
  } else if (isStaleSalesThread(thread, now) && !isClosedSalesThread(thread)) {
    level = "high";
  } else if (thread.unread_count > 0) {
    level = "high";
  } else if (
    hoursSinceLastActivity !== null &&
    hoursSinceLastActivity <= 24 &&
    !isClosedSalesThread(thread)
  ) {
    level = "medium";
  }

  if (isClosedSalesThread(thread)) {
    level = "low";
  }

  return { level, reasons, hoursSinceLastActivity };
}

export function recommendThreadAction(
  thread: MessageThread,
  now = Date.now()
): RecommendedActionLabel {
  if (isClosedSalesThread(thread)) return "Archive / low priority";
  const offerCents = thread.offer_amount_cents;
  const askCents = thread.listing_price_cents;
  if (typeof offerCents === "number" && thread.status !== "resolved") {
    if (typeof askCents === "number" && askCents > 0) {
      const ratio = offerCents / askCents;
      if (ratio >= 0.92) return "Accept if price works";
      return "Send counter";
    }
    return "Send counter";
  }
  if (thread.status === "needs_response" || thread.unread_count > 0) {
    return "Reply now";
  }
  if (isStaleSalesThread(thread, now)) {
    return thread.status === "awaiting_buyer" ? "Follow up" : "Follow up";
  }
  if (thread.status === "awaiting_buyer") {
    return "Awaiting buyer";
  }
  return "Reply now";
}

export const ACTION_TONE: Record<RecommendedActionLabel, StatusTone> = {
  "Reply now": "warning",
  "Send counter": "primary",
  "Accept if price works": "profit",
  "Follow up": "info",
  "Archive / low priority": "muted",
  "Awaiting buyer": "automation",
};

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
