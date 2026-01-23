"use client";

import { useState, useEffect } from "react";
import type { User } from "@/types";
import { LIMITS } from "@/types";

interface WelcomeToastProps {
  user: User | null;
  onDismiss: () => void;
}

export default function WelcomeToast({ user, onDismiss }: WelcomeToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 8 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade out animation
    }, 8000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!isVisible || !user) return null;

  const remainingSearches = user.is_paid
    ? null
    : Math.max(0, LIMITS.FREE_SEARCHES - user.free_searches_used);

  return (
    <div
      className={`mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              {user.is_paid
                ? "Welcome to CardzCheck Pro!"
                : "Welcome to CardzCheck!"}
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {user.is_paid ? (
                <>You have unlimited searches. Start exploring your card collection!</>
              ) : (
                <>
                  Upload a card photo or search manually to get started. You have{" "}
                  <span className="font-semibold">{remainingSearches}</span>{" "}
                  {remainingSearches === 1 ? "search" : "searches"} remaining.
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex-shrink-0 ml-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
