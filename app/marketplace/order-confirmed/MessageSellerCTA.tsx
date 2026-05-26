"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  transactionId: string;
}

export default function MessageSellerCTA({ transactionId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/messages/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.threadId) {
        setError(data.error ?? "Couldn't open conversation.");
        return;
      }
      router.push(`/marketplace/messages/${data.threadId}`);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="rounded border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening…" : "Message seller"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
