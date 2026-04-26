import type { MessageThread, MessagingStats } from "@/lib/messaging/types";
import {
  buildSalesDealDeskSnapshot,
  isClosedSalesThread,
  isStaleSalesThread,
} from "@/components/business/messaging/salesDealDesk";

export type BriefingChipKey =
  | "needs_reply"
  | "quiet_long"
  | "new_today"
  | "open_offers";

export interface BriefingChip {
  key: BriefingChipKey;
  label: string;
  count: number;
}

export interface BriefingObservations {
  openConversations: number;
  needsReply: number;
  quietLong: number;
  newToday: number;
  openOffers: number;
  awaitingBuyer: number;
  oldestQuietHours: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function getTime(iso: string): number {
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : 0;
}

export function buildBriefingObservations(
  threads: MessageThread[],
  now = Date.now()
): BriefingObservations {
  const active = threads.filter((t) => !isClosedSalesThread(t));
  const desk = buildSalesDealDeskSnapshot(threads, now);

  const newToday = active.filter(
    (t) => now - getTime(t.last_message_at) <= DAY_MS
  ).length;

  let oldestQuietHours: number | null = null;
  for (const t of desk.staleThreads) {
    const hrs = (now - getTime(t.last_message_at)) / HOUR_MS;
    if (oldestQuietHours === null || hrs > oldestQuietHours) {
      oldestQuietHours = hrs;
    }
  }

  return {
    openConversations: active.length,
    needsReply: desk.needsReplyThreads.length,
    quietLong: desk.staleThreads.length,
    newToday,
    openOffers: desk.activeOfferThreads.length,
    awaitingBuyer: desk.awaitingBuyerCount,
    oldestQuietHours,
  };
}

export function buildBriefingChips(
  obs: BriefingObservations
): BriefingChip[] {
  const chips: BriefingChip[] = [];
  if (obs.needsReply > 0) {
    chips.push({
      key: "needs_reply",
      label: `${obs.needsReply} awaiting your reply`,
      count: obs.needsReply,
    });
  }
  if (obs.quietLong > 0) {
    chips.push({
      key: "quiet_long",
      label: `${obs.quietLong} quiet over 72h`,
      count: obs.quietLong,
    });
  }
  if (obs.newToday > 0) {
    chips.push({
      key: "new_today",
      label: `${obs.newToday} active in last 24h`,
      count: obs.newToday,
    });
  }
  if (obs.openOffers > 0) {
    chips.push({
      key: "open_offers",
      label: `${obs.openOffers} open offers`,
      count: obs.openOffers,
    });
  }
  return chips;
}

export function buildFallbackBriefingNarrative(
  obs: BriefingObservations
): string {
  if (obs.openConversations === 0) {
    return "The desk is quiet right now. No open buyer conversations are in the queue.";
  }

  const parts: string[] = [];
  parts.push(
    `${obs.openConversations} buyer ${obs.openConversations === 1 ? "conversation is" : "conversations are"} open in the queue.`
  );

  const offerBits: string[] = [];
  if (obs.openOffers > 0) {
    offerBits.push(
      `${obs.openOffers} ${obs.openOffers === 1 ? "thread has" : "threads have"} an offer on the table`
    );
  }
  if (obs.awaitingBuyer > 0) {
    offerBits.push(
      `${obs.awaitingBuyer} ${obs.awaitingBuyer === 1 ? "is" : "are"} on the buyer's court`
    );
  }
  if (offerBits.length > 0) {
    parts.push(`${offerBits.join(" and ")}.`);
  }

  if (obs.quietLong > 0 && obs.oldestQuietHours !== null) {
    const days = Math.round(obs.oldestQuietHours / 24);
    if (days >= 2) {
      parts.push(`The oldest quiet thread last moved about ${days} days ago.`);
    } else {
      parts.push(`The oldest quiet thread last moved over a day ago.`);
    }
  }

  return parts.join(" ");
}

export const BRIEFING_SYSTEM_PROMPT = `You write a short morning briefing for a sports card seller looking at their inbox.

Strict rules:
- Output 2 to 3 short sentences. Plain prose only. No lists, no headings, no labels.
- Describe what is happening in the queue. Do not tell the seller what to do.
- Forbidden words and phrases: "you should", "respond to", "reply to", "follow up", "counter", "accept", "decline", "send", "consider", "recommend", "best move", "next step", "make sure", "don't forget", "prioritize", "focus on".
- Do not include any specific dollar amounts, prices, or percentages.
- Do not name individual buyers unless one is the only relevant subject.
- Stay calm and observational. No urgency, no emoji, no exclamation marks.`;

export function buildBriefingUserPrompt(obs: BriefingObservations): string {
  return `Inbox snapshot:
- Open conversations: ${obs.openConversations}
- Threads where the buyer is waiting on the seller: ${obs.needsReply}
- Threads where the seller is waiting on the buyer: ${obs.awaitingBuyer}
- Threads with an open offer: ${obs.openOffers}
- Threads with new activity in the last 24 hours: ${obs.newToday}
- Threads quiet for more than 72 hours: ${obs.quietLong}
${obs.oldestQuietHours !== null ? `- Oldest quiet thread: about ${Math.round(obs.oldestQuietHours)} hours since last message` : ""}

Write the briefing now.`;
}
