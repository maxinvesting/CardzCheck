"use client";

import { useState } from "react";

export default function BuyButton({
  listingId,
  isLoggedIn,
  isOwnListing,
}: {
  listingId: string;
  isLoggedIn: boolean;
  isOwnListing: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_id: listingId }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? "checkout_failed");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <a
        href={`/login?next=/marketplace/listing/${listingId}`}
        className="inline-block px-4 py-2 rounded border border-gray-700 bg-gray-900 text-sm text-gray-100 hover:bg-gray-800"
      >
        Sign in to buy
      </a>
    );
  }
  if (isOwnListing) {
    return (
      <span className="text-xs text-gray-500">This is your listing.</span>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={buy}
        disabled={busy}
        className="px-4 py-2 rounded border border-gray-700 bg-gray-900 text-sm text-gray-100 hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Buy now"}
      </button>
      {error && (
        <div className="text-xs text-red-400">
          {error === "elite_fee_not_set"
            ? "This elite listing isn't available for purchase yet (admin needs to set the fee)."
            : error}
        </div>
      )}
    </div>
  );
}
