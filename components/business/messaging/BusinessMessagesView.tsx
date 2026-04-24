"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
  type ReactNode,
} from "react";
import { formatPrice } from "@/lib/pricing";
import type {
  MessageThread,
  Message,
  MessagingStats,
  NegotiationAnalysis,
  ThreadFilter,
} from "@/lib/messaging/types";
import type {
  MarketplaceReplyDraftResult,
  MarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";
import ThreadList from "./ThreadList";
import ConversationView from "./ConversationView";
import {
  buildSalesDealDeskSnapshot,
  isStaleSalesThread,
  matchesThreadFilter,
} from "./salesDealDesk";

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

type SortMode = "newest" | "oldest" | "unread_first";

function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return formatPrice(cents / 100);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function threadTitle(thread: MessageThread): string {
  return thread.item_title?.trim() || "Untitled listing";
}

function threadBuyer(thread: MessageThread): string {
  return thread.buyer_display_name ?? thread.buyer_username;
}

export default function BusinessMessagesView({
  initialStats,
  initialThreads,
  businessName,
  initialSyncRetriedAfterEmpty = false,
}: Props) {
  const [stats, setStats] = useState<MessagingStats>(initialStats);
  const [threads, setThreads] = useState<MessageThread[]>(initialThreads);
  const [allThreads, setAllThreads] = useState<MessageThread[]>(initialThreads);
  const [filter, setFilter] = useState<ThreadFilter>("all");
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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [syncRetriedAfterEmpty, setSyncRetriedAfterEmpty] = useState(
    initialSyncRetriedAfterEmpty
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const selectedThreadMeta = useMemo(
    () => allThreads.find((thread) => thread.id === selectedId) ?? null,
    [allThreads, selectedId]
  );

  const dealDesk = useMemo(
    () => buildSalesDealDeskSnapshot(allThreads),
    [allThreads]
  );

  const visibleThreads = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    let next = [...threads];
    if (unreadOnly) {
      next = next.filter((thread) => thread.unread_count > 0);
    }
    if (query) {
      next = next.filter((thread) => {
        const buyer = `${thread.buyer_display_name ?? ""} ${thread.buyer_username}`.toLowerCase();
        const title = (thread.item_title ?? "").toLowerCase();
        const preview = (thread.last_message_preview ?? "").toLowerCase();
        return buyer.includes(query) || title.includes(query) || preview.includes(query);
      });
    }

    const byDate = (a: MessageThread, b: MessageThread) =>
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    if (sortMode === "oldest") {
      next.sort((a, b) => -byDate(a, b));
    } else if (sortMode === "unread_first") {
      next.sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (a.unread_count === 0 && b.unread_count > 0) return 1;
        return byDate(a, b);
      });
    } else {
      next.sort(byDate);
    }

    next.sort((a, b) => {
      const aPinned = pinnedThreadIds.includes(a.id);
      const bPinned = pinnedThreadIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
    return next;
  }, [threads, unreadOnly, deferredSearchQuery, sortMode, pinnedThreadIds]);

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
      // fail silently
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const loadThreadCollection = useCallback(async (nextFilter: ThreadFilter) => {
    try {
      const res = await fetch(`/api/business/messages?filter=${nextFilter}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as ThreadCollectionResponse;
    } catch {
      return null;
    }
  }, []);

  const applyThreadUpdate = useCallback(
    (
      updater: (thread: MessageThread) => MessageThread,
      nextFilter = filter
    ) => {
      setThreads((prev) =>
        prev
          .map((thread) => updater(thread))
          .filter((thread) => matchesThreadFilter(thread, nextFilter))
      );
      setAllThreads((prev) => prev.map((thread) => updater(thread)));
    },
    [filter]
  );

  const handleSelectThread = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileShowThread(true);
      loadThread(id);
    },
    [loadThread]
  );

  const handleJumpToThread = useCallback(
    (id: string) => {
      setFilter("all");
      setThreads(allThreads);
      handleSelectThread(id);
    },
    [allThreads, handleSelectThread]
  );

  const handleFilterChange = useCallback(
    async (nextFilter: ThreadFilter) => {
      setFilter(nextFilter);
      setSelectedId(null);
      setSelectedThread(null);
      setMessages([]);
      const data = await loadThreadCollection(nextFilter);
      if (data) {
        setThreads(data.threads);
        setSyncRetriedAfterEmpty(Boolean(data.sync?.retriedAfterEmpty));
        if (nextFilter === "all") {
          setAllThreads(data.threads);
          setStats(data.stats);
        } else {
          void loadThreadCollection("all").then((allData) => {
            if (!allData) return;
            setAllThreads(allData.threads);
            setStats(allData.stats);
          });
        }
        const first = data.threads?.[0];
        if (first?.id) {
          setSelectedId(first.id);
          loadThread(first.id);
        }
      }
    },
    [loadThread, loadThreadCollection]
  );

  const refreshThreadList = useCallback(async () => {
    setListRefreshing(true);
    try {
      const [currentData, allData] = await Promise.all([
        loadThreadCollection(filter),
        filter === "all" ? Promise.resolve(null) : loadThreadCollection("all"),
      ]);
      if (!currentData) return;
      setThreads(currentData.threads);
      setSyncRetriedAfterEmpty(Boolean(currentData.sync?.retriedAfterEmpty));

      const latestAll = filter === "all" ? currentData : allData;
      if (latestAll) {
        setAllThreads(latestAll.threads);
        setStats(latestAll.stats);
      }

      const selectedStillExists = currentData.threads.some(
        (thread) => thread.id === selectedId
      );
      if (!selectedStillExists && currentData.threads[0]?.id) {
        setSelectedId(currentData.threads[0].id);
        loadThread(currentData.threads[0].id);
      }
    } finally {
      setListRefreshing(false);
    }
  }, [filter, loadThread, loadThreadCollection, selectedId]);

  const handleTogglePin = useCallback((threadId: string) => {
    setPinnedThreadIds((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    );
  }, []);

  const handleUpdateThreadStatus = useCallback(
    (threadId: string, status: MessageThread["status"]) => {
      applyThreadUpdate(
        (thread) => (thread.id === threadId ? { ...thread, status } : thread)
      );
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
        applyThreadUpdate((thread) =>
          thread.id === selectedId
            ? {
                ...thread,
                last_message_preview: sent.body,
                last_message_at: sent.created_at,
                unread_count: 0,
              }
            : thread
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

  const greetingName =
    businessName?.trim() || "your shop";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-[var(--biz-border)] bg-[radial-gradient(circle_at_top_left,rgba(46,160,103,0.22)_0%,rgba(255,255,255,0.98)_42%,rgba(245,250,247,0.98)_100%)] shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 lg:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--biz-primary-border)] bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-primary)]">
                <span className="h-2 w-2 rounded-full bg-[var(--biz-primary)]" />
                Live deal desk
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--biz-text)] sm:text-4xl">
                Sales
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--biz-muted)] sm:text-[15px]">
                Run active offers, follow up with quiet buyers, and close more deals for{" "}
                <span className="font-semibold text-[var(--biz-text)]">{greetingName}</span>.
                Closed sale records still live in Ledger, but this workspace is for the live buyer pipeline.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/business/ledger?tab=sales"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--biz-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
              >
                Open ledger sales
              </a>
              <button
                type="button"
                onClick={refreshThreadList}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--biz-primary)] px-4 py-2 text-sm font-semibold text-[var(--biz-primary-foreground)] shadow-[0_12px_30px_var(--biz-primary-border)] transition-colors hover:bg-[var(--biz-primary-hover)]"
              >
                {listRefreshing ? "Refreshing..." : "Refresh live feed"}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SalesMetricCard
              label="Open deals"
              value={dealDesk.openDealCount.toString()}
              tone="neutral"
              detail={`${stats.total_threads} buyer threads synced`}
            />
            <SalesMetricCard
              label="Active offers"
              value={dealDesk.activeOfferThreads.length.toString()}
              tone="positive"
              detail={`${formatMoney(dealDesk.pipelineOfferValueCents)} live offer value`}
            />
            <SalesMetricCard
              label="Needs action"
              value={dealDesk.needsReplyThreads.length.toString()}
              tone="warning"
              detail="buyers waiting on your move"
            />
            <SalesMetricCard
              label="Stale follow-ups"
              value={dealDesk.staleThreads.length.toString()}
              tone="neutral"
              detail={`${dealDesk.awaitingBuyerCount} awaiting buyer`}
            />
            <SalesMetricCard
              label="Unread buyers"
              value={dealDesk.unreadThreads.length.toString()}
              tone="danger"
              detail="new activity to triage"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <SalesQueueCard
          title="Active offers"
          description="Highest-signal buyer threads with real numbers on the table."
          count={dealDesk.activeOfferThreads.length}
          tone="positive"
          emptyLabel="No active offers are live right now."
        >
          {dealDesk.activeOfferThreads.slice(0, 3).map((thread) => (
            <QueueThreadRow
              key={thread.id}
              thread={thread}
              metaLabel={`Offer ${formatMoney(thread.offer_amount_cents)}`}
              onOpen={() => handleJumpToThread(thread.id)}
            />
          ))}
        </SalesQueueCard>

        <SalesQueueCard
          title="Needs reply"
          description="Conversations that are still warm and need a seller move."
          count={dealDesk.needsReplyThreads.length}
          tone="warning"
          emptyLabel="Nothing is waiting on you at the moment."
        >
          {dealDesk.needsReplyThreads.slice(0, 3).map((thread) => (
            <QueueThreadRow
              key={thread.id}
              thread={thread}
              metaLabel={`${thread.unread_count} unread`}
              onOpen={() => handleJumpToThread(thread.id)}
            />
          ))}
        </SalesQueueCard>

        <SalesQueueCard
          title="Re-engage buyers"
          description="Quiet threads worth nudging before the buyer disappears."
          count={dealDesk.staleThreads.length}
          tone="neutral"
          emptyLabel="No stale follow-ups need a nudge."
        >
          {dealDesk.staleThreads.slice(0, 3).map((thread) => (
            <QueueThreadRow
              key={thread.id}
              thread={thread}
              metaLabel={
                isStaleSalesThread(thread)
                  ? `Quiet since ${relativeTime(thread.last_message_at)}`
                  : "Monitor"
              }
              onOpen={() => handleJumpToThread(thread.id)}
            />
          ))}
        </SalesQueueCard>
      </section>

      <div className="rounded-2xl border border-[var(--biz-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f9fcfa_100%)] px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)]">
              Operating note
            </p>
            <p className="mt-1 text-sm text-[var(--biz-text)]">
              Use this desk for live buyers and negotiation flow. Use{" "}
              <a
                href="/business/ledger?tab=sales"
                className="font-semibold text-[var(--biz-primary)] underline decoration-[var(--biz-primary-border)] underline-offset-4"
              >
                Ledger &rarr; Sales
              </a>{" "}
              for transaction edits, history, and reporting.
            </p>
          </div>
          {syncRetriedAfterEmpty ? (
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
              Inbox sync retried automatically. Refresh if something still looks off.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--biz-border)] bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--biz-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search buyers, cards, or recent messages"
              className="w-full rounded-lg border border-[var(--biz-border)] bg-[#FCFCFC] py-2 pl-9 pr-3 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
            />
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-sm text-[var(--biz-text)] focus:border-[var(--biz-primary)] focus:outline-none"
          >
            <option value="newest">Sort: Newest activity</option>
            <option value="oldest">Sort: Oldest activity</option>
            <option value="unread_first">Sort: Unread first</option>
          </select>
          <button
            type="button"
            onClick={() => setUnreadOnly((prev) => !prev)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              unreadOnly
                ? "bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                : "border border-[var(--biz-border)] text-[var(--biz-text)] hover:bg-[var(--biz-hover)]"
            }`}
          >
            Unread only
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[28px] border border-[var(--biz-border)] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
        style={{ height: "calc(100vh - 510px)", minHeight: "620px" }}
      >
        <div className="flex h-full">
          <div
            className={`h-full w-full border-r border-[var(--biz-border)] bg-[#FBFCFD] lg:w-[360px] lg:block ${
              mobileShowThread ? "hidden" : "block"
            }`}
          >
            <ThreadList
              threads={visibleThreads}
              selectedId={selectedId}
              filter={filter}
              pinnedThreadIds={pinnedThreadIds}
              onSelectThread={handleSelectThread}
              onFilterChange={handleFilterChange}
              onTogglePin={handleTogglePin}
            />
          </div>

          <div
            className={`h-full flex-1 lg:block ${
              mobileShowThread ? "block" : "hidden"
            }`}
          >
            {threadLoading ? (
              <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#effaf4_0%,#ffffff_45%)]">
                <div className="text-center">
                  <svg className="mx-auto h-6 w-6 animate-spin text-[var(--biz-muted)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="mt-2 text-xs text-[var(--biz-muted)]">Loading deal thread...</p>
                </div>
              </div>
            ) : selectedThread ? (
              <>
                <div className="border-b border-[var(--biz-border)] px-3 py-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    className="flex items-center gap-1 text-xs font-medium text-[var(--biz-primary)]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to sales queue
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
              </>
            ) : (
              <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#effaf4_0%,#ffffff_46%)] px-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]">
                    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <p className="mt-4 text-base font-semibold text-[var(--biz-text)]">
                    Pick a buyer thread
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--biz-muted)]">
                    Open any offer, follow-up, or buyer question to draft a reply and move the deal forward.
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

function SalesMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-600"
          : "text-[var(--biz-text)]";

  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[12px] text-[var(--biz-muted)]">{detail}</p>
    </div>
  );
}

function SalesQueueCard({
  title,
  description,
  count,
  tone,
  emptyLabel,
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone: "positive" | "warning" | "neutral";
  emptyLabel: string;
  children: ReactNode;
}) {
  const accentClass =
    tone === "positive"
      ? "from-emerald-50 to-white text-emerald-700 border-emerald-100"
      : tone === "warning"
        ? "from-amber-50 to-white text-amber-700 border-amber-100"
        : "from-slate-50 to-white text-slate-700 border-slate-200";

  return (
    <section className="rounded-[24px] border border-[var(--biz-border)] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
      <div className={`rounded-t-[24px] border-b bg-gradient-to-br px-4 py-4 ${accentClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--biz-muted)]">{description}</p>
          </div>
          <div className="rounded-full border border-current/15 bg-white px-3 py-1 text-sm font-semibold tabular-nums">
            {count}
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        {count === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--biz-border)] bg-[#FBFCFD] px-4 py-5 text-sm text-[var(--biz-muted)]">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function QueueThreadRow({
  thread,
  metaLabel,
  onOpen,
}: {
  thread: MessageThread;
  metaLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-[var(--biz-border)] bg-[#FCFDFC] px-4 py-3 text-left transition-colors hover:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--biz-text)]">
            {threadBuyer(thread)}
          </p>
          <p className="mt-1 truncate text-[12px] text-[var(--biz-muted)]">
            {threadTitle(thread)}
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[var(--biz-muted)]">
          {relativeTime(thread.last_message_at)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--biz-primary)]">
          {metaLabel}
        </span>
        {thread.unread_count > 0 ? (
          <span className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
            {thread.unread_count} unread
          </span>
        ) : null}
      </div>
    </button>
  );
}
