"use client";

import { useState } from "react";
import type { MessageThread, Message } from "@/lib/messaging/types";

const TONES: { id: string; label: string; description: string }[] = [
  { id: "professional", label: "Professional", description: "Clear, direct, helpful" },
  { id: "friendly",     label: "Friendly",     description: "Warm and personable" },
  { id: "firm",         label: "Hold Price",   description: "Politely decline to negotiate" },
  { id: "negotiate",    label: "Counter Offer",description: "Open or continue negotiation" },
  { id: "decline",      label: "Decline",      description: "Politely decline their ask" },
  { id: "accept",       label: "Accept Deal",  description: "Accept with clear next steps" },
  { id: "ask_details",  label: "Ask Details",  description: "Request more info" },
];

interface Props {
  thread: MessageThread;
  lastBuyerMessage: Message | null;
  generatedReply: string | null;
  replySource: "ai" | "fallback" | null;
  replyLoading: boolean;
  onGenerateReply: (tone: string) => void;
  onUseReply: (text: string) => void;
  onClose: () => void;
}

export default function AIActionsPanel({
  lastBuyerMessage,
  generatedReply,
  replySource,
  replyLoading,
  onGenerateReply,
  onUseReply,
  onClose,
}: Props) {
  const [selectedTone, setSelectedTone] = useState("professional");
  const [showTones, setShowTones] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const selectedToneLabel = TONES.find((t) => t.id === selectedTone)?.label ?? "Professional";

  return (
    <div className="border-t border-[var(--biz-border)] bg-gradient-to-b from-slate-50 to-white px-4 py-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-sm">
            <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              <path d="M11 2h2v3h-2zM11 19h2v3h-2zM2 11h3v2H2zM19 11h3v2h-3z" opacity="0" />
            </svg>
            <svg className="h-3.5 w-3.5 text-white absolute" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{display:"none"}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Replace bad icon above with clean one */}
          </div>
          <span className="text-sm font-bold text-gray-900">AI Reply Assistant</span>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
            Claude
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* What we're replying to */}
      {lastBuyerMessage && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Replying to {lastBuyerMessage.sender_username}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-700 italic">
              &ldquo;{lastBuyerMessage.body}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Generate controls (only when no draft shown) */}
      {!generatedReply && !replyLoading && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onGenerateReply(selectedTone)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Draft a Reply
            </button>
            <button
              type="button"
              onClick={() => setShowTones(!showTones)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {selectedToneLabel}
              <svg
                className={`h-3 w-3 transition-transform ${showTones ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {showTones && (
            <div className="rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Choose tone</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {TONES.map(({ id, label, description }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setSelectedTone(id); setShowTones(false); }}
                    className={`rounded-md px-2.5 py-2 text-left transition-colors ${
                      selectedTone === id
                        ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                        : "border border-transparent hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <p className="text-[11px] font-semibold">{label}</p>
                    <p className="text-[10px] text-gray-400">{description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {replyLoading && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
          <svg className="h-5 w-5 shrink-0 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Claude is reading your conversation…</p>
            <p className="text-[11px] text-emerald-600">Drafting a contextual reply based on the full thread</p>
          </div>
        </div>
      )}

      {/* Generated draft */}
      {generatedReply && !replyLoading && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">

          {/* Draft header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-1.5">
              {replySource === "ai" ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[11px] font-semibold text-emerald-700">Generated by Claude</span>
                  <span className="text-[10px] text-gray-400">· {selectedToneLabel}</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-[11px] font-semibold text-amber-700">Template — AI not configured</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => onGenerateReply(selectedTone)}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-emerald-700 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
          </div>

          {/* Draft body */}
          <p className="px-4 py-3.5 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {generatedReply}
          </p>

          {/* AI not configured warning */}
          {replySource === "fallback" && (
            <div className="mx-3 mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <p className="text-[11px] text-amber-700">
                <span className="font-semibold">AI unavailable.</span> Add{" "}
                <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">ANTHROPIC_API_KEY</code>{" "}
                to Vercel → Settings → Environment Variables to enable real AI replies.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5">
            <button
              type="button"
              onClick={() => onUseReply(generatedReply)}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              Use This Reply
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleCopy(generatedReply)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
