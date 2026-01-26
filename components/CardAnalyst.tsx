"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import SportsCardBackground from "./SportsCardBackground";
import type { AnalystThread, AnalystThreadMessage, CardContext } from "@/types";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface CardAnalystProps {
  cardContext?: CardContext;
  compact?: boolean;
  onClose?: () => void;
  remainingQueries?: number;
  totalQueries?: number;
}

const SUGGESTED_PROMPTS = [
  "Is this card a good investment?",
  "Should I get this graded?",
  "Why did the price drop recently?",
  "What's the PSA 10 vs PSA 9 price gap?",
];

const GENERAL_PROMPTS = [
  "What's my most valuable card?",
  "How is my collection performing?",
  "Any watchlist cards near target?",
  "What should I buy or sell?",
];

export default function CardAnalyst({
  cardContext,
  compact = false,
  onClose,
  remainingQueries,
  totalQueries,
}: CardAnalystProps) {
  // Thread state
  const [threads, setThreads] = useState<AnalystThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showThreadList, setShowThreadList] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(true);

  // Message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load threads on mount
  useEffect(() => {
    async function loadThreads() {
      try {
        const res = await fetch("/api/analyst/threads");
        const data = await res.json();

        if (data.threads && data.threads.length > 0) {
          setThreads(data.threads);
          // Load most recent thread
          const mostRecentThread = data.threads[0];
          setActiveThreadId(mostRecentThread.id);
          await loadThreadMessages(mostRecentThread.id);
        }
      } catch (err) {
        console.error("Failed to load threads:", err);
      } finally {
        setThreadsLoading(false);
      }
    }

    loadThreads();
  }, []);

  // Load messages for a thread
  const loadThreadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/analyst/threads/${threadId}`);
      const data = await res.json();

      if (data.messages) {
        setMessages(
          data.messages.map((msg: AnalystThreadMessage) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, []);

  // Switch to a different thread
  const selectThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setMessages([]);
    setError(null);
    setShowThreadList(false);
    await loadThreadMessages(threadId);
  }, [loadThreadMessages]);

  // Create a new chat thread
  const handleNewChat = async () => {
    try {
      const res = await fetch("/api/analyst/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (data.error === "upgrade_required") {
        setError("CardzCheck Analyst is a Pro feature. Upgrade to access chat history.");
        return;
      }

      if (data.thread) {
        setActiveThreadId(data.thread.id);
        setMessages([]);
        setError(null);
        setThreads((prev) => [data.thread, ...prev]);
        setShowThreadList(false);
      }
    } catch (err) {
      console.error("Failed to create thread:", err);
      setError("Failed to create new chat.");
    }
  };

  // Delete a thread
  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/analyst/threads/${threadId}`, {
        method: "DELETE",
      });

      setThreads((prev) => prev.filter((t) => t.id !== threadId));

      // If deleting active thread, switch to another or clear
      if (activeThreadId === threadId) {
        const remainingThreads = threads.filter((t) => t.id !== threadId);
        if (remainingThreads.length > 0) {
          selectThread(remainingThreads[0].id);
        } else {
          setActiveThreadId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      let threadId = activeThreadId;

      // Create new thread if none exists
      if (!threadId) {
        const createRes = await fetch("/api/analyst/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const createData = await createRes.json();

        if (createData.error === "upgrade_required") {
          setError("CardzCheck Analyst is a Pro feature. Upgrade to access AI analysis.");
          setMessages((prev) => prev.slice(0, -1)); // Remove optimistic message
          return;
        }

        if (!createData.thread) {
          throw new Error("Failed to create thread");
        }

        threadId = createData.thread.id;
        setActiveThreadId(threadId);
        setThreads((prev) => [createData.thread, ...prev]);
      }

      // Send message to thread
      const res = await fetch(`/api/analyst/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, cardContext }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "upgrade_required") {
          setError("CardzCheck Analyst is a Pro feature. Upgrade to access AI analysis.");
        } else if (data.error === "limit_reached") {
          setError(data.message || "Query limit reached.");
        } else {
          setError(data.message || "Something went wrong.");
        }
        // Remove optimistic user message on error
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      // Replace optimistic message with persisted one and add assistant response
      setMessages((prev) => {
        const withoutOptimistic = prev.slice(0, -1);
        return [
          ...withoutOptimistic,
          {
            id: data.userMessage?.id,
            role: "user" as const,
            content: userMessage,
          },
          {
            id: data.assistantMessage?.id,
            role: "assistant" as const,
            content: data.assistantMessage?.content || "Unable to analyze at this time.",
          },
        ];
      });

      // Update thread title in list if it changed from "New Chat"
      if (data.userMessage) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId && t.title === "New Chat"
              ? {
                  ...t,
                  title:
                    userMessage.length > 40
                      ? userMessage.substring(0, 40) + "..."
                      : userMessage,
                  updated_at: new Date().toISOString(),
                }
              : t.id === threadId
              ? { ...t, updated_at: new Date().toISOString() }
              : t
          )
        );
      }
    } catch (err) {
      setError("Failed to connect. Please try again.");
      setMessages((prev) => prev.slice(0, -1)); // Remove optimistic message
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const prompts = cardContext ? SUGGESTED_PROMPTS : GENERAL_PROMPTS;

  const cardLabel = cardContext
    ? [cardContext.year, cardContext.playerName, cardContext.setName, cardContext.grade]
        .filter(Boolean)
        .join(" ")
    : null;

  const activeThread = threads.find((t) => t.id === activeThreadId);

  const formatTimeAgo = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div
      className={`flex flex-col bg-[#0f1419] relative overflow-hidden ${
        compact ? "h-[400px]" : "h-full"
      }`}
    >
      <SportsCardBackground variant="default" />

      {/* Thread List Panel */}
      {showThreadList && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={() => setShowThreadList(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0f1419] border-r border-gray-800 z-30 flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-medium text-white">Chat History</h3>
              <button
                onClick={() => setShowThreadList(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleNewChat}
              className="mx-4 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
            <div className="flex-1 overflow-y-auto p-2 mt-2">
              {threadsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-gray-800/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No chat history</p>
                  <p className="text-xs text-gray-600 mt-1">Start a new chat to begin</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => selectThread(thread.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors group ${
                        thread.id === activeThreadId
                          ? "bg-blue-600/20 border border-blue-500/30"
                          : "hover:bg-gray-800/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{thread.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatTimeAgo(thread.updated_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteThread(thread.id, e)}
                          className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 relative z-10 bg-[#0f1419]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThreadList(true)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="Chat history"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <svg
              className="w-5 h-5 text-blue-400"
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
          <div>
            <h2 className="font-semibold text-white">CardzCheck Analyst</h2>
            {remainingQueries !== undefined && totalQueries !== undefined && (
              <p className="text-xs text-gray-400">
                {remainingQueries} / {totalQueries} queries remaining
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeThread && (
            <span className="text-xs text-gray-500 truncate max-w-[120px]">
              {activeThread.title}
            </span>
          )}
          <button
            onClick={handleNewChat}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            title="New chat"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
            Pro
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white transition-colors"
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
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="p-4 bg-blue-500/10 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-blue-400"
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
            <h3 className="text-lg font-medium text-white mb-2">
              Ask CardzCheck Analyst
            </h3>
            <p className="text-sm text-gray-400 mb-6 max-w-sm">
              {cardContext
                ? "Get insights about this card's value and investment potential."
                : "Get insights about card values, market trends, and collecting strategies."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-100"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 px-4 py-3 rounded-2xl">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 relative z-10">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Card Context Badge */}
      {cardLabel && (
        <div className="px-4 py-2 border-t border-gray-800 relative z-10 bg-[#0f1419]/80">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm text-gray-300 truncate max-w-[200px]">
              {cardLabel}
            </span>
          </div>
        </div>
      )}

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-800 relative z-10 bg-[#0f1419]/90 backdrop-blur-sm"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about cards, values, or trends..."
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
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
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
