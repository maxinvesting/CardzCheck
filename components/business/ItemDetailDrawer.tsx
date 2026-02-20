"use client";

import { useState, useEffect, useCallback } from "react";
import type { BusinessInventoryItem, BusinessSale } from "@/types";

function fmtCents(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

interface Props {
  item: BusinessInventoryItem | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<BusinessInventoryItem>) => void;
  onAddSale: (sale: any) => void;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

export default function ItemDetailDrawer({
  item,
  onClose,
  onSave,
  onAddSale,
}: Props) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleForm, setSaleForm] = useState({
    sale_date: new Date().toISOString().slice(0, 10),
    sale_price: "",
    platform_fees: "",
    shipping_charged: "",
    shipping_paid: "",
    other_costs: "",
    order_id: "",
    buyer_handle: "",
    notes: "",
  });

  useEffect(() => {
    if (!item) return;
    setForm({
      title: item.title,
      quantity: item.quantity,
      status: item.status,
      channel: item.channel,
      condition_status: item.condition_status,
      grading_company: item.grading_company ?? "",
      grade: item.grade ?? "",
      cert_number: item.cert_number ?? "",
      location: item.location ?? "",
      acquisition_type: item.acquisition_type,
      acquisition_date: item.acquisition_date ?? "",
      cost_basis_total: fmtCents(item.cost_basis_total_cents),
      tax: fmtCents(item.tax_cents),
      shipping: fmtCents(item.shipping_cents),
      fees_paid: fmtCents(item.fees_paid_cents),
      list_price: fmtCents(item.list_price_cents),
      current_market_value: fmtCents(item.current_market_value_cents),
      notes: item.notes ?? "",
    });
  }, [item]);

  const loadSales = useCallback(async () => {
    if (!item) return;
    setSalesLoading(true);
    try {
      const res = await fetch(
        `/api/business/sales?inventory_item_id=${item.id}`
      );
      const data = await res.json();
      setSales(data.sales ?? []);
    } catch {
      // ignore
    } finally {
      setSalesLoading(false);
    }
  }, [item]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  if (!item) return null;

  const handleSave = () => {
    const toCents = (val: string) => {
      const n = parseFloat(val);
      return Number.isNaN(n) ? 0 : Math.round(n * 100);
    };

    onSave(item.id, {
      title: form.title,
      quantity: parseInt(form.quantity, 10) || 1,
      status: form.status,
      channel: form.channel,
      condition_status: form.condition_status,
      grading_company: form.grading_company || null,
      grade: form.grade || null,
      cert_number: form.cert_number || null,
      location: form.location || null,
      acquisition_type: form.acquisition_type,
      acquisition_date: form.acquisition_date || null,
      cost_basis_total_cents: toCents(form.cost_basis_total),
      tax_cents: toCents(form.tax),
      shipping_cents: toCents(form.shipping),
      fees_paid_cents: toCents(form.fees_paid),
      list_price_cents: form.list_price ? toCents(form.list_price) : null,
      current_market_value_cents: form.current_market_value
        ? toCents(form.current_market_value)
        : null,
      notes: form.notes || null,
    });
  };

  const handleAddSale = () => {
    const toCents = (val: string) => {
      const n = parseFloat(val);
      return Number.isNaN(n) ? 0 : Math.round(n * 100);
    };

    onAddSale({
      inventory_item_id: item.id,
      sale_date: saleForm.sale_date,
      sale_price_cents: toCents(saleForm.sale_price),
      platform_fees_cents: toCents(saleForm.platform_fees),
      shipping_charged_cents: toCents(saleForm.shipping_charged),
      shipping_paid_cents: toCents(saleForm.shipping_paid),
      other_costs_cents: toCents(saleForm.other_costs),
      order_id: saleForm.order_id || null,
      buyer_handle: saleForm.buyer_handle || null,
      notes: saleForm.notes || null,
    });
    setShowSaleForm(false);
    setSaleForm({
      sale_date: new Date().toISOString().slice(0, 10),
      sale_price: "",
      platform_fees: "",
      shipping_charged: "",
      shipping_paid: "",
      other_costs: "",
      order_id: "",
      buyer_handle: "",
      notes: "",
    });
    setTimeout(loadSales, 500);
  };

  const field = (
    label: string,
    key: string,
    type: "text" | "number" | "date" | "select" | "textarea" = "text",
    options?: readonly string[]
  ) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {type === "select" ? (
        <select
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          {options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none"
        />
      ) : (
        <input
          type={type}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      )}
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-[#0f1419] border-l border-gray-800 z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">Edit Item</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {field("Title", "title")}
            <div className="grid grid-cols-2 gap-4">
              {field("Quantity", "quantity", "number")}
              {field("Status", "status", "select", STATUS_OPTIONS)}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field("Channel", "channel", "select", CHANNEL_OPTIONS)}
              {field("Acquisition Type", "acquisition_type", "select", ACQ_OPTIONS)}
            </div>
            {field("Acquisition Date", "acquisition_date", "date")}
            <div className="grid grid-cols-2 gap-4">
              {field("Cost Basis ($)", "cost_basis_total", "number")}
              {field("Tax ($)", "tax", "number")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field("Shipping ($)", "shipping", "number")}
              {field("Fees Paid ($)", "fees_paid", "number")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field("Condition", "condition_status", "select", ["raw", "graded"] as const)}
              {field("Grading Co.", "grading_company")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {field("Grade", "grade")}
              {field("Cert #", "cert_number")}
            </div>
            {field("Storage", "location")}
            <div className="grid grid-cols-2 gap-4">
              {field("List Price ($)", "list_price", "number")}
              {field("Current Market Value ($)", "current_market_value", "number")}
            </div>
            {field("Notes", "notes", "textarea")}

            <button
              onClick={handleSave}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>

          {/* Sales section */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-semibold text-white">Sales History</h3>
              <button
                onClick={() => setShowSaleForm(!showSaleForm)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium"
              >
                + Add Sale
              </button>
            </div>

            {showSaleForm && (
              <div className="mb-4 p-4 bg-gray-900 border border-gray-800 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sale Date</label>
                    <input
                      type="date"
                      value={saleForm.sale_date}
                      onChange={(e) => setSaleForm({ ...saleForm, sale_date: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sale Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleForm.sale_price}
                      onChange={(e) => setSaleForm({ ...saleForm, sale_price: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Platform Fees ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleForm.platform_fees}
                      onChange={(e) => setSaleForm({ ...saleForm, platform_fees: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Shipping Charged ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleForm.shipping_charged}
                      onChange={(e) => setSaleForm({ ...saleForm, shipping_charged: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Shipping Paid ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleForm.shipping_paid}
                      onChange={(e) => setSaleForm({ ...saleForm, shipping_paid: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Other Costs ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleForm.other_costs}
                      onChange={(e) => setSaleForm({ ...saleForm, other_costs: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Order ID</label>
                    <input
                      type="text"
                      value={saleForm.order_id}
                      onChange={(e) => setSaleForm({ ...saleForm, order_id: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Buyer</label>
                    <input
                      type="text"
                      value={saleForm.buyer_handle}
                      onChange={(e) => setSaleForm({ ...saleForm, buyer_handle: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddSale}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded font-medium"
                  >
                    Save Sale
                  </button>
                  <button
                    onClick={() => setShowSaleForm(false)}
                    className="px-4 py-1.5 text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {salesLoading ? (
              <div className="text-sm text-gray-500">Loading sales...</div>
            ) : sales.length === 0 ? (
              <p className="text-sm text-gray-500">No sales recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {sales.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm text-white font-medium">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(s.sale_price_cents / 100)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {s.sale_date} · Net{" "}
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(s.net_proceeds_cents / 100)}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        s.profit_cents >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {s.profit_cents >= 0 ? "+" : ""}
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(s.profit_cents / 100)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
