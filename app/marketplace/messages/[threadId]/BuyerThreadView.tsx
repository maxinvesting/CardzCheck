"use client";

import { useState } from "react";
import Link from "next/link";
import type { Message, MessageThread } from "@/lib/messaging/types";

interface Props {
  threadId: string;
  initialThread: MessageThread;
  initialMessages: Message[];
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BuyerThreadView({
  threadId,
  initialThread,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/messages/${threadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to send message.");
        return;
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message as Message]);
      setText("");
    } catch {
      setError("Unable to send right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-2rem)] max-w-2xl flex-col px-4 py-4">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="min-w-0">
          <Link
            href="/marketplace/messages"
            className="text-[11px] font-medium text-white/60 hover:text-white"
          >
            ← All messages
          </Link>
          <h1 className="mt-1 truncate text-[16px] font-semibold text-white">
            {initialThread.buyer_display_name ?? initialThread.buyer_username}
          </h1>
          {initialThread.item_title ? (
            <p className="mt-0.5 truncate text-[12px] text-white/60">
              {initialThread.item_title}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-white/50">
            No messages yet. Say hi.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
              const out = m.direction === "outbound";
              return (
                <div
                  key={m.id}
                  className={`flex ${out ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] rounded-md px-3 py-2 ${
                      out
                        ? "border border-white/20 bg-white/10 text-white"
                        : "border border-white/10 bg-white/[0.03] text-white/90"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">
                      {out ? "You" : m.sender_username} ·{" "}
                      {formatMessageTime(m.created_at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
                      {m.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-3">
        {error ? (
          <p className="mb-2 text-[11px] text-red-300">{error}</p>
        ) : null}
        <div className="rounded-md border border-white/15 bg-white/[0.03]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message…"
            rows={2}
            className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] text-white placeholder-white/40 focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-white/10 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/40">
              CardzCheck
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="rounded bg-white px-3 py-1.5 text-[12px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
