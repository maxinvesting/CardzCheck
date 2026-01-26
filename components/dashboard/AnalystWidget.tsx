"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AnalystWidgetProps {
  isPaid?: boolean;
}

const QUICK_PROMPTS = [
  "Trending cards",
  "Best under $50",
  "What are my most expensive cards?",
];

export default function AnalystWidget({ isPaid }: AnalystWidgetProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/analyst?q=${encodeURIComponent(query.trim())}`);
  };

  const handleQuickPrompt = (prompt: string) => {
    router.push(`/analyst?q=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="bg-gray-800/60 rounded-xl border border-white/5 overflow-hidden relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <svg
            className="w-3.5 h-3.5 text-blue-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <span className="text-sm font-medium text-white">CardzCheck Analyst</span>
        <span className="ml-auto px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-medium rounded">
          Pro
        </span>
      </div>

      {/* Chat-style input area */}
      <div className="p-3">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about cards..."
              className="w-full pl-3 pr-10 py-2.5 bg-gray-900/80 border border-gray-700/50 rounded-full text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          </div>
        </form>

        {/* Quick prompts as pills */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleQuickPrompt(prompt)}
              className="px-2.5 py-1 bg-gray-900/60 hover:bg-gray-700/60 text-[11px] text-gray-400 hover:text-white rounded-full transition-all duration-150"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Pro overlay for free users */}
      {!isPaid && (
        <div className="absolute inset-0 bg-gray-900/90 backdrop-blur-[2px] flex items-center justify-center">
          <div className="text-center px-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/15 rounded-full mb-2">
              <svg
                className="w-3.5 h-3.5 text-blue-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium text-blue-400">Pro</span>
            </div>
            <p className="text-xs text-gray-400">
              Upgrade to unlock AI insights
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
