"use client";

import { useState } from "react";
import { estimateEbayFees } from "@/lib/ebay/selling/fee-calculator";
import { getEbayListingCategoryId } from "@/lib/cards/market-category";
import type { BusinessInventoryItem } from "@/types";

interface Props {
  item: BusinessInventoryItem;
  isTopRated?: boolean;
  onClose: () => void;
  onSuccess: (listingId: string, listingUrl: string) => void;
}

const CONDITION_OPTIONS = [
  { value: "LIKE_NEW", label: "Like New" },
  { value: "VERY_GOOD", label: "Very Good" },
  { value: "GOOD", label: "Good" },
  { value: "ACCEPTABLE", label: "Acceptable" },
];

const CATEGORY_OPTIONS = [
  { value: "261328", label: "Sports Trading Cards" },
  { value: "183454", label: "CCG Individual Cards (Pokemon / One Piece / TCG)" },
  { value: "183050", label: "Non-Sport Trading Cards" },
  { value: "261333", label: "Football Cards" },
  { value: "261334", label: "Baseball Cards" },
  { value: "261335", label: "Basketball Cards" },
  { value: "261336", label: "Hockey Cards" },
];

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function EbayListingModal({ item, isTopRated = false, onClose, onSuccess }: Props) {
  const defaultPrice = item.list_price_cents ?? item.cost_basis_total_cents ?? 0;
  const defaultCategoryId = getEbayListingCategoryId({ title: item.title, sport: null });

  const [title, setTitle] = useState(item.title);
  const [priceCents, setPriceCents] = useState(defaultPrice);
  const [priceInput, setPriceInput] = useState((defaultPrice / 100).toFixed(2));
  const [condition, setCondition] = useState(
    item.condition_status === "graded" ? "LIKE_NEW" : "VERY_GOOD"
  );
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [description, setDescription] = useState(
    item.grade
      ? `${item.title}. ${item.grading_company ?? ""}${item.grade ? ` ${item.grade}` : ""}${item.cert_number ? ` #${item.cert_number}` : ""}.`
      : item.title
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fees = estimateEbayFees(priceCents, isTopRated);
  const cogsCents = item.cost_basis_total_cents ?? 0;
  const netPayout = priceCents - fees.platform_fees_cents;
  const estimatedProfit = netPayout - cogsCents;

  function handlePriceChange(value: string) {
    setPriceInput(value);
    const dollars = parseFloat(value);
    if (Number.isFinite(dollars) && dollars > 0) {
      setPriceCents(Math.round(dollars * 100));
    }
  }

  async function handleSubmit() {
    if (!title.trim() || priceCents <= 0) {
      setError("Title and price are required");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const imageUrls: string[] = [];
      if ((item as any).user_image_url) imageUrls.push((item as any).user_image_url);
      if ((item as any).stock_image_url) imageUrls.push((item as any).stock_image_url);
      if ((item as any).ebay_image_url) imageUrls.push((item as any).ebay_image_url);

      const res = await fetch("/api/business/ebay/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: item.id,
          title: title.trim(),
          description: description.trim() || title.trim(),
          condition,
          category_id: categoryId,
          price_cents: priceCents,
          quantity: item.quantity ?? 1,
          image_urls: imageUrls,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create listing");

      onSuccess(data.listing_id, data.listing_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#111827] shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">List on eBay</h2>
            <p className="mt-0.5 text-xs text-white/40 truncate max-w-xs">{item.title}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Listing Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 focus:outline-none"
            />
            <p className="mt-0.5 text-right text-[10px] text-white/20">{title.length}/80</p>
          </div>

          {/* Category + Condition */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
              >
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">List Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
              <input
                type="number"
                value={priceInput}
                onChange={(e) => handlePriceChange(e.target.value)}
                min="0.01"
                step="0.01"
                className="w-full rounded-lg border border-white/10 bg-white/5 pl-7 pr-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Fee preview */}
          {priceCents > 0 && (
            <div className="rounded-xl bg-white/5 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-white/40">
                <span>eBay fee ({isTopRated ? "12.35%" : "13.25%"} + $0.30)</span>
                <span className="text-red-400">−{fmt(fees.platform_fees_cents)}</span>
              </div>
              <div className="flex justify-between text-white/40">
                <span>Net payout</span>
                <span className="text-white">{fmt(netPayout)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1.5 font-semibold">
                <span className="text-white/60">Est. profit</span>
                <span className={estimatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {fmt(estimatedProfit)}
                </span>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm font-medium text-white/60 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || priceCents <= 0}
            className="flex-1 rounded-lg bg-[#86b817] py-2 text-sm font-semibold text-white transition hover:bg-[#86b817]/90 disabled:opacity-50"
          >
            {submitting ? "Listing…" : "List on eBay"}
          </button>
        </div>
      </div>
    </div>
  );
}
