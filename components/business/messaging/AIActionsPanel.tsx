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
  const [copied, setCopied] = useState(false);

  const activeDraft = useMemo(
    () =>
      draftResult && draftResult.action === selectedAction ? draftResult : null,
    [draftResult, selectedAction]
  );

  useEffect(() => {
    setSelectedAction(recommendation.action);
    setSellerNote("");
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
    <div className="rounded-[24px] border border-[var(--biz-border)] bg-[linear-gradient(180deg,#f8fbf9_0%,#ffffff_24%)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
            Suggested Reply
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[var(--biz-text)]">
            Draft the next move
          </h3>
        </div>
        <button
          type="button"
          onClick={() => onGenerateReply(selectedAction, sellerNote)}
          disabled={replyLoading}
          className="rounded-xl bg-[linear-gradient(135deg,#18a06f_0%,#117d58_100%)] px-3.5 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(17,125,88,0.24)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {replyLoading ? "Drafting..." : activeDraft ? "Regenerate" : "Generate draft"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Recommendation
          </span>
          <p className="text-sm font-semibold text-emerald-900">
            {recommendation.headline}
          </p>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-emerald-800">
          {recommendation.reason}
        </p>
      </div>

      {context.latestBuyerMessage ? (
        <div className="mt-3 rounded-2xl border border-[var(--biz-border)] bg-white px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
            Latest buyer message
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--biz-text)]">
            {context.latestBuyerMessage.body}
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {MARKETPLACE_REPLY_ACTIONS.map((action) => {
          const isActive = action.id === selectedAction;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setSelectedAction(action.id)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition-all ${
                isActive
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_8px_20px_rgba(22,163,74,0.08)]"
                  : "border-[var(--biz-border)] bg-white text-[var(--biz-text)] hover:bg-[#F8FAFC]"
              }`}
            >
              <p className="text-[12px] font-semibold">{action.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--biz-muted)]">
                {action.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <label className="text-[11px] font-medium text-[var(--biz-muted)]">
          Optional seller note
        </label>
        <textarea
          value={sellerNote}
          onChange={(event) => setSellerNote(event.target.value)}
          placeholder="Mention a price floor, shipping timing, bundle detail, or anything else worth working in."
          rows={2}
          className="mt-1.5 w-full resize-none rounded-[18px] border border-[var(--biz-border)] bg-white px-3 py-2.5 text-sm text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-primary)]"
        />
      </div>

      {replyError ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700">
          {replyError}
        </div>
      ) : null}

      {replyLoading ? (
        <div className="mt-3 rounded-[22px] border border-emerald-100 bg-white px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-emerald-100" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Building draft</p>
              <p className="text-[12px] text-emerald-700">
                Pulling in the thread, pricing context, and your selected move.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-[92%] animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-[76%] animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[22px] border border-[var(--biz-border)] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--biz-border)] px-4 py-3">
            <div>
              <p className="text-[12px] font-semibold text-[var(--biz-text)]">
                {selectedActionMeta.label}
              </p>
              <p className="text-[11px] text-[var(--biz-muted)]">
                {activeDraft
                  ? activeDraft.source === "ai"
                    ? "Draft ready for review"
                    : "Quick template ready for review"
                  : "Generate a draft for this move"}
              </p>
            </div>
            {activeDraft ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {activeDraft.source === "ai" ? "AI draft" : "Quick template"}
              </span>
            ) : null}
          </div>

          {activeDraft ? (
            <>
              <textarea
                value={draftEditorText}
                onChange={(event) => setDraftEditorText(event.target.value)}
                rows={6}
                className="min-h-[168px] w-full resize-none border-0 bg-transparent px-4 py-4 text-sm leading-relaxed text-[var(--biz-text)] focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--biz-border)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => onInsertReply(draftEditorText.trim())}
                  disabled={!draftEditorText.trim()}
                  className="rounded-xl bg-[linear-gradient(135deg,#18a06f_0%,#117d58_100%)] px-3.5 py-2 text-[12px] font-semibold text-white transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Insert into reply
                </button>
                <button
                  type="button"
                  onClick={handleCopyDraft}
                  className="rounded-xl border border-[var(--biz-border)] bg-white px-3.5 py-2 text-[12px] font-semibold text-[var(--biz-text)] transition-colors hover:bg-[#F8FAFC]"
                >
                  {copied ? "Copied" : "Copy draft"}
                </button>
                {activeDraft.source === "fallback" ? (
                  <span className="text-[11px] text-[var(--biz-muted)]">
                    Using a quick template based on the current thread context.
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <div className="px-4 py-6">
              <p className="text-sm text-[var(--biz-muted)]">
                Pick a move and generate a draft. You can edit it before loading it into the final reply box.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
