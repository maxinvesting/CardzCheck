"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AdminListing = {
  id: string;
  pipeline: "standard" | "elite" | "grails";
  fee_tier: string;
  list_price_cents: number;
  negotiated_fee_cents: number | null;
  status: string;
  mode: string;
};

export default function AdminListingClient({ listing }: { listing: AdminListing }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [negotiatedFee, setNegotiatedFee] = useState(
    listing.negotiated_fee_cents != null
      ? String(listing.negotiated_fee_cents / 100)
      : ""
  );
  const [overridePrice, setOverridePrice] = useState(
    String(listing.list_price_cents / 100)
  );

  async function setNegotiatedFeeCents() {
    setBusy("fee");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/marketplace/listings/${listing.id}/negotiated-fee`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            negotiated_fee_cents: Math.round(Number(negotiatedFee) * 100),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "fee_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(null);
    }
  }

  async function applyPriceOverride() {
    setBusy("price");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/marketplace/listings/${listing.id}/price-override`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            list_price_cents: Math.round(Number(overridePrice) * 100),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "override_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(null);
    }
  }

  const showOverride =
    listing.pipeline === "elite" || listing.pipeline === "grails";
  const showNegotiated = listing.pipeline === "elite";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showOverride && (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold">
            Price override ({listing.pipeline})
          </h3>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block text-xs text-gray-400 mb-1">
                List price (USD)
              </span>
              <input
                type="number"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={applyPriceOverride}
              disabled={busy === "price"}
              className="px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-sm disabled:opacity-50"
            >
              {busy === "price" ? "Saving…" : "Apply"}
            </button>
          </div>
        </div>
      )}

      {showNegotiated && (
        <div className="rounded border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Negotiated fee (elite)</h3>
          <p className="text-xs text-gray-500">
            Locks in the platform fee for this listing. Required before buyers
            can check out elite-pipeline listings.
          </p>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block text-xs text-gray-400 mb-1">
                Fee amount (USD)
              </span>
              <input
                type="number"
                value={negotiatedFee}
                onChange={(e) => setNegotiatedFee(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={setNegotiatedFeeCents}
              disabled={busy === "fee"}
              className="px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-sm disabled:opacity-50"
            >
              {busy === "fee" ? "Saving…" : "Save fee"}
            </button>
          </div>
          {listing.negotiated_fee_cents != null && (
            <div className="text-xs text-gray-400">
              Current: ${(listing.negotiated_fee_cents / 100).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
