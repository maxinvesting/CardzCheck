"use client";

import { useEffect } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface MicButtonProps {
  onResult: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
  label?: string;
  title?: string;
  onError?: (message: string) => void;
}

export function MicButton({
  onResult,
  className = "",
  size = "md",
  label,
  title,
  onError,
}: MicButtonProps) {
  const {
    isListening,
    isSupported,
    error,
    clearError,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  useEffect(() => {
    if (!error) return;
    onError?.(error);
    const timer = window.setTimeout(() => clearError(), 4000);
    return () => window.clearTimeout(timer);
  }, [error, onError, clearError]);

  if (!isSupported) return null;

  const hasLabel = Boolean(label);
  const sizeClasses = hasLabel
    ? size === "sm"
      ? "gap-1.5 px-2.5 py-1.5 text-[11px]"
      : "gap-2 px-3 py-2 text-sm"
    : size === "sm"
      ? "p-1.5 h-8 w-8"
      : "p-2 h-10 w-10";
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const accessibleLabel = error ?? (isListening ? "Stop recording" : title ?? label ?? "Voice input");

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={isListening ? stopListening : () => void startListening(onResult, onError)}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${sizeClasses} ${
          isListening
            ? "animate-pulse bg-red-500 text-white"
            : error
              ? "bg-amber-500 text-black"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        } ${className}`}
      >
        {isListening ? (
          <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        ) : error ? (
          <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.65 18h16.7a1 1 0 00.86-1.5l-7.5-13a1 1 0 00-1.72 0z" />
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
        {hasLabel ? <span>{isListening ? "Listening" : label}</span> : null}
      </button>
      {error ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-amber-300/40 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900 shadow-lg">
          {error}
        </div>
      ) : null}
    </div>
  );
}
