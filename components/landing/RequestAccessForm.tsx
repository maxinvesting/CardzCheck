"use client";

import { useState, type FormEvent } from "react";

export default function RequestAccessForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || status === "submitting") return;
    setStatus("submitting");
    try {
      await fetch("/api/landing/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => null);
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-md border border-white/15 bg-white/[0.03] px-4 py-3.5 text-center text-sm text-white/80">
        You&apos;re on the list. We&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-2 sm:flex-row">
      <label htmlFor="access-email" className="sr-only">
        Email
      </label>
      <input
        id="access-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@domain.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "submitting"}
        className="flex-1 rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/30 focus:bg-white/[0.04] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center rounded-md border border-white/20 bg-white px-5 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
      >
        {status === "submitting" ? "Sending…" : "Request Access"}
      </button>
    </form>
  );
}
