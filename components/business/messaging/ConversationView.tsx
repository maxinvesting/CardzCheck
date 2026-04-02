"use client";

import React, { useState } from "react";
import type { MessageThread, Message, NegotiationAnalysis } from "@/lib/messaging/types";
import type {
  MarketplaceReplyAction,
  MarketplaceReplyDraftResult,
  MarketplaceReplyRecommendation,
} from "@/lib/messaging/reply-drafts";
import {
  createMarketplaceReplyContext,
  describeConversationStage,
  recommendMarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";
import NegotiationPanel from "./NegotiationPanel";
import AIActionsPanel from "./AIActionsPanel";

const IMAGE_URL_RE = /https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff?)(?:\?\S*)?/gi;

function MessageBody({ body, isOutbound }: { body: string; isOutbound: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  IMAGE_URL_RE.lastIndex = 0;
  while ((match = IMAGE_URL_RE.exec(body)) !== null) {
    if (match.index > last) {
      parts.push(
        <span key={last} className="whitespace-pre-wrap">
          {body.slice(last, match.index)}
        </span>
      );
    }
    const url = match[0];
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt="Attached image"
          className="mt-2 max-w-full rounded-lg border border-black/10"
          style={{ maxHeight: 300 }}
          onError={(e) => {
            // If image fails to load, show as a plain link instead
            const el = e.currentTarget;
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = url;
            link.className = isOutbound ? "underline text-white/80" : "underline text-emerald-700";
            el.parentElement?.replaceChild(link, el);
          }}
        />
      </a>
    );
    last = match.index + url.length;
  }
  if (last < body.length) {
    parts.push(
      <span key={last} className="whitespace-pre-wrap">
        {body.slice(last)}
      </span>
    );
  }
  return <div className="text-sm leading-relaxed">{parts.length ? parts : body}</div>;
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatThreadTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const time = formatMessageTime(iso);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

function getAvatarLabel(thread: MessageThread): string {
  const value = thread.buyer_display_name ?? thread.buyer_username ?? "?";
  return value.slice(0, 1).toUpperCase();
}

interface Props {
  thread: MessageThread;
  messages: Message[];
  negotiation: NegotiationAnalysis | null;
  onGenerateReply: (action: MarketplaceReplyAction, sellerNote?: string) => void;
  draftResult: MarketplaceReplyDraftResult | null;
  replyLoading: boolean;
  replyError: string | null;
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
  draftResult,
  replyLoading,
  replyError,
  onSendMessage,
  sendLoading,
  sendError,
  onUpdateThreadStatus,
}: Props) {
  const [replyText, setReplyText] = useState("");

  const replyContext = useMemo(
    () =>
      createMarketplaceReplyContext({
        thread,
        messages,
        negotiation,
      }),
    [thread, messages, negotiation]
  );
  const recommendation: MarketplaceReplyRecommendation =
    draftResult?.recommendation ?? recommendMarketplaceReplyAction(replyContext);

  useEffect(() => {
    setReplyText("");
  }, [thread.id]);

  async function handleSend() {
    const body = replyText.trim();
    if (!body || sendLoading) return;
    const ok = await onSendMessage(body);
    if (ok) {
      setReplyText("");
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#FCFDFC]">
      <div className="border-b border-[var(--biz-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f5fbf7_65%,#eef8fb_100%)] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-sm font-semibold text-emerald-700">
                {getAvatarLabel(thread)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-[var(--biz-text)]">
                    {thread.buyer_display_name ?? thread.buyer_username}
                  </h2>
                  <span className="text-[12px] text-[var(--biz-muted)]">
                    @{thread.buyer_username}
                  </span>
                  <PlatformChip platform={thread.platform} />
                  <StatusChip status={thread.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--biz-muted)]">
                  <span>{describeConversationStage(replyContext.stage)}</span>
                  <span>Updated {formatThreadTime(thread.last_message_at)}</span>
                  {thread.unread_count > 0 ? (
                    <span className="font-medium text-[#B45309]">
                      {thread.unread_count} unread
                    </span>
                  ) : null}
                </div>
                {thread.item_title ? (
                  <p className="mt-3 max-w-3xl text-sm font-medium leading-snug text-[var(--biz-text)]">
                    {thread.item_title}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateThreadStatus(thread.id, "resolved")}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Mark resolved
            </button>
            <button
              type="button"
              onClick={() => onUpdateThreadStatus(thread.id, "archived")}
              className="rounded-xl border border-[var(--biz-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--biz-muted)] transition-colors hover:bg-[#F8FAFC]"
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      <NegotiationPanel
        thread={thread}
        negotiation={negotiation}
        recommendation={recommendation}
      />

      <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#effaf4_0%,#ffffff_38%)] px-5 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message) => {
            const isOutbound = message.direction === "outbound";
            return (
              <div
                key={message.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-[22px] px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ${
                    isOutbound
                      ? "border border-emerald-200 bg-[#EAF8F1] text-[var(--biz-text)]"
                      : "border border-[var(--biz-border)] bg-white text-[var(--biz-text)]"
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                    <span
                      className={`font-semibold ${
                        isOutbound ? "text-emerald-700" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {isOutbound ? "You" : message.sender_username}
                    </span>
                    <span className="text-[var(--biz-muted)]">
                      {formatThreadTime(message.created_at)}
                    </span>
                  </div>
                  <MessageBody body={msg.body} isOutbound={isOutbound} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--biz-border)] bg-white px-5 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <AIActionsPanel
            context={replyContext}
            recommendation={recommendation}
            draftResult={draftResult}
            replyLoading={replyLoading}
            replyError={replyError}
            onGenerateReply={onGenerateReply}
            onInsertReply={(text) => setReplyText(text)}
          />

          <div className="rounded-[24px] border border-[var(--biz-border)] bg-[#FCFCFD] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
                  Reply
                </p>
                <h3 className="text-sm font-semibold text-[var(--biz-text)]">
                  Send as seller
                </h3>
              </div>
              {draftResult ? (
                <button
                  type="button"
                  onClick={() => setReplyText(draftResult.reply)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Load latest draft
                </button>
              ) : null}
            </div>

            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Write the final message you'll send to the buyer."
              rows={8}
              className="mt-4 w-full resize-none rounded-[18px] border border-[var(--biz-border)] bg-white px-3.5 py-3 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-[var(--biz-muted)]">
                Review and edit anything you want before it goes out.
              </p>
              <button
                type="button"
                onClick={handleSend}
                disabled={!replyText.trim() || sendLoading}
                className="rounded-xl bg-[linear-gradient(135deg,#18a06f_0%,#117d58_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(17,125,88,0.24)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sendLoading ? "Sending..." : "Send reply"}
              </button>
            </div>

            {sendError ? (
              <p className="mt-2 text-[12px] text-red-600">{sendError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformChip({ platform }: { platform: MessageThread["platform"] }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {platform === "ebay" ? "eBay" : platform}
    </span>
  );
}

function StatusChip({ status }: { status: MessageThread["status"] }) {
  const styles: Record<MessageThread["status"], string> = {
    needs_response: "border-amber-200 bg-amber-50 text-amber-700",
    open: "border-blue-200 bg-blue-50 text-blue-700",
    awaiting_buyer: "border-violet-200 bg-violet-50 text-violet-700",
    resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    archived: "border-slate-200 bg-slate-100 text-slate-500",
  };
  const labels: Record<MessageThread["status"], string> = {
    needs_response: "Needs reply",
    open: "Open",
    awaiting_buyer: "Awaiting buyer",
    resolved: "Resolved",
    archived: "Archived",
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
