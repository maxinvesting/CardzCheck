"use client";

import { useEffect } from "react";
import {
  MARKETPLACE_REPLY_ACTIONS,
  getMarketplaceReplyActionMeta,
  type MarketplaceReplyAction,
  type MarketplaceReplyDraftResult,
  type MarketplaceReplyGenerationContext,
  type MarketplaceReplyRecommendation,
} from "@/lib/messaging/reply-drafts";
import type { MessagePlatform } from "@/lib/messaging/types";

const VISIBLE_ACTION_IDS: MarketplaceReplyAction[] = [
  "smart_reply",
  "counteroffer",
  "hold_firm",
  "decline",
  "accept_close",
  "ask_payment",
  "ask_time",
  "reengage",
];

const VISIBLE_ACTIONS = VISIBLE_ACTION_IDS.map((id) =>
  MARKETPLACE_REPLY_ACTIONS.find((action) => action.id === id)!
);

interface Props {
  context: MarketplaceReplyGenerationContext;
  recommendation: MarketplaceReplyRecommendation;
  draftResult: MarketplaceReplyDraftResult | null;
  replyLoading: boolean;
  replyError: string | null;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onGenerateReply: (action: MarketplaceReplyAction, sellerNote?: string) => void;
  onSend: () => void | Promise<void>;
  sendLoading: boolean;
  sendError: string | null;
  selectedAction: MarketplaceReplyAction;
  onSelectAction: (action: MarketplaceReplyAction) => void;
  platform?: MessagePlatform;
}

export default function AIActionsPanel({
  context,
  recommendation,
  draftResult,
  replyLoading,
  replyError,
  replyText,
  onReplyTextChange,
  onGenerateReply,
  onSend,
  sendLoading,
  sendError,
  selectedAction,
  onSelectAction,
  platform,
}: Props) {
  useEffect(() => {
    if (draftResult && draftResult.action === selectedAction) {
      onReplyTextChange(draftResult.reply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftResult]);

  const recommendedMeta = getMarketplaceReplyActionMeta(recommendation.action);

  function handleActionClick(action: MarketplaceReplyAction) {
    onSelectAction(action);
    if (replyLoading) return;
    onGenerateReply(action);
  }

  const canSend = Boolean(replyText.trim()) && !sendLoading;

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--biz-primary-border)",
        background: "var(--biz-surface-soft)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: "var(--biz-automation)" }}
          aria-hidden
        >
          <svg
            className="h-2.5 w-2.5 text-[var(--biz-primary-foreground)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"
            />
          </svg>
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-automation)] font-mono-num">
          Agent suggests
        </span>
        <span className="text-[13px] font-semibold text-[var(--biz-primary)]">
          {recommendedMeta.label}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-[var(--biz-muted)]"
          title={recommendation.reason}
        >
          {recommendation.reason}
        </span>
      </div>

      <div
        className="mt-2 grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {VISIBLE_ACTIONS.map((action) => {
          const isRecommended = action.id === recommendation.action;
          const isSelected = action.id === selectedAction;
          const baseClasses =
            "min-w-0 truncate rounded border px-2 py-1.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--biz-focus)]";
          const styleClasses = isRecommended
            ? "border-[var(--biz-primary)] text-[var(--biz-primary)] bg-[var(--biz-primary-soft)] hover:bg-[var(--biz-primary-soft-strong)]"
            : isSelected
              ? "border-[var(--biz-primary-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-text-strong)]"
              : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]";
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action.id)}
              disabled={replyLoading}
              title={action.description}
              className={`${baseClasses} ${styleClasses} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {action.label}
            </button>
          );
        })}
      </div>

      {replyError ? (
        <div className="mt-2 rounded border border-[var(--biz-danger-border)] bg-[var(--biz-danger-soft)] px-2 py-1.5 text-[11px] text-[var(--biz-danger)]">
          {replyError}
        </div>
      ) : null}

      <div className="mt-2 rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)]">
        <textarea
          value={replyText}
          onChange={(event) => onReplyTextChange(event.target.value)}
          placeholder={
            replyLoading
              ? "Drafting reply..."
              : "Write your reply, or pick an action above to draft one."
          }
          rows={3}
          style={{ resize: "none" }}
          className="block w-full border-0 bg-transparent px-3 py-2 text-[13px] leading-relaxed text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--biz-border)] px-3 py-1.5">
          <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-[var(--biz-muted)] font-mono-num">
            {platform === "cardzcheck"
              ? "Send via CardzCheck"
              : platform === "ebay"
                ? "Send as seller via eBay"
                : "Send reply"}
          </span>
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={!canSend}
            className="flex-shrink-0 rounded bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendLoading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {sendError ? (
        <p className="mt-1.5 text-[11px] text-[var(--biz-danger)]">{sendError}</p>
      ) : null}

      <p className="sr-only">Conversation stage: {context.stage}</p>
    </div>
  );
}
