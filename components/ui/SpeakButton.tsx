"use client";

import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";

interface SpeakButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "md";
}

export function SpeakButton({ text, className = "", size = "md" }: SpeakButtonProps) {
  const { isSpeaking, isSupported, speak, stop } = useSpeechSynthesis();

  if (!isSupported) return null;

  const sizeClasses = size === "sm" ? "p-1.5 h-8 w-8" : "p-2 h-10 w-10";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={isSpeaking ? stop : () => speak(text)}
      title={isSpeaking ? "Stop reading" : "Read aloud"}
      aria-label={isSpeaking ? "Stop reading" : "Read aloud"}
      className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${sizeClasses} ${
        isSpeaking
          ? "bg-blue-500 text-white"
          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
      } ${className}`}
    >
      {isSpeaking ? (
        <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072M9 9H4a1 1 0 00-1 1v4a1 1 0 001 1h5l3 3V6l-3 3z"
          />
        </svg>
      )}
    </button>
  );
}
