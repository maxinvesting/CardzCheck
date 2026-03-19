"use client";

import { useState, useCallback } from "react";
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
  isDemo: boolean;
}

export default function BusinessMessagesView({
  initialStats,
  initialThreads,
  isDemo: initialIsDemo,
}: Props) {
  const [stats] = useState<MessagingStats>(initialStats);
  const [threads, setThreads] = useState<MessageThread[]>(initialThreads);
  const [isDemo, setIsDemo] = useState(initialIsDemo);
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreads[0]?.id ?? null
  );
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [negotiation, setNegotiation] = useState<NegotiationAnalysis | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Load thread detail
  const loadThread = useCallback(async (threadId: string) => {
    setThreadLoading(true);
    setGeneratedReply(null);
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
      try {
        const res = await fetch(`/api/business/messages?filter=${f}`);
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads);
          if (typeof data.isDemo === "boolean") setIsDemo(data.isDemo);
        }
      } catch {
        // fail silently
      }
    },
    []
  );

  // Generate AI reply
  const handleGenerateReply = useCallback(
    async (tone: string) => {
      if (!selectedId) return;
      setReplyLoading(true);
      setGeneratedReply(null);
      try {
        const res = await fetch(`/api/business/messages/${selectedId}/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tone }),
        });
        if (res.ok) {
          const data = await res.json();
          setGeneratedReply(data.reply);
        }
      } catch {
        // fail silently
      } finally {
        setReplyLoading(false);
      }
    },
    [selectedId]
  );

  // Auto-load first thread
  useState(() => {
    if (initialThreads[0]) {
      loadThread(initialThreads[0].id);
    }
  });

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--biz-text)]">Messages</h1>
          <p className="mt-0.5 text-sm text-[var(--biz-muted)]">
            Customer support &amp; buyer communication
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
              Demo Mode
            </span>
          )}
          {!isDemo && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              Live
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <MessagingStatsBar stats={stats} loading={false} />

      {/* Main inbox layout */}
      <div
        className="overflow-hidden rounded-xl border border-[var(--biz-border)] bg-white"
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
              threads={threads}
              selectedId={selectedId}
              filter={filter}
              onSelectThread={handleSelectThread}
              onFilterChange={handleFilterChange}
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
                  thread={selectedThread}
                  messages={messages}
                  negotiation={negotiation}
                  onGenerateReply={handleGenerateReply}
                  generatedReply={generatedReply}
                  replyLoading={replyLoading}
                  isDemo={isDemo}
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
