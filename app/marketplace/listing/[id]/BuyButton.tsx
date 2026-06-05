"use client";

import { useState } from "react";

export default function BuyButton({
  listingId,
  isLoggedIn,
  isOwnListing,
  sellerReady = true,
}: {
  listingId: string;
  isLoggedIn: boolean;
  isOwnListing: boolean;
  sellerReady?: boolean;
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
        className="inline-flex w-full items-center justify-center border border-[#343941] bg-[#0B0D0F] px-3 py-2 text-[12px] font-semibold text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
      >
        Sign in to buy
      </a>
    );
  }
  if (isOwnListing) {
    return (
      <span className="block text-[11px] text-[#77808C]">
        This is your listing.
      </span>
    );
  }
  if (!sellerReady) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="inline-flex w-full cursor-not-allowed items-center justify-center border border-[#343941] bg-[#0B0D0F] px-3 py-2 text-[12px] font-semibold text-[#5A626E]"
        >
          Not available yet
        </button>
        <p className="text-[11px] text-[#77808C]">
          This seller hasn&apos;t finished setting up payments. Message them or check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={buy}
        disabled={busy}
        className="inline-flex w-full items-center justify-center border border-[#20B26B] bg-[#20B26B] px-3 py-2 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Buy now"}
      </button>
      {error && (
        <div className="text-[11px] text-red-300">
          {error === "elite_fee_not_set"
            ? "This elite listing isn't available for purchase yet (admin needs to set the fee)."
            : error === "seller_not_accepting_payments"
              ? "This seller hasn't finished setting up payments yet."
              : error === "cannot_buy_own_listing"
                ? "You can't buy your own listing."
                : error}
        </div>
      )}
    </div>
  );
}
