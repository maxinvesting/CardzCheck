"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useDeferredValue,
} from "react";
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
  buildPriorityRationale,
  isClosedSalesThread,
  isStaleSalesThread,
} from "./salesDealDesk";
import ConversationView from "./ConversationView";
import ConversationRow from "./ConversationRow";
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

type PlatformTab = "ebay" | "cardzcheck";

const PLATFORM_TABS: { key: PlatformTab; label: string }[] = [
  { key: "ebay", label: "eBay" },
  { key: "cardzcheck", label: "CardzCheck" },
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
  void initialStats;
  void businessName;
  const [, setStats] = useState<MessagingStats>(initialStats);
  const [allThreads, setAllThreads] = useState<MessageThread[]>(initialThreads);
  const [platformTab, setPlatformTab] = useState<PlatformTab>("ebay");
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
  const [briefingLoading, setBriefingLoading] = useState(false);

  const deferredQuery = useDeferredValue(searchQuery);
  const now = Date.now();

  const platformThreads = useMemo(
    () => allThreads.filter((t) => t.platform === platformTab),
    [allThreads, platformTab]
  );

  const platformCounts = useMemo(() => {
    let ebay = 0;
    let cc = 0;
    for (const t of allThreads) {
      if (t.platform === "ebay") ebay++;
      else if (t.platform === "cardzcheck") cc++;
    }
    return { ebay, cardzcheck: cc };
  }, [allThreads]);

  const visibleThreads = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    let next = platformThreads.filter((thread) =>
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
  }, [platformThreads, filter, deferredQuery, now]);

  const filterCounts = useMemo(() => {
    const counts: Record<TerminalFilter, number> = {
      all: platformThreads.length,
      needs_action: 0,
      offers: 0,
      stale: 0,
      awaiting_buyer: 0,
      resolved: 0,
    };
    for (const thread of platformThreads) {
      if (applyTerminalFilter(thread, "needs_action", now)) counts.needs_action++;
      if (applyTerminalFilter(thread, "offers", now)) counts.offers++;
      if (applyTerminalFilter(thread, "stale", now)) counts.stale++;
      if (applyTerminalFilter(thread, "awaiting_buyer", now)) counts.awaiting_buyer++;
      if (applyTerminalFilter(thread, "resolved", now)) counts.resolved++;
    }
    return counts;
  }, [platformThreads, now]);

  const selectedThreadMeta = useMemo(
    () => allThreads.find((t) => t.id === selectedId) ?? null,
    [allThreads, selectedId]
  );

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const res = await fetch(`/api/business/sales/briefing`, { cache: "no-store" });
      if (!res.ok) return;
      await res.json();
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
      const res = await fetch(`/api/business/messages?filter=all&platform=all`, {
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

  // On initial mount fetch ALL platforms so the tabs show real counts.
  useEffect(() => {
    void refreshThreadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the platform tab changes, re-anchor the selection to the first
  // thread in the newly-visible queue.
  useEffect(() => {
    const stillInTab = allThreads.find(
      (t) => t.id === selectedId && t.platform === platformTab
    );
    if (stillInTab) return;
    const first = allThreads.find((t) => t.platform === platformTab);
    if (first) {
      setSelectedId(first.id);
      loadThread(first.id);
    } else {
      setSelectedId(null);
      setSelectedThread(null);
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformTab]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--biz-bg)]"
      style={{
        // Strip color from all biz-* tokens used inside the terminal
        ["--biz-primary" as string]: "#ffffff",
        ["--biz-primary-hover" as string]: "#e6e6e6",
        ["--biz-primary-soft" as string]: "rgba(255,255,255,0.06)",
        ["--biz-primary-soft-strong" as string]: "rgba(255,255,255,0.12)",
        ["--biz-primary-border" as string]: "rgba(255,255,255,0.20)",
        ["--biz-primary-foreground" as string]: "#000000",
        ["--biz-automation" as string]: "#cfcfcf",
        ["--biz-automation-soft" as string]: "rgba(255,255,255,0.06)",
        ["--biz-automation-border" as string]: "rgba(255,255,255,0.18)",
        ["--biz-warning" as string]: "#d6d6d6",
        ["--biz-warning-soft" as string]: "rgba(255,255,255,0.06)",
        ["--biz-warning-border" as string]: "rgba(255,255,255,0.16)",
        ["--biz-danger" as string]: "#e8e8e8",
        ["--biz-danger-soft" as string]: "rgba(255,255,255,0.08)",
        ["--biz-danger-border" as string]: "rgba(255,255,255,0.20)",
        ["--biz-profit" as string]: "#ffffff",
        ["--biz-profit-soft" as string]: "rgba(255,255,255,0.06)",
        ["--biz-info" as string]: "#c8c8c8",
        ["--biz-info-soft" as string]: "rgba(255,255,255,0.05)",
        ["--biz-info-border" as string]: "rgba(255,255,255,0.16)",
        ["--biz-gold" as string]: "#ffffff",
        ["--biz-gold-glow" as string]: "rgba(255,255,255,0.05)",
        ["--biz-focus" as string]: "rgba(255,255,255,0.25)",
      } as Record<string, string>}
    >
      {/* Slim top bar — filter pills + search + refresh */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: "var(--biz-automation-soft, rgba(110,180,255,0.12))" }}
            aria-hidden
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--biz-automation)" }}
            />
          </span>
          <h1 className="text-[13px] font-semibold tracking-tight text-[var(--biz-text-strong)]">
            Sales Agent
          </h1>
          {syncRetriedAfterEmpty ? (
            <StatusPill tone="warning">Sync retried</StatusPill>
          ) : null}
        </div>

        {/* Platform tabs */}
        <div
          className="flex items-center gap-0.5 rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] p-0.5"
          role="tablist"
          aria-label="Messaging platform"
        >
          {PLATFORM_TABS.map((tab) => {
            const isActive = platformTab === tab.key;
            const count = platformCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setPlatformTab(tab.key)}
                className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
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

        <div className="relative ml-auto flex items-center gap-2">
          <div className="relative w-[220px]">
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
              placeholder="Search"
              className="w-full rounded border border-[var(--biz-border)] bg-[var(--biz-bg)] py-1 pl-7 pr-2 text-[12px] text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary-border)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-focus)]"
            />
          </div>
          <button
            type="button"
            onClick={refreshThreadList}
            disabled={listRefreshing || briefingLoading}
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--biz-text)] transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh feed"
          >
            {listRefreshing || briefingLoading ? "…" : "Refresh"}
          </button>
          <a
            href="/business/ledger?tab=sales"
            className="text-[11px] font-medium text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
          >
            Ledger →
          </a>
        </div>
      </header>

      {/* Main two-pane layout: queue | conversation+agent */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full w-full">
          {/* Queue column */}
          <div
            className={`h-full w-full border-r border-[var(--biz-border)] bg-[var(--biz-surface)] lg:w-[320px] lg:block ${
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

