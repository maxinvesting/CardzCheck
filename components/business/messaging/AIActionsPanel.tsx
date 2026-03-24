"use client";

import type { MessageThread } from "@/lib/messaging/types";

const TONE_BUTTONS: { tone: string; label: string; description: string }[] = [
  { tone: "professional", label: "Draft Reply", description: "Context-aware professional response" },
  { tone: "friendly", label: "Friendly Tone", description: "Warm, rapport-building response" },
  { tone: "firm", label: "Hold Price", description: "Politely decline to negotiate" },
  { tone: "negotiate", label: "Counter Offer", description: "Open or continue a negotiation" },
  { tone: "decline", label: "Decline", description: "Politely decline their request" },
  { tone: "accept", label: "Accept Deal", description: "Accept with next steps" },
  { tone: "ask_details", label: "Ask for Details", description: "Request more information" },
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
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-3 w-3 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--biz-text)]">AI Reply Assistant</span>
            <span className="ml-2 text-[10px] text-[var(--biz-muted)]">Reads the full conversation — drafts are ready to review &amp; send</span>
          </div>
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
        {TONE_BUTTONS.map(({ tone, label, description }) => (
          <button
            key={tone}
            type="button"
            onClick={() => onGenerateReply(tone)}
            disabled={replyLoading}
            title={description}
            className="flex items-center gap-1 rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[var(--biz-text)] transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {replyLoading && (
        <div className="rounded-lg border border-emerald-100 bg-white p-3">
          <div className="flex items-center gap-2 text-xs text-[var(--biz-muted)]">
            <svg className="w-3.5 h-3.5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Reading conversation and drafting reply...</span>
          </div>
        </div>
      )}

      {/* Generated reply */}
      {generatedReply && !replyLoading && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">AI Draft</span>
            <span className="text-[10px] text-[var(--biz-muted)]">— review before sending</span>
          </div>
          <p className="text-xs text-[var(--biz-text)] leading-relaxed whitespace-pre-wrap">
            {generatedReply}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUseReply(generatedReply)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Use Draft
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(generatedReply)}
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
