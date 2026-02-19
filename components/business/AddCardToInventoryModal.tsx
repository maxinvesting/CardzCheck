"use client";

import { useState } from "react";

export interface PendingInventoryCard {
  player_name: string;
  year?: string;
  set_name?: string;
  parallel_type?: string;
  card_number?: string;
  grade?: string;
  imageUrl?: string;
}

interface Props {
  isOpen: boolean;
  card: PendingInventoryCard | null;
  onClose: () => void;
  onSuccess: (playerName: string) => void;
}

const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

function buildTitle(card: PendingInventoryCard): string {
  return (
    [card.year, card.player_name, card.set_name, card.parallel_type, card.grade]
      .filter(Boolean)
      .join(" ")
      .trim() || card.player_name
  );
}

export default function AddCardToInventoryModal({ isOpen, card, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    acquisition_type: "buy",
    acquisition_date: new Date().toISOString().slice(0, 10),
    cost_basis: "",
    tax: "",
    shipping: "",
    fees_paid: "",
    channel: "ebay",
    status: "unlisted",
    list_price: "",
    current_market_value: "",
    location: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !card) return null;

  const toCents = (val: string) => {
    const n = parseFloat(val);
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  };

  const title = buildTitle(card);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/business/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          quantity: 1,
          acquisition_type: form.acquisition_type,
          acquisition_date: form.acquisition_date || null,
          cost_basis_total_cents: toCents(form.cost_basis),
          tax_cents: toCents(form.tax),
          shipping_cents: toCents(form.shipping),
          fees_paid_cents: toCents(form.fees_paid),
          condition_status: card.grade && card.grade.toLowerCase() !== "raw" ? "graded" : "raw",
          grade: card.grade || null,
          channel: form.channel,
          status: form.status,
          list_price_cents: form.list_price ? toCents(form.list_price) : null,
          current_market_value_cents: form.current_market_value
            ? toCents(form.current_market_value)
            : null,
          location: form.location || null,
          notes: form.notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add card");
      }

      // Reset form
      setForm({
        acquisition_type: "buy",
        acquisition_date: new Date().toISOString().slice(0, 10),
        cost_basis: "",
        tax: "",
        shipping: "",
        fees_paid: "",
        channel: "ebay",
        status: "unlisted",
        list_price: "",
        current_market_value: "",
        location: "",
        notes: "",
      });

      onSuccess(card.player_name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setLoading(false);
    }
  };

  const inp = (
    label: string,
    key: keyof typeof form,
    type: "text" | "number" | "date" | "select" = "text",
    options?: readonly string[],
    placeholder?: string
  ) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {type === "select" ? (
        <select
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <h2 className="text-lg font-bold text-white">Add Card to Inventory</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Card Preview */}
          <div className="flex gap-3 p-3 bg-gray-800/60 border border-gray-700/50 rounded-xl">
            {card.imageUrl && (
              <img
                src={card.imageUrl}
                alt={card.player_name}
                className="w-14 h-20 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{card.player_name}</p>
              {card.year && <p className="text-xs text-gray-400">{card.year}</p>}
              {card.set_name && (
                <p className="text-xs text-gray-400 truncate">{card.set_name}</p>
              )}
              {card.parallel_type && (
                <p className="text-xs text-emerald-400">{card.parallel_type}</p>
              )}
              {card.grade && (
                <p className="text-xs text-blue-400 font-medium">{card.grade}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {inp("Acquisition Type", "acquisition_type", "select", ACQ_OPTIONS)}
            {inp("Acquisition Date", "acquisition_date", "date")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("Cost Basis ($)", "cost_basis", "number")}
            {inp("Tax ($)", "tax", "number")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("Shipping ($)", "shipping", "number")}
            {inp("Fees ($)", "fees_paid", "number")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("Channel", "channel", "select", CHANNEL_OPTIONS)}
            {inp("Status", "status", "select", STATUS_OPTIONS)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("List Price ($)", "list_price", "number")}
            {inp("Market Value ($)", "current_market_value", "number")}
          </div>
          {inp("Location", "location", "text", undefined, "Storage unit, binder, etc.")}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Serial number, condition notes, etc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Adding..." : "Add to Inventory"}
          </button>
        </form>
      </div>
    </div>
  );
}
