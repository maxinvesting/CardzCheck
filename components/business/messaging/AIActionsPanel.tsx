"use client";

import { useEffect, useState } from "react";
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
  selectedAction: MarketplaceReplyAction;
  onSelectAction: (action: MarketplaceReplyAction) => void;
  onGenerateReply: (action: MarketplaceReplyAction, sellerNote?: string) => void;
  onUseDraft: (text: string) => void;
}

export default function AIActionsPanel({
  context,
  recommendation,
  draftResult,
  replyLoading,
  replyError,
  selectedAction,
  onSelectAction,
  onGenerateReply,
  onUseDraft,
}: Props) {
  const [copied, setCopied] = useState(false);
  const recommendedMeta = getMarketplaceReplyActionMeta(recommendation.action);
  const activeDraft =
    draftResult && draftResult.action === selectedAction ? draftResult : null;

  useEffect(() => {
    setCopied(false);
  }, [context.thread.id, activeDraft?.reply]);

  function handleActionClick(action: MarketplaceReplyAction) {
    onSelectAction(action);
    if (replyLoading) return;
    onGenerateReply(action);
  }

  async function handleCopy() {
    if (!activeDraft || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(activeDraft.reply);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-[var(--biz-border)] bg-white">
      <div className="border-b border-[var(--biz-border)] bg-[linear-gradient(135deg,#f5fbf7_0%,#ffffff_100%)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--biz-text)]">AI Sales Rep</h3>
            <p className="text-[11px] text-[var(--biz-muted)]">Suggests the next move</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
          Recommended move
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-full border border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--biz-primary)]">
            {recommendedMeta.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--biz-text)]" title={recommendation.headline}>
            {recommendation.headline}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--biz-muted)]">
          {recommendation.reason}
        </p>
      </div>

      <div className="border-t border-[var(--biz-border)] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
          Draft a reply
        </p>
        <div
          className="mt-2 grid"
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}
        >
          {VISIBLE_ACTIONS.map((action) => {
            const isRecommended = action.id === recommendation.action;
            const isSelected = action.id === selectedAction;
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
                  minHeight: 36,
                  padding: "6px 8px",
                  fontSize: 12,
                  lineHeight: 1.2,
                }}
                className={`flex items-center justify-center text-center rounded-lg border font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)] disabled:cursor-not-allowed disabled:opacity-60 ${styleClasses}`}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {replyError ? (
        <div className="mx-4 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {replyError}
        </div>
      ) : null}

      <div className="flex-1 border-t border-[var(--biz-border)] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
          Suggested draft
        </p>
        {replyLoading ? (
          <div className="mt-2 rounded-xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-3 text-[12px] text-[var(--biz-primary)]">
            Drafting reply…
          </div>
        ) : activeDraft ? (
          <div className="mt-2 space-y-2">
            <div className="rounded-xl border border-[var(--biz-border)] bg-[#FCFDFC] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--biz-text)] whitespace-pre-wrap">
              {activeDraft.reply}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onUseDraft(activeDraft.reply)}
                className="flex-1 rounded-lg bg-[var(--biz-primary)] px-3 py-2 text-[12px] font-semibold text-[var(--biz-primary-foreground)] shadow-[0_6px_14px_var(--biz-primary-border)] transition-colors hover:bg-[var(--biz-primary-hover)]"
              >
                Use draft
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-dashed border-[var(--biz-border)] bg-[#FCFDFC] px-3 py-3 text-[12px] text-[var(--biz-muted)]">
            Pick an action above to generate a draft reply.
          </div>
        )}
      </div>
    </aside>
  );
}
