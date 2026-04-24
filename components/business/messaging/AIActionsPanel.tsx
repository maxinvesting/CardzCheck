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
    <div className="rounded-[20px] border border-[var(--biz-border)] bg-[#FCFDFC] p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
          Suggested reply
        </span>
        <span className="text-[12px] font-semibold text-[var(--biz-primary)]">
          {recommendedMeta.label}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-[var(--biz-muted)]"
          title={recommendation.reason}
        >
          {recommendation.reason}
        </span>
      </div>

      <div
        className="mt-3 grid"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {VISIBLE_ACTIONS.map((action) => {
          const isRecommended = action.id === recommendation.action;
          const isSelected = action.id === selectedAction;
          const baseClasses =
            "flex items-center justify-center text-center rounded-lg border font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]";
          const styleClasses = isRecommended
            ? "border-[var(--biz-primary)] text-[var(--biz-primary)] bg-[var(--biz-primary-soft)] hover:bg-[var(--biz-primary-soft-strong)]"
            : isSelected
              ? "border-[var(--biz-text)]/40 bg-white text-[var(--biz-text)]"
              : "border-[var(--biz-border)] bg-white text-[var(--biz-muted)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]";
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action.id)}
              disabled={replyLoading}
              title={action.description}
              style={{
                minWidth: 0,
                minHeight: 44,
                padding: "6px 4px",
                fontSize: 11,
                lineHeight: 1.2,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
              className={`${baseClasses} ${styleClasses} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {action.label}
            </button>
          );
        })}
      </div>

      {replyError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {replyError}
        </div>
      ) : null}

      <div className="mt-3 rounded-[16px] border border-[var(--biz-border)] bg-white">
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
          className="block w-full border-0 bg-transparent px-3.5 py-2.5 text-sm leading-relaxed text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 border-t border-[var(--biz-border)] px-3.5 py-2">
          <span className="min-w-0 truncate text-[11px] text-[var(--biz-muted)]">
            Send as seller via eBay
          </span>
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={!canSend}
            className="flex-shrink-0 rounded-xl bg-[var(--biz-primary)] px-4 py-2 text-[13px] font-semibold text-[var(--biz-primary-foreground)] shadow-[0_8px_18px_var(--biz-primary-border)] transition-colors hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendLoading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {sendError ? (
        <p className="mt-2 text-[12px] text-red-600">{sendError}</p>
      ) : null}

      <p className="sr-only">Conversation stage: {context.stage}</p>
    </div>
  );
}
