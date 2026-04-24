"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { MessageThread, Message, NegotiationAnalysis } from "@/lib/messaging/types";
import type {
  MarketplaceReplyAction,
  MarketplaceReplyDraftResult,
  MarketplaceReplyRecommendation,
} from "@/lib/messaging/reply-drafts";
import {
  createMarketplaceReplyContext,
  recommendMarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";
import NegotiationPanel from "./NegotiationPanel";
import AIActionsPanel from "./AIActionsPanel";
import { SALES_STATUS_LABELS, SALES_STATUS_STYLES } from "./salesDealDesk";

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

  const [selectedAction, setSelectedAction] = useState<MarketplaceReplyAction>(
    recommendation.action
  );

  useEffect(() => {
    setReplyText("");
    setSelectedAction(recommendation.action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="border-b border-[var(--biz-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f5fbf7_65%,#eef8fb_100%)] px-5 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-sm font-semibold text-[var(--biz-primary)]">
            {getAvatarLabel(thread)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center"
              style={{ flexWrap: "wrap", gap: 8 }}
            >
              <h2 className="text-base font-semibold text-[var(--biz-text)]">
                {thread.buyer_display_name ?? thread.buyer_username}
              </h2>
              <span className="text-[12px] text-[var(--biz-muted)]">
                @{thread.buyer_username}
              </span>
              <PlatformChip platform={thread.platform} />
              <StatusChip status={thread.status} />
              {thread.unread_count > 0 ? (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#B45309]">
                  {thread.unread_count} unread
                </span>
              ) : null}
            </div>
            {thread.item_title ? (
              <p
                className="mt-1 text-sm font-medium text-[var(--biz-text)]"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={thread.item_title}
              >
                {thread.item_title}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-[var(--biz-muted)]">
              Updated {formatThreadTime(thread.last_message_at)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onUpdateThreadStatus(thread.id, "resolved")}
            style={{ flexShrink: 0 }}
            className="ml-auto self-start rounded-xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-primary)] transition-colors hover:bg-[var(--biz-primary-soft-strong)]"
          >
            Resolve
          </button>
        </div>
      </div>

      <NegotiationPanel
        thread={thread}
        negotiation={negotiation}
        recommendation={recommendation}
      />

      <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#effaf4_0%,#ffffff_38%)] px-5 py-4">
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
                      ? "border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-text)]"
                      : "border border-[var(--biz-border)] bg-white text-[var(--biz-text)]"
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px]">
                    <span
                      className={`font-semibold ${
                        isOutbound ? "text-[var(--biz-primary)]" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {isOutbound ? "You" : message.sender_username}
                    </span>
                    <span className="text-[var(--biz-muted)]">
                      {formatThreadTime(message.created_at)}
                    </span>
                  </div>
                  <MessageBody body={message.body} isOutbound={isOutbound} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--biz-border)] bg-white px-5 py-3">
        <AIActionsPanel
          context={replyContext}
          recommendation={recommendation}
          draftResult={draftResult}
          replyLoading={replyLoading}
          replyError={replyError}
          replyText={replyText}
          onReplyTextChange={setReplyText}
          onGenerateReply={onGenerateReply}
          onSend={handleSend}
          sendLoading={sendLoading}
          sendError={sendError}
          selectedAction={selectedAction}
          onSelectAction={setSelectedAction}
        />
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
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SALES_STATUS_STYLES[status]}`}
    >
      {SALES_STATUS_LABELS[status]}
    </span>
  );
}
