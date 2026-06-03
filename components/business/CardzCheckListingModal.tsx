"use client";

import { useMemo, useState } from "react";
import type { BusinessInventoryItem } from "@/types";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

const EBAY_MARKUP = 0.135;

interface Props {
  item: BusinessInventoryItem;
  onClose: () => void;
  onSuccess: (listingId: string) => void;
}

function estimatedCents(item: BusinessInventoryItem): number | null {
  if (typeof item.current_market_value_cents === "number" && item.current_market_value_cents > 0)
    return item.current_market_value_cents;
  if (typeof item.estimated_cmv === "number" && item.estimated_cmv > 0)
    return Math.round(item.estimated_cmv * 100);
  if (typeof item.est_cmv === "number" && item.est_cmv > 0)
    return Math.round(item.est_cmv * 100);
  if (typeof item.list_price_cents === "number" && item.list_price_cents > 0)
    return item.list_price_cents;
  return null;
}

export default function CardzCheckListingModal({ item, onClose, onSuccess }: Props) {
  const cmvCents = useMemo(() => estimatedCents(item), [item]);

  const [colist, setColist] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colistPriceCents =
    cmvCents != null && cmvCents > 0
      ? Math.round(cmvCents * (1 + EBAY_MARKUP))
      : null;

  const canSubmit = !busy;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        inventory_item_id: item.id,
        pricing_mode: "cardzcheck",
        ebay_colist: colist,
      };

      const res = await fetch("/api/marketplace/list-from-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to create listing");
      }
      onSuccess(data.listing.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="List on CardzCheck marketplace"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              List on CardzCheck Marketplace
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#E6E8EB]">
              {item.title || item.player_name || "Card"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="px-1 text-lg leading-none text-[#77808C] hover:text-[#E6E8EB]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
              {error}
            </div>
          ) : null}

          {/* CMV reference */}
          <div className="mb-4 flex items-center justify-between border border-[#24282D] bg-[#0F1317] px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
              Current Market Value
            </span>
            <span className="font-data text-sm font-semibold tabular-nums text-[#E6E8EB]">
              {fmtCents(cmvCents)}
            </span>
          </div>

          {/* Pricing */}
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
            Pricing
          </div>
          <div className="border border-[#1F5F45] bg-[#0E251B] px-3 py-3">
            <div className="text-xs font-semibold text-[#20B26B]">CardzCheck Pricing</div>
            <p className="mt-1 text-[11px] leading-snug text-[#B8C0CC]">
              We&apos;ll list this card at what we believe is fair market value within 24 hours
              of your request, and manage the price for you over time.
            </p>
          </div>

          {/* eBay co-list */}
          <div className="mt-4 border border-[#24282D] bg-[#0F1317] p-3">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={colist}
                onChange={(e) => setColist(e.target.checked)}
                className="mt-0.5 accent-[#20B26B]"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[#E6E8EB]">
                  Also list on the CardzCheck eBay store
                </span>
                <span className="block text-[11px] text-[#77808C]">
                  Priced 13.5% higher to cover eBay fees — your take-home stays the same.
                </span>
              </span>
            </label>
            {colist ? (
              <div className="mt-2 flex items-center justify-between border-t border-[#24282D] pt-2 text-xs">
                <span className="text-[#77808C]">eBay store price</span>
                <span className="font-data font-semibold tabular-nums text-[#E6E8EB]">
                  {fmtCents(colistPriceCents)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t border-[#24282D] px-5 py-3">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="border border-[#343941] px-4 py-2 text-xs font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-xs font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Listing…" : "List on Marketplace"}
          </button>
        </footer>
      </div>
    </div>
  );
}

