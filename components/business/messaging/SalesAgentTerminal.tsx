"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { classifyThreadFromPreview } from "@/lib/messaging/reply-drafts";
import {
  buildPriorityRationale,
  isClosedSalesThread,
  isStaleSalesThread,
} from "./salesDealDesk";
import ConversationView from "./ConversationView";
import ConversationRow from "./ConversationRow";
import BatchReviewModal from "./BatchReviewModal";
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

type TerminalFilter = "needs_you" | "waiting" | "all";

const FILTERS: { key: TerminalFilter; label: string }[] = [
  { key: "needs_you", label: "Needs you" },
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All" },
];

type PlatformTab = "ebay" | "cardzcheck";

const PLATFORM_TABS: { key: PlatformTab; label: string }[] = [
  { key: "ebay", label: "eBay" },
  { key: "cardzcheck", label: "CardzCheck" },
];

function applyTerminalFilter(
  thread: MessageThread,
  filter: TerminalFilter,
  now: number,
  autoResolvedIds: Set<string>
): boolean {
  const isAutoResolved = autoResolvedIds.has(thread.id);
  switch (filter) {
    case "needs_you":
      if (isAutoResolved) return false;
      return (
        thread.status === "needs_response" ||
        thread.unread_count > 0 ||
        (isStaleSalesThread(thread, now) && !isClosedSalesThread(thread))
      );
    case "waiting":
      if (isAutoResolved) return false;
      return thread.status === "awaiting_buyer";
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

function dollarImpactCents(thread: MessageThread): number {
  return (
    thread.offer_amount_cents ??
    thread.suggested_counter_cents ??
    thread.listing_price_cents ??
    0
  );
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
  const [filter, setFilter] = useState<TerminalFilter>("needs_you");
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
  const [draftCache, setDraftCache] = useState<
    Map<string, MarketplaceReplyDraftResult>
  >(() => new Map());
  const [prewarming, setPrewarming] = useState<Set<string>>(() => new Set());
  const [activity, setActivity] = useState<
    Array<{ id: string; kind: "drafted" | "resolved" | "archived"; label: string; at: number }>
  >([]);
  const [batchOpen, setBatchOpen] = useState(false);

  const deferredQuery = useDeferredValue(searchQuery);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const pushActivity = useCallback(
    (entry: { id: string; kind: "drafted" | "resolved" | "archived"; label: string }) => {
      setActivity((prev) => {
        if (prev.some((e) => e.id === entry.id && e.kind === entry.kind)) return prev;
        const next = [{ ...entry, at: Date.now() }, ...prev];
        return next.slice(0, 8);
      });
    },
    []
  );

  const platformThreads = useMemo(
    () => allThreads.filter((t) => t.platform === platformTab),
    [allThreads, platformTab]
  );

  const autoResolvedMap = useMemo(() => {
    const map = new Map<string, { label: string; reason: "buyer_thanks" | "seller_quiet" }>();
    for (const t of allThreads) {
      const cls = classifyThreadFromPreview(t, now);
      if (cls.resolvable && cls.label && cls.reason) {
        map.set(t.id, { label: cls.label, reason: cls.reason });
      }
    }
    return map;
  }, [allThreads, now]);

  const autoResolvedIds = useMemo(
    () => new Set(autoResolvedMap.keys()),
    [autoResolvedMap]
  );

  const agentClearedCount = useMemo(() => {
    let n = 0;
    for (const t of allThreads) {
      if (autoResolvedIds.has(t.id) && t.platform === platformTab) n++;
    }
    return n;
  }, [allThreads, autoResolvedIds, platformTab]);

  const platformCounts = useMemo(() => {
    let ebay = 0;
    let cc = 0;
    for (const t of allThreads) {
      if (t.platform === "ebay") ebay++;
      else if (t.platform === "cardzcheck") cc++;
    }
    return { ebay, cardzcheck: cc };
  }, [allThreads]);

  const needsYouThreads = useMemo(() => {
    return platformThreads
      .filter((t) => applyTerminalFilter(t, "needs_you", now, autoResolvedIds))
      .sort((a, b) => {
        const rankDiff = priorityRank(a, now) - priorityRank(b, now);
        if (rankDiff !== 0) return rankDiff;
        return dollarImpactCents(b) - dollarImpactCents(a);
      });
  }, [platformThreads, autoResolvedIds, now]);

  const visibleThreads = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    let next = platformThreads.filter((thread) =>
      applyTerminalFilter(thread, filter, now, autoResolvedIds)
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
      const moneyDiff = dollarImpactCents(b) - dollarImpactCents(a);
      if (moneyDiff !== 0) return moneyDiff;
      return (
        new Date(b.last_message_at).getTime() -
        new Date(a.last_message_at).getTime()
      );
    });
    return next;
  }, [platformThreads, filter, deferredQuery, now]);

  const filterCounts = useMemo(() => {
    const counts: Record<TerminalFilter, number> = {
      needs_you: 0,
      waiting: 0,
      all: platformThreads.length,
    };
    for (const thread of platformThreads) {
      if (applyTerminalFilter(thread, "needs_you", now, autoResolvedIds))
        counts.needs_you++;
      if (applyTerminalFilter(thread, "waiting", now, autoResolvedIds))
        counts.waiting++;
    }
    return counts;
  }, [platformThreads, now, autoResolvedIds]);

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

  const draftCacheRef = useRef(draftCache);
  useEffect(() => {
    draftCacheRef.current = draftCache;
  }, [draftCache]);

  const loadThread = useCallback(
    async (threadId: string) => {
      setThreadLoading(true);
      setReplyError(null);
      setSendError(null);
      // Use any cached pre-warmed draft so the composer is filled immediately.
      const cached = draftCacheRef.current.get(threadId);
      setDraftResult(cached ?? null);
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
    },
    []
  );

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
        setDraftCache((prev) => {
          const next = new Map(prev);
          next.set(selectedId, data);
          return next;
        });
      } catch {
        setReplyError("Unable to draft right now. Please try again.");
      } finally {
        setReplyLoading(false);
      }
    },
    [selectedId]
  );

  const handleSendMessageById = useCallback(
    async (threadId: string, body: string) => {
      try {
        const res = await fetch(`/api/business/messages/${threadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        const sent = data.message as Message;
        applyThreadUpdate((t) =>
          t.id === threadId
            ? {
                ...t,
                last_message_preview: sent.body,
                last_message_at: sent.created_at,
                unread_count: 0,
                status: "awaiting_buyer",
              }
            : t
        );
        return true;
      } catch {
        return false;
      }
    },
    [applyThreadUpdate]
  );

  const handleCacheDraft = useCallback(
    (threadId: string, draft: MarketplaceReplyDraftResult) => {
      setDraftCache((prev) => {
        const next = new Map(prev);
        next.set(threadId, draft);
        return next;
      });
    },
    []
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

  // Emit activity entries when threads are auto-resolved by the agent.
  useEffect(() => {
    for (const [threadId, info] of autoResolvedMap) {
      const thread = allThreads.find((t) => t.id === threadId);
      if (!thread) continue;
      const buyer = thread.buyer_display_name ?? thread.buyer_username;
      pushActivity({
        id: threadId,
        kind: info.reason === "buyer_thanks" ? "resolved" : "archived",
        label:
          info.reason === "buyer_thanks"
            ? `Resolved ${buyer} · acknowledged`
            : `Archived ${buyer} · stale 7d+`,
      });
    }
  }, [autoResolvedMap, allThreads, pushActivity]);

  // Pre-warm drafts for the top Needs-you threads so opening them feels instant.
  useEffect(() => {
    const targets = needsYouThreads
      .filter((t) => t.platform === platformTab)
      .slice(0, 5)
      .filter((t) => !draftCache.has(t.id) && !prewarming.has(t.id));
    if (targets.length === 0) return;

    setPrewarming((prev) => {
      const next = new Set(prev);
      for (const t of targets) next.add(t.id);
      return next;
    });

    let cancelled = false;
    (async () => {
      for (const t of targets) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/business/messages/${t.id}/ai-reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "smart_reply" }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as MarketplaceReplyDraftResult;
          if (cancelled) return;
          setDraftCache((prev) => {
            const next = new Map(prev);
            next.set(t.id, data);
            return next;
          });
          const buyer = t.buyer_display_name ?? t.buyer_username;
          pushActivity({
            id: `draft-${t.id}`,
            kind: "drafted",
            label: `Drafted reply · ${buyer}`,
          });
        } catch {
          // ignore individual failures
        } finally {
          setPrewarming((prev) => {
            const next = new Set(prev);
            next.delete(t.id);
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsYouThreads, platformTab]);

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
      {/* Slim top bar — segmented filter + platform toggle + search */}
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
          {agentClearedCount > 0 ? (
            <span
              className="rounded-full border border-[var(--biz-automation-border)] bg-[var(--biz-automation-soft)] px-2 py-px text-[10px] font-semibold text-[var(--biz-automation)]"
              title="Threads the agent has cleared from your queue."
            >
              Agent cleared {agentClearedCount}
            </span>
          ) : null}
        </div>

        {/* Primary 3-segment filter */}
        <div
          className="flex items-center gap-0.5 rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] p-0.5"
          role="tablist"
          aria-label="Queue filter"
        >
          {FILTERS.map((tab) => {
            const isActive = filter === tab.key;
            const count = filterCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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

        {/* Compact platform toggle */}
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
                title={`${tab.label} (${count})`}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  isActive
                    ? "bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                    : "text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
                }`}
              >
                <span>{tab.key === "ebay" ? "eBay" : "CC"}</span>
                <span
                  className={`biz-mono text-[9px] tabular-nums ${
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
          {needsYouThreads.length > 0 ? (
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="rounded bg-[var(--biz-primary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
              title="Review queue with keyboard shortcuts"
            >
              Review {needsYouThreads.length}
            </button>
          ) : null}
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

      {/* Agent activity ticker */}
      {activity.length > 0 ? (
        <div className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-1">
          <span className="biz-mono shrink-0 text-[9px] uppercase tracking-[0.14em] text-[var(--biz-automation)]">
            Agent activity
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap">
            {activity.map((entry) => (
              <span
                key={`${entry.kind}-${entry.id}`}
                className="flex items-center gap-1 text-[11px] text-[var(--biz-muted-strong)]"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      entry.kind === "drafted"
                        ? "var(--biz-automation)"
                        : entry.kind === "resolved"
                          ? "var(--biz-profit, #4ade80)"
                          : "var(--biz-muted)",
                  }}
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

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
                      autoResolvedLabel={autoResolvedMap.get(thread.id)?.label ?? null}
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

      {batchOpen ? (
        <BatchReviewModal
          threads={needsYouThreads}
          draftCache={draftCache}
          onCacheDraft={handleCacheDraft}
          onSend={handleSendMessageById}
          onResolve={(id) => handleUpdateThreadStatus(id, "resolved")}
          onClose={() => setBatchOpen(false)}
        />
      ) : null}
    </div>
  );
}

