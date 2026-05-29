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
import type { MessagePlatform } from "@/lib/messaging/types";

const SECONDARY_ACTION_IDS: MarketplaceReplyAction[] = [
  "smart_reply",
  "counteroffer",
  "hold_firm",
  "decline",
  "accept_close",
  "ask_payment",
  "ask_time",
  "reengage",
];

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
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  useEffect(() => {
    if (draftResult && draftResult.action === selectedAction) {
      onReplyTextChange(draftResult.reply);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftResult]);

  const recommendedMeta = getMarketplaceReplyActionMeta(recommendation.action);
  const secondaryActions = MARKETPLACE_REPLY_ACTIONS.filter(
    (a) =>
      SECONDARY_ACTION_IDS.includes(a.id) && a.id !== recommendation.action
  );

  function handleActionClick(action: MarketplaceReplyAction) {
    onSelectAction(action);
    if (replyLoading) return;
    onGenerateReply(action);
  }

  const canSend = Boolean(replyText.trim()) && !sendLoading;
  const sendLabel =
    platform === "cardzcheck"
      ? "Send via CardzCheck"
      : platform === "ebay"
        ? "Send as seller via eBay"
        : "Send reply";

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--biz-primary-border)",
        background: "var(--biz-surface-soft)",
      }}
    >
      {/* Agent reasoning */}
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-automation)] font-mono-num">
              Agent recommends
            </span>
            <span className="text-[13px] font-semibold text-[var(--biz-text-strong)]">
              {recommendedMeta.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--biz-muted)]">
            {recommendation.reason}
          </p>
        </div>
      </div>

      {replyError ? (
        <div className="mt-2 rounded border border-[var(--biz-danger-border)] bg-[var(--biz-danger-soft)] px-2 py-1.5 text-[11px] text-[var(--biz-danger)]">
          {replyError}
        </div>
      ) : null}

      {/* Draft textarea — primary surface */}
      <div className="mt-2 rounded border border-[var(--biz-border)] bg-[var(--biz-bg)]">
        <textarea
          value={replyText}
          onChange={(event) => onReplyTextChange(event.target.value)}
          placeholder={
            replyLoading
              ? "Agent is drafting…"
              : "Agent will draft a reply when the thread opens. Edit or send."
          }
          rows={3}
          style={{ resize: "none" }}
          className="block w-full border-0 bg-transparent px-3 py-2 text-[13px] leading-relaxed text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:outline-none"
        />
      </div>

      {/* Primary CTA row */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void onSend()}
          disabled={!canSend}
          className="flex-1 rounded bg-[var(--biz-primary)] px-3 py-2 text-[12px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendLoading ? "Sending…" : `Send · ${recommendedMeta.label}`}
        </button>
        <button
          type="button"
          onClick={() => handleActionClick(recommendation.action)}
          disabled={replyLoading}
          title="Re-draft using the recommended action"
          className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-2 text-[11px] font-semibold text-[var(--biz-muted-strong)] transition-colors hover:border-[var(--biz-border-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {replyLoading ? "…" : "Re-draft"}
        </button>
      </div>

      <p className="mt-1 text-[10px] uppercase tracking-[0.10em] text-[var(--biz-faint)] font-mono-num">
        {sendLabel}
      </p>

      {/* Secondary actions — collapsed by default */}
      <div className="mt-2 border-t border-[var(--biz-border)] pt-2">
        <button
          type="button"
          onClick={() => setSecondaryOpen((v) => !v)}
          className="flex w-full items-center justify-between text-[11px] font-semibold text-[var(--biz-muted-strong)] hover:text-[var(--biz-text)]"
          aria-expanded={secondaryOpen}
        >
          <span>Other replies</span>
          <span aria-hidden className="transition-transform" style={{ transform: secondaryOpen ? "rotate(180deg)" : "none" }}>
            ▾
          </span>
        </button>
        {secondaryOpen ? (
          <div
            className="mt-2 grid gap-1.5"
            style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
          >
            {secondaryActions.map((action) => {
              const isSelected = action.id === selectedAction;
              const styleClasses = isSelected
                ? "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-text-strong)]"
                : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]";
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleActionClick(action.id)}
                  disabled={replyLoading}
                  title={action.description}
                  className={`min-w-0 truncate rounded border px-2 py-1.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--biz-focus)] disabled:cursor-not-allowed disabled:opacity-60 ${styleClasses}`}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {sendError ? (
        <p className="mt-1.5 text-[11px] text-[var(--biz-danger)]">{sendError}</p>
      ) : null}

      <p className="sr-only">Conversation stage: {context.stage}</p>
    </div>
  );
}
