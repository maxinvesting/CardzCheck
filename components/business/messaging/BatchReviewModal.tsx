"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageThread } from "@/lib/messaging/types";
import type { MarketplaceReplyDraftResult } from "@/lib/messaging/reply-drafts";
import { getMarketplaceReplyActionMeta } from "@/lib/messaging/reply-drafts";
import { formatPrice } from "@/lib/pricing";

interface Props {
  threads: MessageThread[];
  draftCache: Map<string, MarketplaceReplyDraftResult>;
  onCacheDraft: (threadId: string, draft: MarketplaceReplyDraftResult) => void;
  onSend: (threadId: string, body: string) => Promise<boolean>;
  onResolve: (threadId: string) => void;
  onClose: () => void;
}

export default function BatchReviewModal({
  threads,
  draftCache,
  onCacheDraft,
  onSend,
  onResolve,
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);
  const [editText, setEditText] = useState<Record<string, string>>({});
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const total = threads.length;
  const current = threads[index] ?? null;
  const currentDraft = current ? draftCache.get(current.id) ?? null : null;

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0)));
    setErrorMsg(null);
  }, [total]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
    setErrorMsg(null);
  }, []);

  // Lazy-fetch draft if not cached
  useEffect(() => {
    if (!current) return;
    if (currentDraft) return;
    let cancelled = false;
    setLoadingDraft(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/business/messages/${current.id}/ai-reply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "smart_reply" }),
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as MarketplaceReplyDraftResult;
        if (cancelled) return;
        onCacheDraft(current.id, data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current, currentDraft, onCacheDraft]);

  const currentBody = useMemo(() => {
    if (!current) return "";
    if (current.id in editText) return editText[current.id];
    return currentDraft?.reply ?? "";
  }, [current, editText, currentDraft]);

  const handleSend = useCallback(async () => {
    if (!current || !currentBody.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const ok = await onSend(current.id, currentBody.trim());
      if (ok) {
        setCompleted((prev) => {
          const next = new Set(prev);
          next.add(current.id);
          return next;
        });
        goNext();
      } else {
        setErrorMsg("Failed to send. Try again or skip.");
      }
    } finally {
      setSending(false);
    }
  }, [current, currentBody, sending, onSend, goNext]);

  const handleEditFocus = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const handleResolve = useCallback(() => {
    if (!current) return;
    onResolve(current.id);
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    goNext();
  }, [current, onResolve, goNext]);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (inField) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        void handleSend();
      } else if (e.key === "j" || e.key === "J" || e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleEditFocus();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleResolve();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSend, goNext, goPrev, handleEditFocus, handleResolve, onClose]);

  if (!current) {
    return (
      <Backdrop onClose={onClose}>
        <div className="rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] p-8 text-center">
          <p className="text-[14px] font-semibold text-[var(--biz-text-strong)]">
            Queue is empty
          </p>
          <p className="mt-2 text-[12px] text-[var(--biz-muted)]">
            Nothing to review right now.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-primary-foreground)]"
          >
            Close
          </button>
        </div>
      </Backdrop>
    );
  }

  const recommendedMeta = currentDraft
    ? getMarketplaceReplyActionMeta(currentDraft.recommendation.action)
    : null;
  const buyer = current.buyer_display_name ?? current.buyer_username;
  const isComplete = completed.has(current.id);
  const offerText =
    typeof current.offer_amount_cents === "number"
      ? formatPrice(current.offer_amount_cents / 100)
      : null;

  return (
    <Backdrop onClose={onClose}>
      <div className="flex h-[min(92vh,820px)] w-[min(96vw,720px)] flex-col overflow-hidden rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--biz-border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-automation)] font-mono-num">
              Batch review
            </span>
            <span className="biz-mono text-[11px] text-[var(--biz-muted)]">
              {index + 1} of {total}
              {completed.size > 0 ? ` · ${completed.size} cleared` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShortcutHint k="S" label="Send" />
            <ShortcutHint k="E" label="Edit" />
            <ShortcutHint k="J" label="Next" />
            <ShortcutHint k="R" label="Resolve" />
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded border border-[var(--biz-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
            >
              Close (Esc)
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-[var(--biz-surface-soft)]">
          <div
            className="h-1 bg-[var(--biz-automation)] transition-all"
            style={{ width: `${(completed.size / total) * 100}%` }}
          />
        </div>

        {/* Card body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          {/* Thread context */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-semibold text-[var(--biz-text-strong)]">
                  {buyer}
                </span>
                <span className="biz-mono text-[11px] text-[var(--biz-muted)]">
                  @{current.buyer_username}
                </span>
                {offerText ? (
                  <span className="biz-mono rounded-sm border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-1.5 py-px text-[11px] text-[var(--biz-primary)]">
                    {offerText}
                  </span>
                ) : null}
                {isComplete ? (
                  <span className="rounded-sm border border-[var(--biz-automation-border)] bg-[var(--biz-automation-soft)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--biz-automation)]">
                    Cleared
                  </span>
                ) : null}
              </div>
              {current.item_title ? (
                <p className="mt-1 truncate text-[12px] text-[var(--biz-text)]">
                  {current.item_title}
                </p>
              ) : null}
            </div>
          </div>

          {/* Last buyer message preview */}
          <div className="mt-3 rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.10em] text-[var(--biz-muted)] font-mono-num">
              Last buyer message
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--biz-text)]">
              {current.last_message_preview ?? "(no preview)"}
            </p>
          </div>

          {/* Agent recommendation + draft */}
          <div className="mt-3 rounded-md border border-[var(--biz-primary-border)] bg-[var(--biz-surface-soft)] p-3">
            <div className="flex items-center gap-2">
              <span className="biz-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-automation)]">
                Agent draft
              </span>
              {recommendedMeta ? (
                <span className="text-[12px] font-semibold text-[var(--biz-text-strong)]">
                  {recommendedMeta.label}
                </span>
              ) : null}
              {loadingDraft ? (
                <span className="text-[11px] text-[var(--biz-muted)]">
                  Drafting…
                </span>
              ) : null}
            </div>
            {currentDraft ? (
              <p className="mt-1 text-[11px] leading-snug text-[var(--biz-muted)]">
                {currentDraft.recommendation.reason}
              </p>
            ) : null}
            <textarea
              ref={textareaRef}
              value={currentBody}
              onChange={(e) =>
                setEditText((prev) => ({ ...prev, [current.id]: e.target.value }))
              }
              rows={5}
              placeholder={
                loadingDraft
                  ? "Agent is drafting…"
                  : "No draft yet. Write a reply or skip."
              }
              className="mt-2 block w-full rounded border border-[var(--biz-border)] bg-[var(--biz-bg)] px-3 py-2 text-[13px] leading-relaxed text-[var(--biz-text)] placeholder-[var(--biz-muted)] focus:border-[var(--biz-primary-border)] focus:outline-none focus:ring-1 focus:ring-[var(--biz-focus)]"
              style={{ resize: "vertical" }}
            />
          </div>

          {errorMsg ? (
            <p className="mt-2 text-[11px] text-[var(--biz-danger)]">{errorMsg}</p>
          ) : null}
        </div>

        {/* Action bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="rounded border border-[var(--biz-border)] px-2 py-1 text-[11px] font-semibold text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Prev (K)
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={index >= total - 1}
              className="rounded border border-[var(--biz-border)] px-2 py-1 text-[11px] font-semibold text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip (J) →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResolve}
              className="rounded border border-[var(--biz-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
            >
              Resolve (R)
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!currentBody.trim() || sending}
              className="rounded bg-[var(--biz-primary)] px-4 py-1.5 text-[12px] font-semibold text-[var(--biz-primary-foreground)] hover:bg-[var(--biz-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send (S)"}
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ShortcutHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-[var(--biz-muted)]">
      <kbd className="rounded border border-[var(--biz-border)] bg-[var(--biz-bg)] px-1 font-mono text-[10px] text-[var(--biz-text)]">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
