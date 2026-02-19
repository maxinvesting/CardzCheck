"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: any) => void;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

export default function AddInventoryModal({ isOpen, onClose, onAdd }: Props) {
  const [form, setForm] = useState({
    title: "",
    quantity: "1",
    acquisition_type: "buy",
    acquisition_date: new Date().toISOString().slice(0, 10),
    cost_basis_total: "",
    tax: "",
    shipping: "",
    fees_paid: "",
    condition_status: "raw",
    grading_company: "",
    grade: "",
    cert_number: "",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    onAdd({
      title: form.title.trim(),
      quantity: parseInt(form.quantity, 10) || 1,
      acquisition_type: form.acquisition_type,
      acquisition_date: form.acquisition_date || null,
      cost_basis_total_cents: toCents(form.cost_basis_total),
      tax_cents: toCents(form.tax),
      shipping_cents: toCents(form.shipping),
      fees_paid_cents: toCents(form.fees_paid),
      condition_status: form.condition_status,
      grading_company: form.grading_company || null,
      grade: form.grade || null,
      cert_number: form.cert_number || null,
      location: form.location || null,
      channel: form.channel,
      status: form.status,
      list_price_cents: form.list_price ? toCents(form.list_price) : null,
      current_market_value_cents: form.current_market_value
        ? toCents(form.current_market_value)
        : null,
      notes: form.notes || null,
    });

    // Reset
    setForm({
      title: "",
      quantity: "1",
      acquisition_type: "buy",
      acquisition_date: new Date().toISOString().slice(0, 10),
      cost_basis_total: "",
      tax: "",
      shipping: "",
      fees_paid: "",
      condition_status: "raw",
      grading_company: "",
      grade: "",
      cert_number: "",
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
    options?: readonly string[]
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
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          value={(form as any)[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
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
          <h2 className="text-lg font-bold text-white">Add Inventory Item</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {inp("Title *", "title")}
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
            {inp("Condition", "condition_status", "select", ["raw", "graded"] as const)}
            {inp("Channel", "channel", "select", CHANNEL_OPTIONS)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {inp("Status", "status", "select", STATUS_OPTIONS)}
            {inp("Location", "location")}
          </div>
          {form.condition_status === "graded" && (
            <div className="grid grid-cols-3 gap-4">
              {inp("Grading Co.", "grading_company")}
              {inp("Grade", "grade")}
              {inp("Cert #", "cert_number")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {inp("List Price ($)", "list_price", "number")}
            {inp("Market Value ($)", "current_market_value", "number")}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!form.title.trim()}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            Add Item
          </button>
        </form>
      </div>
    </div>
  );
}
