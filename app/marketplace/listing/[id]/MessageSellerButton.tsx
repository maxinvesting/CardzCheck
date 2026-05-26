"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  listingId: string;
  isLoggedIn: boolean;
  isOwnListing: boolean;
}

export default function MessageSellerButton({
  listingId,
  isLoggedIn,
  isOwnListing,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOwnListing) return null;

  async function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?next=/marketplace/listing/${listingId}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/messages/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.threadId) {
        setError(data.error ?? "Couldn't open conversation.");
        return;
      }
      router.push(`/marketplace/messages/${data.threadId}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full rounded border border-white/20 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Opening…" : "Message seller"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
