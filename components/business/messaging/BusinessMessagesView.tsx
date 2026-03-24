"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  MessageThread,
  Message,
  MessagingStats,
  NegotiationAnalysis,
  ThreadFilter,
} from "@/lib/messaging/types";
import MessagingStatsBar from "./MessagingStatsBar";
import ThreadList from "./ThreadList";
import ConversationView from "./ConversationView";

interface Props {
  initialStats: MessagingStats;
  initialThreads: MessageThread[];
  businessName?: string | null;
}

export default function BusinessMessagesView({
  initialStats,
  initialThreads,
  businessName,
}: Props) {
  const [stats] = useState<MessagingStats>(initialStats);
  const [threads, setThreads] = useState<MessageThread[]>(initialThreads);
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreads[0]?.id ?? null
  );
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationAnalysis | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [replySource, setReplySource] = useState<"ai" | "fallback" | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "unread_first">("newest");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [listRefreshing, setListRefreshing] = useState(false);
  const selectedThreadMeta = useMemo(
    () => threads.find((thread) => thread.id === selectedId) ?? null,
    [threads, selectedId]
  );
  const visibleThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
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
  }, [threads, unreadOnly, searchQuery, sortMode, pinnedThreadIds]);

  // Load thread detail
  const loadThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    setGeneratedReply(null);
    setSendError(null);
    try {
      const res = await fetch(`/api/business/messages/${threadId}`);
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

  // Select thread
  const handleSelectThread = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMobileShowThread(true);
      loadThread(id);
    },
    [loadThread]
  );

  // Filter change
  const handleFilterChange = useCallback(
    async (f: ThreadFilter) => {
      setFilter(f);
      setSelectedId(null);
      setSelectedThread(null);
      setMessages([]);
      try {
        const res = await fetch(`/api/business/messages?filter=${f}`);
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads);
          const first = data.threads?.[0];
          if (first?.id) {
            setSelectedId(first.id);
            loadThread(first.id);
          }
        }
      } catch {
        // fail silently
      }
    },
    [loadThread]
  );

  const refreshThreadList = useCallback(async () => {
    setListRefreshing(true);
    try {
      const res = await fetch(`/api/business/messages?filter=${filter}`);
      if (!res.ok) return;
      const data = await res.json();
      setThreads(data.threads);
      const selectedStillExists = data.threads.some((thread: MessageThread) => thread.id === selectedId);
      if (!selectedStillExists && data.threads[0]?.id) {
        setSelectedId(data.threads[0].id);
        loadThread(data.threads[0].id);
      }
    } finally {
      setListRefreshing(false);
    }
  }, [filter, loadThread, selectedId]);

  const handleTogglePin = useCallback((threadId: string) => {
    setPinnedThreadIds((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    );
  }, []);

  const handleUpdateThreadStatus = useCallback(
    (threadId: string, status: MessageThread["status"]) => {
      setThreads((prev) =>
        prev.map((thread) => (thread.id === threadId ? { ...thread, status } : thread))
      );
      setSelectedThread((prev) => (prev && prev.id === threadId ? { ...prev, status } : prev));
    },
    []
  );

  // Generate AI reply
  const handleGenerateReply = useCallback(
    async (tone: string) => {
      if (!selectedId) return;
      setReplyLoading(true);
      setGeneratedReply(null);
      setReplySource(null);
      try {
        const res = await fetch(`/api/business/messages/${selectedId}/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone }),
        });
        if (res.ok) {
          const data = await res.json();
          setGeneratedReply(data.reply);
          setReplySource(data.source ?? null);
        }
      } catch {
        // fail silently
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
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === selectedId
              ? {
                  ...thread,
                  last_message_preview: sent.body,
                  last_message_at: sent.created_at,
                  unread_count: 0,
                }
              : thread
          )
        );
        return true;
      } catch {
        setSendError("Unable to send right now. Please try again.");
        return false;
      } finally {
        setSendLoading(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    if (initialThreads[0]?.id) {
      loadThread(initialThreads[0].id);
    }
  }, [initialThreads, loadThread]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--biz-border)] bg-gradient-to-r from-emerald-50 via-white to-cyan-50 px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--biz-text)]">
            Customer Service
          </h1>
          <p className="mt-0.5 text-sm text-[var(--biz-muted)]">
            Buyer support, offers, and follow-ups in one place
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700">
            Live Inbox
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <MessagingStatsBar stats={stats} loading={false} />

      {/* Assistant disclosure */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-xs text-emerald-800">
            <span className="font-semibold">AI handles the drafting — you handle the sending.</span>
            {" "}Open any conversation and click <span className="font-medium">AI Reply Assistant</span> to generate context-aware replies. Review, edit if needed, then send.
          </p>
        </div>
      </div>

      {/* Outlook-style control row */}
      <div className="rounded-2xl border border-[var(--biz-border)] bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--biz-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by buyer, listing, or message"
              className="w-full rounded-lg border border-[var(--biz-border)] bg-[#FCFCFC] py-2 pl-9 pr-3 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
            />
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as "newest" | "oldest" | "unread_first")}
            className="rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-sm text-[var(--biz-text)] focus:border-[var(--biz-primary)] focus:outline-none"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="unread_first">Sort: Unread First</option>
          </select>
          <button
            type="button"
            onClick={() => setUnreadOnly((prev) => !prev)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              unreadOnly
                ? "bg-emerald-600 text-white"
                : "border border-[var(--biz-border)] text-[var(--biz-text)] hover:bg-[#F9FAFB]"
            }`}
          >
            Unread Only
          </button>
          <button
            type="button"
            onClick={refreshThreadList}
            className="rounded-lg border border-[var(--biz-border)] px-3 py-2 text-sm font-medium text-[var(--biz-text)] hover:bg-[#F9FAFB]"
          >
            {listRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Main inbox layout */}
      <div
        className="overflow-hidden rounded-2xl border border-[var(--biz-border)] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]"
        style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
      >
        <div className="flex h-full">
          {/* Thread list (left panel) */}
          <div
            className={`h-full w-full border-r border-[var(--biz-border)] lg:w-[360px] lg:block ${
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

          {/* Conversation view (right panel) */}
          <div
            className={`h-full flex-1 lg:block ${
              mobileShowThread ? "block" : "hidden"
            }`}
          >
            {threadLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-6 w-6 animate-spin text-[var(--biz-muted)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="mt-2 text-xs text-[var(--biz-muted)]">Loading conversation...</p>
                </div>
              </div>
            ) : selectedThread ? (
              <>
                {/* Mobile back button */}
                <div className="border-b border-[var(--biz-border)] px-3 py-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    className="flex items-center gap-1 text-xs text-[var(--biz-primary)] font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Inbox
                  </button>
                </div>
                <ConversationView
                  thread={selectedThreadMeta ?? selectedThread}
                  messages={messages}
                  negotiation={negotiation}
                  onGenerateReply={handleGenerateReply}
                  generatedReply={generatedReply}
                  replySource={replySource}
                  replyLoading={replyLoading}
                  onSendMessage={handleSendMessage}
                  sendLoading={sendLoading}
                  sendError={sendError}
                  onUpdateThreadStatus={handleUpdateThreadStatus}
                  businessName={businessName}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-10 w-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="mt-3 text-sm text-[var(--biz-muted)]">Select a conversation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
