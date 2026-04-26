import type { MessageThread, MessagingStats } from "@/lib/messaging/types";
import { isClosedSalesThread } from "@/components/business/messaging/salesDealDesk";

export interface SalesPulseSnapshot {
  openConversations: number;
  newActivity24h: number;
  awaitingReply: number;
  avgResponseHours: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getTime(iso: string): number {
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : 0;
}

export function buildSalesPulseSnapshot(
  threads: MessageThread[],
  stats: MessagingStats,
  now = Date.now()
): SalesPulseSnapshot {
  const active = threads.filter((t) => !isClosedSalesThread(t));
  const openConversations = active.length;
  const newActivity24h = active.filter(
    (t) => now - getTime(t.last_message_at) <= DAY_MS
  ).length;
  const awaitingReply = active.filter((t) => t.status === "needs_response").length;

  return {
    openConversations,
    newActivity24h,
    awaitingReply,
    avgResponseHours: stats.avg_response_time_hours,
  };
}
