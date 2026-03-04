"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: any) => void;
}

const PRODUCT_TYPES = [
  "Hobby Box",
  "Blaster Box",
  "Mega Box",
  "Hanger Box",
  "Fat Pack",
  "Cello Pack",
  "Retail Box",
  "Case",
  "Half Case",
  "Value Pack",
  "Gravity Pack",
  "Other",
] as const;

const SPORTS = [
  "Football",
  "Basketball",
  "Baseball",
  "Hockey",
  "Soccer",
  "UFC",
  "Wrestling",
  "Other",
] as const;

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

export default function AddWaxModal({ isOpen, onClose, onAdd }: Props) {
  const [form, setForm] = useState({
    year: new Date().getFullYear().toString(),
    brand: "",
    set_name: "",
    sport: "Football",
    product_type: "Hobby Box",
    quantity: "1",
    acquisition_type: "buy",
    acquisition_date: new Date().toISOString().slice(0, 10),
    cost_basis_total: "",
    tax: "",
    shipping: "",
    fees_paid: "",
    location: "",
    channel: "ebay",
    status: "unlisted",
    list_price: "",
    current_market_value: "",
    notes: "",
  });

  if (!isOpen) return null;

  const toCents = (val: string) => {
    const n = parseFloat(val);
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  };

  const buildTitle = () => {
    const parts = [form.year, form.brand, form.set_name, form.sport, form.product_type].filter(
      (p) => p && p.trim()
    );
    return parts.join(" ").trim() || "Sealed Product";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = buildTitle();
    if (!title) return;

    onAdd({
      title,
      quantity: parseInt(form.quantity, 10) || 1,
      acquisition_type: form.acquisition_type,
      acquisition_date: form.acquisition_date || null,
      cost_basis_total_cents: toCents(form.cost_basis_total),
      tax_cents: toCents(form.tax),
      shipping_cents: toCents(form.shipping),
      fees_paid_cents: toCents(form.fees_paid),
      condition_status: "raw",
      location: form.location || null,
      channel: form.channel,
      status: form.status,
      list_price_cents: form.list_price ? toCents(form.list_price) : null,
      current_market_value_cents: form.current_market_value
        ? toCents(form.current_market_value)
        : null,
      notes: [
        `[WAX]`,
        `Sport: ${form.sport}`,
        `Product: ${form.product_type}`,
        form.notes,
      ]
        .filter(Boolean)
        .join(" | "),
    });

    setForm({
      year: new Date().getFullYear().toString(),
      brand: "",
      set_name: "",
      sport: "Football",
      product_type: "Hobby Box",
      quantity: "1",
      acquisition_type: "buy",
      acquisition_date: new Date().toISOString().slice(0, 10),
      cost_basis_total: "",
      tax: "",
      shipping: "",
      fees_paid: "",
      location: "",
      channel: "ebay",
      status: "unlisted",
      list_price: "",
      current_market_value: "",
      notes: "",
    });
    onClose();
  };

  const inp = (
    label: string,
    key: string,
    type: "text" | "number" | "date" | "select" = "text",
    options?: readonly string[],
    placeholder?: string
  ) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {type === "select" ? (
        <select
          value={(form as any)[key]}
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
          value={(form as any)[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
      )}
    </div>
  );

  const previewTitle = buildTitle();

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#111827] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Add Wax / Sealed Product
            </h2>
            <p className="text-xs text-gray-500 mt-1">Track boxes, cases, and sealed product in your inventory</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {previewTitle && previewTitle !== "Sealed Product" && (
            <div className="px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg">
              <p className="text-xs text-gray-500 mb-0.5">Preview</p>
              <p className="text-sm text-white font-medium">{previewTitle}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {inp("Year *", "year", "text", undefined, "2024")}
            {inp("Sport", "sport", "select", SPORTS)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("Brand", "brand", "text", undefined, "Panini")}
            {inp("Set / Product Line", "set_name", "text", undefined, "Prizm")}
          </div>
          {inp("Product Type", "product_type", "select", PRODUCT_TYPES)}
          <div className="grid grid-cols-2 gap-4">
            {inp("Quantity", "quantity", "number")}
            {inp("Acquisition Type", "acquisition_type", "select", ACQ_OPTIONS)}
          </div>
          {inp("Acquisition Date", "acquisition_date", "date")}
          <div className="grid grid-cols-2 gap-4">
            {inp("Cost Basis ($)", "cost_basis_total", "number")}
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
          {inp("Storage", "location", "text", undefined, "Storage unit, safe, etc.")}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Sealed, opened, hit details, etc."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
          >
            Add Wax to Inventory
          </button>
        </form>
      </div>
    </div>
  );
}
