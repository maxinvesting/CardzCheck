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

  // Auto-draft the recommended reply when the thread opens (or when messages
  // load and there's no draft yet). Makes the agent actually act on arrival.
  useEffect(() => {
    if (replyLoading) return;
    if (draftResult) return;
    if (replyText.trim()) return;
    if (messages.length === 0) return;
    if (thread.status === "resolved" || thread.status === "archived") return;
    onGenerateReply(recommendation.action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, messages.length]);

  async function handleSend() {
    const body = replyText.trim();
    if (!body || sendLoading) return;
    const ok = await onSendMessage(body);
    if (ok) {
      setReplyText("");
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--biz-bg)]">
      <div className="border-b border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[12px] font-semibold text-[var(--biz-primary)]">
            {getAvatarLabel(thread)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[14px] font-semibold text-[var(--biz-text-strong)]">
                {thread.buyer_display_name ?? thread.buyer_username}
              </h2>
              <span className="biz-mono text-[11px] text-[var(--biz-muted)]">
                @{thread.buyer_username}
              </span>
              <PlatformChip platform={thread.platform} />
              <StatusChip status={thread.status} />
              {thread.unread_count > 0 ? (
                <span className="rounded-sm border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--biz-warning)]">
                  {thread.unread_count} unread
                </span>
              ) : null}
            </div>
            {thread.item_title ? (
              <p
                className="mt-1 truncate text-[12px] font-medium text-[var(--biz-text)]"
                title={thread.item_title}
              >
                {thread.item_title}
              </p>
            ) : null}
            {thread.platform === "cardzcheck" &&
            (thread.inventory_item_id || thread.listing_price_cents) ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] biz-mono uppercase tracking-[0.10em] text-[var(--biz-muted)]">
                {thread.inventory_item_id ? (
                  <span className="rounded-sm border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-px text-[var(--biz-text)]">
                    Order #{thread.inventory_item_id.slice(0, 8)}
                  </span>
                ) : null}
                {thread.listing_price_cents != null ? (
                  <span>${(thread.listing_price_cents / 100).toFixed(2)}</span>
                ) : null}
              </p>
            ) : null}
            <p className="mt-0.5 text-[10px] text-[var(--biz-muted)] biz-mono uppercase tracking-[0.10em]">
              Updated {formatThreadTime(thread.last_message_at)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onUpdateThreadStatus(thread.id, "resolved")}
            className="ml-auto self-start rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--biz-text)] transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-hover)]"
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

      <div className="flex-1 overflow-y-auto bg-[var(--biz-bg)] px-3 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
          {messages.map((message) => {
            const isOutbound = message.direction === "outbound";
            return (
              <div
                key={message.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-md px-3 py-2 ${
                    isOutbound
                      ? "border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-text)]"
                      : "border border-[var(--biz-border)] bg-[var(--biz-surface)] text-[var(--biz-text)]"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span
                      className={`font-semibold uppercase tracking-[0.08em] ${
                        isOutbound ? "text-[var(--biz-primary)]" : "text-[var(--biz-muted)]"
                      }`}
                    >
                      {isOutbound ? "You" : message.sender_username}
                    </span>
                    <span className="biz-mono text-[var(--biz-faint)]">
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

      <div className="border-t border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2">
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
          platform={thread.platform}
        />
      </div>
    </div>
  );
}

function PlatformChip({ platform }: { platform: MessageThread["platform"] }) {
  return (
    <span className="rounded-sm border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.10em] text-[var(--biz-muted)]">
      {platform === "ebay" ? "eBay" : platform}
    </span>
  );
}

function StatusChip({ status }: { status: MessageThread["status"] }) {
  return (
    <span
      className={`rounded-sm border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] ${SALES_STATUS_STYLES[status]}`}
    >
      {SALES_STATUS_LABELS[status]}
    </span>
  );
}
