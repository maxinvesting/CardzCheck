"use client";

import { useEffect, useMemo, useState } from "react";
import { computeNetPayout, formatMoney } from "@/lib/business/sales-utils";
import type { BusinessSale } from "@/types";

type SaleFormPayload = {
  inventory_item_id?: string | null;
  channel: "ebay" | "whatnot" | "instagram" | "show" | "local" | "other";
  sold_at: string;
  sold_price_cents: number;
  shipping_charged_cents: number;
  platform_fees_cents: number;
  shipping_cost_cents: number;
  tax_cents: number;
  net_payout_cents: number | null;
  cogs_cents: number | null;
  notes: string | null;
  external_order_id: string | null;
};

interface Props {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  defaults?: Partial<BusinessSale> & {
    inventory_item_id?: string | null;
    channel?: string | null;
    sold_at?: string | null;
  };
  onClose: () => void;
  onSubmit: (payload: SaleFormPayload) => Promise<void> | void;
  showCogsField?: boolean;
}

const CHANNEL_OPTIONS = [
  "ebay",
  "whatnot",
  "instagram",
  "show",
  "local",
  "other",
] as const;

function centsToInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

export default function SaleFormModal({
  isOpen,
  title,
  submitLabel,
  defaults,
  onClose,
  onSubmit,
  showCogsField = true,
}: Props) {
  const [channel, setChannel] = useState<
    "ebay" | "whatnot" | "instagram" | "show" | "local" | "other"
  >("other");
  const [soldAt, setSoldAt] = useState(new Date().toISOString().slice(0, 10));
  const [soldPrice, setSoldPrice] = useState("");
  const [shippingCharged, setShippingCharged] = useState("");
  const [platformFees, setPlatformFees] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [tax, setTax] = useState("");
  const [cogs, setCogs] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [autoCalcNetPayout, setAutoCalcNetPayout] = useState(true);
  const [manualNetPayout, setManualNetPayout] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const defaultChannel = (defaults?.channel || "other").toLowerCase();
    const channelValue = CHANNEL_OPTIONS.includes(defaultChannel as any)
      ? (defaultChannel as typeof channel)
      : "other";

    setChannel(channelValue);
    setSoldAt(toDateInput(defaults?.sold_at));
    setSoldPrice(centsToInput(defaults?.sold_price_cents));
    setShippingCharged(centsToInput(defaults?.shipping_charged_cents));
    setPlatformFees(centsToInput(defaults?.platform_fees_cents));
    setShippingCost(centsToInput(defaults?.shipping_cost_cents));
    setTax(centsToInput(defaults?.tax_cents));
    setCogs(centsToInput(defaults?.cogs_cents));
    setExternalOrderId(defaults?.external_order_id || "");
    setNotes(defaults?.notes || "");

    const defaultAutoNet = defaults?.net_payout_cents == null;
    setAutoCalcNetPayout(defaultAutoNet);
    setManualNetPayout(centsToInput(defaults?.net_payout_cents));
  }, [defaults, isOpen]);

  const computedNetPayoutCents = useMemo(
    () =>
      computeNetPayout({
        sold_price_cents: inputToCents(soldPrice),
        shipping_charged_cents: inputToCents(shippingCharged),
        platform_fees_cents: inputToCents(platformFees),
        shipping_cost_cents: inputToCents(shippingCost),
        tax_cents: inputToCents(tax),
      }),
    [platformFees, shippingCharged, shippingCost, soldPrice, tax]
  );

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!soldPrice.trim()) return;

    const payload: SaleFormPayload = {
      inventory_item_id: defaults?.inventory_item_id ?? null,
      channel,
      sold_at: soldAt,
      sold_price_cents: inputToCents(soldPrice),
      shipping_charged_cents: inputToCents(shippingCharged),
      platform_fees_cents: inputToCents(platformFees),
      shipping_cost_cents: inputToCents(shippingCost),
      tax_cents: inputToCents(tax),
      net_payout_cents: autoCalcNetPayout ? null : inputToCents(manualNetPayout),
      cogs_cents: showCogsField
        ? inputToCents(cogs)
        : defaults?.cogs_cents ?? null,
      notes: notes.trim() ? notes.trim() : null,
      external_order_id: externalOrderId.trim() ? externalOrderId.trim() : null,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl border border-white/[0.08] bg-[#111827] shadow-none">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-400">
              Sold Price ($)
              <input
                required
                type="number"
                step="0.01"
                value={soldPrice}
                onChange={(event) => setSoldPrice(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400">
              Channel
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as typeof channel)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-400">
              Sold Date
              <input
                type="date"
                value={soldAt}
                onChange={(event) => setSoldAt(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs text-gray-400">
              Shipping Charged ($)
              <input
                type="number"
                step="0.01"
                value={shippingCharged}
                onChange={(event) => setShippingCharged(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400">
              Platform Fees ($)
              <input
                type="number"
                step="0.01"
                value={platformFees}
                onChange={(event) => setPlatformFees(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400">
              Shipping Cost ($)
              <input
                type="number"
                step="0.01"
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="text-xs text-gray-400">
              Tax ($)
              <input
                type="number"
                step="0.01"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={autoCalcNetPayout}
              onChange={(event) => setAutoCalcNetPayout(event.target.checked)}
              className="rounded border-gray-600 text-emerald-500 focus:ring-emerald-500"
            />
            Auto-calc net payout
          </label>

          {autoCalcNetPayout ? (
            <p className="rounded border border-emerald-900/50 bg-emerald-950/30 px-2 py-1.5 text-xs text-emerald-300">
              Net payout preview: {formatMoney(computedNetPayoutCents)}
            </p>
          ) : (
            <label className="text-xs text-gray-400">
              Net Payout ($)
              <input
                type="number"
                step="0.01"
                value={manualNetPayout}
                onChange={(event) => setManualNetPayout(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
          )}

          {showCogsField && (
            <label className="text-xs text-gray-400">
              COGS ($)
              <input
                type="number"
                step="0.01"
                value={cogs}
                onChange={(event) => setCogs(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-400">
              External Order ID
              <input
                type="text"
                value={externalOrderId}
                onChange={(event) => setExternalOrderId(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
              <p className="mt-0.5 text-[11px] text-gray-500">
                Must be unique per business. Leave blank if not tracking an order ID.
              </p>
            </label>
            <label className="text-xs text-gray-400">
              Notes
              <input
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !soldPrice.trim()}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
