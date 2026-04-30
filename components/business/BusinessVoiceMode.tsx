"use client";

import { useMemo, useState } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import {
  findInventoryVoiceTarget,
  parseInventoryVoiceCommand,
  type InventoryVoiceCommand,
} from "@/lib/voice-commands";
import type { BusinessInventoryItem } from "@/types";

type BusinessVoiceModeArgs = {
  transcript: string;
  command: InventoryVoiceCommand;
  item: BusinessInventoryItem | null;
};

interface BusinessVoiceModeProps {
  businessName?: string | null;
  contextLabel: string;
  items?: BusinessInventoryItem[];
  currentItem?: BusinessInventoryItem | null;
  pendingDeleteItem?: BusinessInventoryItem | null;
  examples?: string[];
  operatorLabel?: string;
  onCommand: (args: BusinessVoiceModeArgs) => Promise<string | void> | string | void;
  onError?: (message: string) => void;
}

function itemLabel(item: BusinessInventoryItem | null | undefined): string | null {
  const title = item?.title?.trim();
  if (!title) return null;
  return title.length > 58 ? `${title.slice(0, 57).trimEnd()}...` : title;
}

function defaultAssistantLine(contextLabel: string): string {
  return `I'm ready on ${contextLabel}.`;
}

export default function BusinessVoiceMode({
  businessName,
  contextLabel,
  items = [],
  currentItem = null,
  pendingDeleteItem = null,
  examples,
  operatorLabel = "CardzCheck Operator",
  onCommand,
  onError,
}: BusinessVoiceModeProps) {
  const [open, setOpen] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [assistantLine, setAssistantLine] = useState(() => defaultAssistantLine(contextLabel));
  const [matchedItem, setMatchedItem] = useState<BusinessInventoryItem | null>(currentItem);
  const [autoRead, setAutoRead] = useState(true);
  const [busy, setBusy] = useState(false);
  const {
    isListening,
    isSupported,
    error,
    clearError,
    startListening,
    stopListening,
  } = useSpeechRecognition();
  const { isSpeaking, isSupported: speechSupported, speak, stop } = useSpeechSynthesis();

  const exampleCommands = useMemo(() => {
    if (examples?.length) return examples;
    if (currentItem) {
      return [
        "Mark this card sold for 25 dollars on eBay",
        "Delete this card",
        "Should I grade this before selling?",
      ];
    }
    return [
      "Which cards need attention today?",
      "Mark Jayden Daniels sold for 25 dollars on eBay",
      "Delete CJ Stroud",
    ];
  }, [currentItem, examples]);

  if (!isSupported) return null;

  const handleError = (message: string) => {
    setAssistantLine(message);
    onError?.(message);
    window.setTimeout(() => clearError(), 4000);
  };

  const handleTranscript = async (transcript: string) => {
    const command = parseInventoryVoiceCommand(transcript);
    const targetItem =
      command.type === "confirm"
        ? pendingDeleteItem ?? currentItem
        : findInventoryVoiceTarget(transcript, items, currentItem);

    setLastTranscript(transcript);
    setMatchedItem(targetItem ?? null);
    setBusy(true);

    try {
      const response =
        (await onCommand({
          transcript,
          command,
          item: targetItem ?? null,
        })) ?? "Done.";

      setAssistantLine(response);
      if (autoRead && speechSupported) {
        speak(response);
      }
    } catch {
      const message = "I could not finish that voice action. Try again.";
      setAssistantLine(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-[#BFD9C9] bg-[#173D2B] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(23,61,43,0.24)] transition-colors hover:bg-[#21563D]"
        aria-label="Open Voice Mode"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/14">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm7-3a7 7 0 01-14 0m7 7v3m-4 0h8"
            />
          </svg>
        </span>
        <span className="hidden sm:inline">Voice Mode</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] bg-black/40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close Voice Mode"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => {
              stopListening();
              stop();
              setOpen(false);
            }}
          />
          <section className="absolute bottom-0 right-0 flex h-[min(760px,100%)] w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border border-[#DCE8DF] bg-[#F8FBF8] text-[#17231C] shadow-2xl sm:bottom-5 sm:right-5 sm:h-[calc(100%-40px)] sm:rounded-2xl">
            <header className="border-b border-[#DCE8DF] bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#173D2B] text-sm font-bold text-white">
                    CC
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C7B68]">
                      {operatorLabel}
                    </p>
                    <h2 className="truncate text-base font-semibold text-[#17231C]">
                      {businessName || "Business Assistant"}
                    </h2>
                    <p className="text-xs text-[#6D7D72]">{contextLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopListening();
                    stop();
                    setOpen(false);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DCE8DF] bg-white text-[#526257] transition-colors hover:bg-[#F1F5F1]"
                  aria-label="Close Voice Mode"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="rounded-2xl border border-[#DCE8DF] bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#43A66F]" />
                  <p className="text-sm leading-6 text-[#24342A]">{assistantLine}</p>
                </div>
                {matchedItem && (
                  <div className="mt-3 rounded-lg border border-[#E2ECE5] bg-[#F6FAF7] px-3 py-2 text-xs text-[#526257]">
                    Working on <span className="font-semibold text-[#17231C]">{itemLabel(matchedItem)}</span>
                  </div>
                )}
              </div>

              {lastTranscript && (
                <div className="mt-4 rounded-2xl border border-[#DFE8E1] bg-[#EDF6F0] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C7B68]">
                    You said
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#17231C]">{lastTranscript}</p>
                </div>
              )}

              <div className="mt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6D7D72]">
                  Try
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {exampleCommands.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => void handleTranscript(example)}
                      className="rounded-full border border-[#DCE8DF] bg-white px-3 py-1.5 text-left text-xs text-[#35463B] transition-colors hover:bg-[#F1F6F2]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <footer className="border-t border-[#DCE8DF] bg-white p-4">
              {error && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={
                    isListening
                      ? stopListening
                      : () => void startListening(handleTranscript, handleError)
                  }
                  disabled={busy}
                  className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
                    isListening
                      ? "bg-red-600 text-white"
                      : "bg-[#173D2B] text-white hover:bg-[#21563D]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isListening ? (
                    <>
                      <span className="h-3 w-3 rounded-sm bg-white" />
                      Listening
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm7-3a7 7 0 01-14 0m7 7v3m-4 0h8"
                        />
                      </svg>
                      {busy ? "Working" : "Talk"}
                    </>
                  )}
                </button>
                {speechSupported && (
                  <button
                    type="button"
                    onClick={() => setAutoRead((value) => !value)}
                    className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                      autoRead
                        ? "border-[#BFD9C9] bg-[#EAF5EE] text-[#173D2B]"
                        : "border-[#DCE8DF] bg-white text-[#526257]"
                    }`}
                    aria-label={autoRead ? "Turn off spoken replies" : "Turn on spoken replies"}
                    title={autoRead ? "Spoken replies on" : "Spoken replies off"}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 9H4a1 1 0 00-1 1v4a1 1 0 001 1h5l3 3V6L9 9zm6.5-.5a5 5 0 010 7m2.5-9.5a8 8 0 010 11"
                      />
                    </svg>
                  </button>
                )}
                {speechSupported && isSpeaking && (
                  <button
                    type="button"
                    onClick={stop}
                    className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-[#DCE8DF] bg-white text-[#526257] transition-colors hover:bg-[#F1F5F1]"
                    aria-label="Stop speaking"
                  >
                    <span className="h-3 w-3 rounded-sm bg-current" />
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
