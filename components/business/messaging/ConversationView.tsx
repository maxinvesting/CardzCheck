"use client";

import { useState } from "react";
import type { MessageThread, Message, NegotiationAnalysis } from "@/lib/messaging/types";
import NegotiationPanel from "./NegotiationPanel";
import AIActionsPanel from "./AIActionsPanel";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);

  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

interface Props {
  thread: MessageThread;
  messages: Message[];
  negotiation: NegotiationAnalysis | null;
  onGenerateReply: (tone: string) => void;
  generatedReply: string | null;
  replyLoading: boolean;
  onSendMessage: (body: string) => Promise<boolean>;
  sendLoading: boolean;
  sendError: string | null;
  onUpdateThreadStatus: (threadId: string, status: MessageThread["status"]) => void;
}

export default function ConversationView({
  thread,
  messages,
  negotiation,
  onGenerateReply,
  generatedReply,
  replyLoading,
  onSendMessage,
  sendLoading,
  sendError,
  onUpdateThreadStatus,
}: Props) {
  const [replyText, setReplyText] = useState("");
  const [showAI, setShowAI] = useState(false);

  function handleUseReply(text: string) {
    setReplyText(text);
    setShowAI(false);
  }

  async function handleSend() {
    const body = replyText.trim();
    if (!body || sendLoading) return;
    const ok = await onSendMessage(body);
    if (ok) {
      setReplyText("");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="border-b border-[var(--biz-border)] bg-gradient-to-r from-white to-emerald-50/60 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-[var(--biz-text)]">
                {thread.buyer_display_name ?? thread.buyer_username}
              </h2>
              <span className="text-[11px] text-[var(--biz-muted)]">
                @{thread.buyer_username}
              </span>
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-medium text-[var(--biz-muted)]">
                {thread.platform === "ebay" ? "eBay" : thread.platform}
              </span>
            </div>
            {thread.item_title && (
              <p className="mt-1 truncate text-xs text-[var(--biz-muted)]">
                Re: {thread.item_title}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onUpdateThreadStatus(thread.id, "resolved")}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Mark Resolved
            </button>
            <button
              type="button"
              onClick={() => onUpdateThreadStatus(thread.id, "archived")}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-[var(--biz-muted)] hover:bg-[#F9FAFB]"
            >
              Archive
            </button>
            <StatusChip status={thread.status} />
          </div>
        </div>
      </div>

      {/* Negotiation panel (for offer threads) */}
      {negotiation && (
        <NegotiationPanel analysis={negotiation} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#ecfdf5_0%,#ffffff_35%)] px-5 py-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                    isOutbound
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white"
                      : "border border-[var(--biz-border)] bg-white text-[var(--biz-text)]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-medium ${
                        isOutbound ? "text-white/70" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {isOutbound ? "You" : msg.sender_username}
                    </span>
                    <span
                      className={`text-[10px] ${
                        isOutbound ? "text-white/50" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Actions (expandable) */}
      {showAI && (
        <AIActionsPanel
          thread={thread}
          generatedReply={generatedReply}
          replyLoading={replyLoading}
          onGenerateReply={onGenerateReply}
          onUseReply={handleUseReply}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* Reply composer */}
      <div className="border-t border-[var(--biz-border)] bg-white px-5 py-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setShowAI(!showAI)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              showAI
                ? "bg-[var(--biz-primary)] text-white"
                : "border border-[var(--biz-border)] text-[var(--biz-muted)] hover:bg-[#F3F4F6] hover:text-[var(--biz-text)]"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Assist
          </button>
          {thread.ai_suggested_reply && !showAI && (
            <button
              type="button"
              onClick={() => handleUseReply(thread.ai_suggested_reply!)}
              className="text-[11px] text-[var(--biz-primary)] hover:underline"
            >
              Use suggested reply
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!replyText.trim() || sendLoading}
            className="self-end rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-40"
          >
            {sendLoading ? "Sending..." : "Send"}
          </button>
        </div>
        {sendError ? (
          <p className="mt-1.5 text-[11px] text-red-600">{sendError}</p>
        ) : (
          <p className="mt-1.5 text-[10px] text-[var(--biz-muted)]">
            Replies send directly when supported for this conversation type.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    needs_response: "bg-red-50 text-red-700 border-red-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    awaiting_buyer: "bg-amber-50 text-amber-700 border-amber-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    archived: "bg-gray-50 text-gray-500 border-gray-200",
  };
  const labels: Record<string, string> = {
    needs_response: "Needs Reply",
    open: "Open",
    awaiting_buyer: "Awaiting Buyer",
    resolved: "Resolved",
    archived: "Archived",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        styles[status] ?? styles.open
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
