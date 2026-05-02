"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
} from "react";
import { formatPrice } from "@/lib/pricing";
import type {
  MessageThread,
  Message,
  MessagingStats,
  NegotiationAnalysis,
} from "@/lib/messaging/types";
import type {
  MarketplaceReplyDraftResult,
  MarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";
import {
  buildSalesDealDeskSnapshot,
  buildPriorityRationale,
  isClosedSalesThread,
  isStaleSalesThread,
} from "./salesDealDesk";
import { buildBriefingObservations } from "@/lib/messaging/briefing";
import ConversationView from "./ConversationView";
import ConversationRow from "./ConversationRow";
import AgentBriefing from "./AgentBriefing";
import PriorityRationalePanel from "./PriorityRationalePanel";
import MetricCard from "@/components/business/ui/MetricCard";
import StatusPill from "@/components/business/ui/StatusPill";

interface Props {
  initialStats: MessagingStats;
  initialThreads: MessageThread[];
  businessName?: string | null;
  initialSyncRetriedAfterEmpty?: boolean;
}

interface ThreadCollectionResponse {
  stats: MessagingStats;
  threads: MessageThread[];
  sync?: {
    retriedAfterEmpty?: boolean;
  };
}

type TerminalFilter =
  | "all"
  | "needs_action"
  | "offers"
  | "stale"
  | "awaiting_buyer"
  | "resolved";

const FILTERS: { key: TerminalFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Needs action" },
  { key: "offers", label: "Offers" },
  { key: "stale", label: "Stale" },
  { key: "awaiting_buyer", label: "Awaiting buyer" },
  { key: "resolved", label: "Resolved" },
];

function applyTerminalFilter(
  thread: MessageThread,
  filter: TerminalFilter,
  now: number
): boolean {
  switch (filter) {
    case "needs_action":
      return thread.status === "needs_response" || thread.unread_count > 0;
    case "offers":
      return (
        thread.category === "offer" ||
        typeof thread.offer_amount_cents === "number"
      );
    case "stale":
      return isStaleSalesThread(thread, now) && !isClosedSalesThread(thread);
    case "awaiting_buyer":
      return thread.status === "awaiting_buyer";
    case "resolved":
      return thread.status === "resolved" || thread.status === "archived";
    case "all":
    default:
      return true;
  }
}

function priorityRank(thread: MessageThread, now: number): number {
  const r = buildPriorityRationale(thread, now);
  switch (r.level) {
    case "urgent":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    default:
      return 3;
  }
}

export default function SalesAgentTerminal({
  initialStats,
  initialThreads,
  businessName,
  initialSyncRetriedAfterEmpty = false,
}: Props) {
  const [stats, setStats] = useState<MessagingStats>(initialStats);
  const [allThreads, setAllThreads] = useState<MessageThread[]>(initialThreads);
  const [filter, setFilter] = useState<TerminalFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreads[0]?.id ?? null
  );
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationAnalysis | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draftResult, setDraftResult] =
    useState<MarketplaceReplyDraftResult | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [syncRetriedAfterEmpty, setSyncRetriedAfterEmpty] = useState(
    initialSyncRetriedAfterEmpty
  );
  const [briefingSource, setBriefingSource] = useState<"ai" | "fallback">("fallback");
  const [briefingLoading, setBriefingLoading] = useState(false);

  const deferredQuery = useDeferredValue(searchQuery);
  const now = Date.now();

  const observations = useMemo(
    () => buildBriefingObservations(allThreads),
    [allThreads]
  );

  const desk = useMemo(
    () => buildSalesDealDeskSnapshot(allThreads, now),
    [allThreads, now]
  );

  const visibleThreads = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    let next = allThreads.filter((thread) =>
      applyTerminalFilter(thread, filter, now)
    );
    if (query) {
      next = next.filter((thread) => {
        const buyer = `${thread.buyer_display_name ?? ""} ${thread.buyer_username}`.toLowerCase();
        const title = (thread.item_title ?? "").toLowerCase();
        const preview = (thread.last_message_preview ?? "").toLowerCase();
        return (
          buyer.includes(query) || title.includes(query) || preview.includes(query)
        );
      });
    }
    next.sort((a, b) => {
      const rankDiff = priorityRank(a, now) - priorityRank(b, now);
      if (rankDiff !== 0) return rankDiff;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });
    return next;
  }, [allThreads, filter, deferredQuery, now]);

  const filterCounts = useMemo(() => {
    const counts: Record<TerminalFilter, number> = {
      all: allThreads.length,
      needs_action: 0,
      offers: 0,
      stale: 0,
      awaiting_buyer: 0,
      resolved: 0,
    };
    for (const thread of allThreads) {
      if (applyTerminalFilter(thread, "needs_action", now)) counts.needs_action++;
      if (applyTerminalFilter(thread, "offers", now)) counts.offers++;
      if (applyTerminalFilter(thread, "stale", now)) counts.stale++;
      if (applyTerminalFilter(thread, "awaiting_buyer", now)) counts.awaiting_buyer++;
      if (applyTerminalFilter(thread, "resolved", now)) counts.resolved++;
    }
    return counts;
  }, [allThreads, now]);

  const selectedThreadMeta = useMemo(
    () => allThreads.find((t) => t.id === selectedId) ?? null,
    [allThreads, selectedId]
  );

  const totalActionableValueCents = useMemo(() => {
    return desk.activeOfferThreads.reduce(
      (sum, t) => sum + (t.offer_amount_cents ?? 0),
      0
    );
  }, [desk.activeOfferThreads]);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch(`/api/business/sales/briefing`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { source?: "ai" | "fallback" };
      if (data?.source) setBriefingSource(data.source);
    } catch {
      // ignore
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    setDraftResult(null);
    setReplyError(null);
    setSendError(null);
    try {
      const res = await fetch(`/api/business/messages/${threadId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedThread(data.thread);
        setMessages(data.messages);
        setNegotiation(data.negotiation);
      }
    } catch {
      // ignore
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const loadAllThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/business/messages?filter=all`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as ThreadCollectionResponse;
    } catch {
      return null;
    }
  }, []);

  const applyThreadUpdate = useCallback(
    (updater: (thread: MessageThread) => MessageThread) => {
      setAllThreads((prev) => prev.map((thread) => updater(thread)));
    },
    []
  );

  const handleSelectThread = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileShowThread(true);
      loadThread(id);
    },
    [loadThread]
  );

  const refreshThreadList = useCallback(async () => {
    setListRefreshing(true);
    void fetchBriefing();
    try {
      const data = await loadAllThreads();
      if (!data) return;
      setAllThreads(data.threads);
      setStats(data.stats);
      setSyncRetriedAfterEmpty(Boolean(data.sync?.retriedAfterEmpty));
      const stillExists = data.threads.some((t) => t.id === selectedId);
      if (!stillExists && data.threads[0]?.id) {
        setSelectedId(data.threads[0].id);
        loadThread(data.threads[0].id);
      }
    } finally {
      setListRefreshing(false);
    }
  }, [fetchBriefing, loadAllThreads, loadThread, selectedId]);

  const handleUpdateThreadStatus = useCallback(
    (threadId: string, status: MessageThread["status"]) => {
      applyThreadUpdate((t) => (t.id === threadId ? { ...t, status } : t));
      setSelectedThread((prev) =>
        prev && prev.id === threadId ? { ...prev, status } : prev
      );
    },
    [applyThreadUpdate]
  );

  const handleGenerateReply = useCallback(
    async (action: MarketplaceReplyAction, sellerNote?: string) => {
      if (!selectedId) return;
      setReplyLoading(true);
      setDraftResult(null);
      setReplyError(null);
      try {
        const res = await fetch(`/api/business/messages/${selectedId}/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            sellerNote: sellerNote?.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setReplyError(data.error ?? "Couldn't generate a draft right now.");
          return;
        }
        const data = (await res.json()) as MarketplaceReplyDraftResult;
        setDraftResult(data);
      } catch {
        setReplyError("Unable to draft right now. Please try again.");
      } finally {
        setReplyLoading(false);
      }
    },
    [selectedId]
  );

  const handleSendMessage = useCallback(
    async (body: string) => {
      if (!selectedId) return false;
      setSendLoading(true);
      setSendError(null);
      try {
        const res = await fetch(`/api/business/messages/${selectedId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSendError(data.error ?? "Failed to send message.");
          return false;
        }
        const data = await res.json();
        const sent = data.message as Message;
        setMessages((prev) => [...prev, sent]);
        applyThreadUpdate((t) =>
          t.id === selectedId
            ? {
                ...t,
                last_message_preview: sent.body,
                last_message_at: sent.created_at,
                unread_count: 0,
              }
            : t
        );
        return true;
      } catch {
        setSendError("Unable to send right now. Please try again.");
        return false;
      } finally {
        setSendLoading(false);
      }
    },
    [applyThreadUpdate, selectedId]
  );

  useEffect(() => {
    if (initialThreads[0]?.id) {
      loadThread(initialThreads[0].id);
    }
  }, [initialThreads, loadThread]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const greetingName = businessName?.trim() || "Operator";

  const actionableValueDisplay =
    totalActionableValueCents > 0
      ? formatPrice(totalActionableValueCents / 100)
      : "Value unavailable";

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden px-3 py-3">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)] font-mono-num">
            Sales Agent
          </p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-[var(--biz-text-strong)] sm:text-[22px]">
            Sales Agent Terminal
          </h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[var(--biz-muted)]">
            Prioritize buyer conversations, revive stale deals, and move inventory faster.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {syncRetriedAfterEmpty ? (
            <StatusPill tone="warning">Sync retried automatically</StatusPill>
          ) : null}
          <a
            href="/business/ledger?tab=sales"
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-text)] transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-hover)]"
          >
            Open ledger sales
          </a>
        </div>
      </header>

      {/* Top stat row */}
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Open conversations"
          value={observations.openConversations.toString()}
          hint="active in queue"
        />
        <MetricCard
          label="Awaiting your reply"
          value={observations.needsReply.toString()}
          tone={observations.needsReply > 0 ? "warning" : "neutral"}
          hint="buyer is waiting"
        />
        <MetricCard
          label="Open offers"
          value={observations.openOffers.toString()}
          tone={observations.openOffers > 0 ? "primary" : "neutral"}
          hint="negotiation active"
        />
        <MetricCard
          label="Quiet over 72h"
          value={observations.quietLong.toString()}
          tone={observations.quietLong > 0 ? "danger" : "neutral"}
          hint="at risk of going cold"
        />
        <MetricCard
          label="Action value"
          value={actionableValueDisplay}
          tone={totalActionableValueCents > 0 ? "profit" : "muted"}
          hint={
            totalActionableValueCents > 0
              ? "sum of open offers"
              : "no open offers tracked"
          }
        />
      </div>

      {/* Briefing */}
      <div className="shrink-0">
        <AgentBriefing
          observations={observations}
          source={briefingSource}
          loading={briefingLoading}
          onRefresh={refreshThreadList}
          refreshing={listRefreshing || briefingLoading}
          greetingName={greetingName}
        />
      </div>

      {/* Filter / search bar */}
      <div className="shrink-0 rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((tab) => {
              const isActive = filter === tab.key;
              const count = filterCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                      : "text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`biz-mono text-[10px] tabular-nums ${
                      isActive
                        ? "text-[var(--biz-primary-foreground)]/80"
                        : "text-[var(--biz-faint)]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[280px]">
            <svg
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--biz-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search buyer, card, or message"
              className="w-full rounded border border-[var(--biz-border)] bg-[var(--biz-bg)] py-1.5 pl-7 pr-2 text-[12px] text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary-border)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-focus)]"
            />
          </div>
        </div>
      </div>

      {/* Main terminal layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--biz-border)] bg-[var(--biz-bg)]">
        <div className="flex h-full w-full">
          {/* Queue column */}
          <div
            className={`h-full w-full border-r border-[var(--biz-border)] bg-[var(--biz-surface)] lg:w-[340px] lg:block ${
              mobileShowThread ? "hidden" : "block"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--biz-border)] px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
                  Queue · {visibleThreads.length}
                </p>
                <span className="biz-mono text-[10px] text-[var(--biz-faint)]">
                  Sorted by priority
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {visibleThreads.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[12px] text-[var(--biz-muted)]">
                    No threads match this view.
                  </div>
                ) : (
                  visibleThreads.map((thread) => (
                    <ConversationRow
                      key={thread.id}
                      thread={thread}
                      selected={thread.id === selectedId}
                      onSelect={handleSelectThread}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Conversation detail + side rail */}
          <div
            className={`h-full flex-1 lg:block ${
              mobileShowThread ? "block" : "hidden"
            }`}
          >
            {threadLoading ? (
              <div className="flex h-full items-center justify-center bg-[var(--biz-bg)]">
                <div className="text-center">
                  <svg
                    className="mx-auto h-5 w-5 animate-spin text-[var(--biz-muted)]"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <p className="mt-2 text-[11px] text-[var(--biz-muted)]">
                    Loading thread…
                  </p>
                </div>
              </div>
            ) : selectedThread ? (
              <div className="flex h-full">
                <div className="flex h-full min-w-0 flex-1 flex-col">
                  <div className="border-b border-[var(--biz-border)] px-3 py-2 lg:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileShowThread(false)}
                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--biz-primary)]"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Back to queue
                    </button>
                  </div>
                  <ConversationView
                    thread={selectedThreadMeta ?? selectedThread}
                    messages={messages}
                    negotiation={negotiation}
                    onGenerateReply={handleGenerateReply}
                    draftResult={draftResult}
                    replyLoading={replyLoading}
                    replyError={replyError}
                    onSendMessage={handleSendMessage}
                    sendLoading={sendLoading}
                    sendError={sendError}
                    onUpdateThreadStatus={handleUpdateThreadStatus}
                  />
                </div>
                <aside className="hidden h-full w-[280px] shrink-0 overflow-y-auto border-l border-[var(--biz-border)] bg-[var(--biz-surface)] xl:block">
                  <div className="space-y-3 px-3 py-3">
                    <PriorityRationalePanel
                      thread={selectedThreadMeta ?? selectedThread}
                    />
                    <div className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface-soft)]">
                      <div className="border-b border-[var(--biz-border)] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
                          Queue context
                        </p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-2 gap-y-2 px-3 py-2 text-[11px]">
                        <DataRow
                          label="In queue"
                          value={observations.openConversations.toString()}
                        />
                        <DataRow
                          label="Needs you"
                          value={observations.needsReply.toString()}
                          tone={observations.needsReply > 0 ? "warning" : "neutral"}
                        />
                        <DataRow
                          label="Open offers"
                          value={observations.openOffers.toString()}
                          tone={observations.openOffers > 0 ? "primary" : "neutral"}
                        />
                        <DataRow
                          label="Stale 72h+"
                          value={observations.quietLong.toString()}
                          tone={observations.quietLong > 0 ? "danger" : "neutral"}
                        />
                      </dl>
                    </div>
                    <div className="rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2 text-[11px] text-[var(--biz-muted)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
                        Cadence
                      </p>
                      <p className="mt-1">
                        Median response:{" "}
                        <span className="biz-mono text-[var(--biz-text)]">
                          {stats.avg_response_time_hours != null
                            ? `${stats.avg_response_time_hours.toFixed(1)}h`
                            : "—"}
                        </span>
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--biz-bg)] px-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] text-[var(--biz-muted)]">
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                      />
                    </svg>
                  </div>
                  <p className="mt-3 text-[13px] font-semibold text-[var(--biz-text)]">
                    Pick a conversation
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--biz-muted)]">
                    Select a thread from the queue to draft a reply and move the deal forward.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "primary" | "danger";
}) {
  const valueClass =
    tone === "warning"
      ? "text-[var(--biz-warning)]"
      : tone === "primary"
        ? "text-[var(--biz-primary)]"
        : tone === "danger"
          ? "text-[var(--biz-danger)]"
          : "text-[var(--biz-text)]";
  return (
    <>
      <dt className="text-[var(--biz-muted)]">{label}</dt>
      <dd className={`biz-mono text-right text-[12px] font-semibold ${valueClass}`}>
        {value}
      </dd>
    </>
  );
}
