"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MARKETPLACE_REPLY_ACTIONS,
  getMarketplaceReplyActionMeta,
  type MarketplaceReplyAction,
  type MarketplaceReplyDraftResult,
  type MarketplaceReplyGenerationContext,
  type MarketplaceReplyRecommendation,
} from "@/lib/messaging/reply-drafts";

interface Props {
  context: MarketplaceReplyGenerationContext;
  recommendation: MarketplaceReplyRecommendation;
  draftResult: MarketplaceReplyDraftResult | null;
  replyLoading: boolean;
  replyError: string | null;
  onGenerateReply: (action: MarketplaceReplyAction, sellerNote?: string) => void;
  onInsertReply: (text: string) => void;
}

export default function AIActionsPanel({
  context,
  recommendation,
  draftResult,
  replyLoading,
  replyError,
  onGenerateReply,
  onInsertReply,
}: Props) {
  const [selectedAction, setSelectedAction] = useState<MarketplaceReplyAction>(
    recommendation.action
  );
  const [sellerNote, setSellerNote] = useState("");
  const [draftEditorText, setDraftEditorText] = useState("");
  const [showSellerNote, setShowSellerNote] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeDraft = useMemo(
    () =>
      draftResult && draftResult.action === selectedAction ? draftResult : null,
    [draftResult, selectedAction]
  );

  useEffect(() => {
    setSelectedAction(recommendation.action);
    setSellerNote("");
    setShowSellerNote(false);
    setCopied(false);
  }, [context.thread.id, recommendation.action]);

  useEffect(() => {
    setDraftEditorText(activeDraft?.reply ?? "");
  }, [activeDraft]);

  async function handleCopyDraft() {
    if (!draftEditorText.trim()) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(draftEditorText.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const selectedActionMeta = getMarketplaceReplyActionMeta(selectedAction);

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--biz-border)] bg-[#FCFDFC] p-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
            Suggested Reply
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-[var(--biz-text)]">
              {recommendation.headline}
            </h3>
            <span className="text-[11px] text-[var(--biz-muted)]">
              {selectedActionMeta.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onGenerateReply(selectedAction, sellerNote)}
          disabled={replyLoading}
          className="rounded-xl bg-[var(--biz-primary)] px-3.5 py-2 text-[12px] font-semibold text-[var(--biz-primary-foreground)] shadow-[0_10px_24px_var(--biz-primary-border)] transition-colors hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {replyLoading ? "Drafting..." : activeDraft ? "Regenerate" : "Generate draft"}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--biz-muted)]">
        {recommendation.reason}
      </p>

      <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
        {MARKETPLACE_REPLY_ACTIONS.map((action) => {
          const isActive = action.id === selectedAction;
          const isRecommended = action.id === recommendation.action;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedAction(action.id)}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]"
                  : "border-[var(--biz-border)] bg-white text-[var(--biz-muted)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
              }`}
            >
              {isRecommended ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--biz-primary)]" />
              ) : null}
              {action.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSellerNote((current) => !current)}
          className="rounded-full border border-[var(--biz-border)] bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--biz-muted)] transition-colors hover:bg-[var(--biz-hover)]"
        >
          {showSellerNote ? "Hide note" : "Add note"}
        </button>
        {activeDraft ? (
          <span className="text-[11px] text-[var(--biz-muted)]">
            {activeDraft.source === "ai" ? "Draft ready" : "Quick template ready"}
          </span>
        ) : null}
      </div>

      {showSellerNote ? (
        <input
          value={sellerNote}
          onChange={(event) => setSellerNote(event.target.value)}
          placeholder="Optional note: shipping timing, price floor, bundle detail..."
          className="mt-2 w-full rounded-[14px] border border-[var(--biz-border)] bg-white px-3 py-2 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
        />
      ) : null}

      {replyError ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {replyError}
        </div>
      ) : null}

      {replyLoading ? (
        <div className="mt-3 rounded-[18px] border border-[var(--biz-primary-border)] bg-white px-3.5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--biz-primary-soft)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--biz-text)]">Building draft</p>
              <p className="text-[11px] text-[var(--biz-primary)]">
                Pulling in the thread and your selected move.
              </p>
            </div>
          </div>
        </div>
      ) : activeDraft ? (
        <div className="mt-3 rounded-[18px] border border-[var(--biz-border)] bg-white">
          <textarea
            value={draftEditorText}
            onChange={(event) => setDraftEditorText(event.target.value)}
            rows={3}
            className="min-h-[96px] w-full resize-y border-0 bg-transparent px-3.5 py-3 text-sm leading-relaxed text-[var(--biz-text)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--biz-border)] px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => onInsertReply(draftEditorText.trim())}
              disabled={!draftEditorText.trim()}
              className="rounded-xl bg-[var(--biz-primary)] px-3 py-2 text-[12px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Use draft
            </button>
            <button
              type="button"
              onClick={handleCopyDraft}
              className="rounded-xl border border-[var(--biz-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[18px] border border-dashed border-[var(--biz-border)] bg-white px-3.5 py-3">
          <p className="text-[12px] text-[var(--biz-muted)]">
            Generate a draft when you want a quick starting point.
          </p>
        </div>
      )}
    </div>
  );
}
