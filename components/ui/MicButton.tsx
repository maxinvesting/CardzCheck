"use client";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface MicButtonProps {
  onResult: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export function MicButton({ onResult, className = "", size = "md" }: MicButtonProps) {
  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition();

  if (!isSupported) return null;

  const sizeClasses = size === "sm" ? "p-1.5 h-8 w-8" : "p-2 h-10 w-10";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={isListening ? stopListening : () => startListening(onResult)}
      title={isListening ? "Stop recording" : "Voice input"}
      aria-label={isListening ? "Stop recording" : "Voice input"}
      className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${sizeClasses} ${
        isListening
          ? "animate-pulse bg-red-500 text-white"
          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
      } ${className}`}
    >
      {isListening ? (
        <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      ) : (
        <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </button>
  );
}
