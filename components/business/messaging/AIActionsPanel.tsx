"use client";

import type { MessageThread } from "@/lib/messaging/types";

const TONE_BUTTONS: { tone: string; label: string; icon: string }[] = [
  { tone: "professional", label: "Generate Reply", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { tone: "friendly", label: "Make Friendly", icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { tone: "firm", label: "Make Firm", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { tone: "negotiate", label: "Counter Offer", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { tone: "decline", label: "Decline Politely", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" },
  { tone: "accept", label: "Accept Deal", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { tone: "ask_details", label: "Ask for Details", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

interface Props {
  thread: MessageThread;
  generatedReply: string | null;
  replyLoading: boolean;
  onGenerateReply: (tone: string) => void;
  onUseReply: (text: string) => void;
  onClose: () => void;
}

export default function AIActionsPanel({
  generatedReply,
  replyLoading,
  onGenerateReply,
  onUseReply,
  onClose,
}: Props) {
  return (
    <div className="border-t border-[var(--biz-border)] bg-[#FAFBFC] px-5 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--biz-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs font-semibold text-[var(--biz-text)]">AI Reply Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--biz-muted)] hover:text-[var(--biz-text)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tone buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TONE_BUTTONS.map(({ tone, label, icon }) => (
          <button
            key={tone}
            type="button"
            onClick={() => onGenerateReply(tone)}
            disabled={replyLoading}
            className="flex items-center gap-1.5 rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F3F4F6] hover:border-[var(--biz-primary)] disabled:opacity-50"
          >
            <svg className="w-3 h-3 text-[var(--biz-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </button>
        ))}
      </div>

      {/* Generated reply preview */}
      {replyLoading && (
        <div className="rounded-lg border border-[var(--biz-border)] bg-white p-3">
          <div className="flex items-center gap-2 text-xs text-[var(--biz-muted)]">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating reply...
          </div>
        </div>
      )}

      {generatedReply && !replyLoading && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-xs text-[var(--biz-text)] leading-relaxed whitespace-pre-wrap">
            {generatedReply}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUseReply(generatedReply)}
              className="rounded-md bg-[var(--biz-primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#096b40]"
            >
              Use This Reply
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(generatedReply);
              }}
              className="rounded-md border border-[var(--biz-border)] bg-white px-3 py-1.5 text-[11px] font-medium text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
