"use client";

import { useState, useEffect } from "react";

export interface PendingInventoryCard {
  card_id?: string;
  player_name: string;
  year?: string;
  set_name?: string;
  parallel_type?: string;
  card_number?: string;
  grader?: string;
  grade?: string;
  imageUrl?: string;
  user_image_url?: string;
  psa_cert_number?: string;
  quantity?: number;
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
const GRADER_GRADE_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
const WHOLE_GRADE_PATTERN = /^\d+(?:\.0)?$/;
const HALF_GRADE_PATTERN = /^\d+\.5$/;

function inferGradingCompany(gradeValue: string): string | null {
  if (HALF_GRADE_PATTERN.test(gradeValue)) return "BGS";
  if (WHOLE_GRADE_PATTERN.test(gradeValue)) return "PSA";
  return null;
}

function resolveGradeFields(card: PendingInventoryCard): {
  conditionStatus: "raw" | "graded";
  gradingCompany: string | null;
  gradeValue: string | null;
  gradeLabel: string | null;
} {
  const rawGrader = card.grader?.trim() || "";
  const rawGrade = card.grade?.trim() || "";
  const graderUpper = rawGrader ? rawGrader.toUpperCase() : "";

  if (graderUpper === "RAW" || rawGrade.toLowerCase() === "raw") {
    return {
      conditionStatus: "raw",
      gradingCompany: null,
      gradeValue: null,
      gradeLabel: null,
    };
  }

  const parsed = rawGrade.match(GRADER_GRADE_PATTERN);
  const parsedGrader = parsed?.[1]?.toUpperCase();
  const parsedGradeValue = parsed?.[2];
  const normalizedGradeValue = parsedGradeValue || rawGrade || "";

  const gradingCompany =
    graderUpper && graderUpper !== "RAW"
      ? graderUpper
      : parsedGrader || inferGradingCompany(normalizedGradeValue) || null;
  const gradeValue = normalizedGradeValue || null;

  if (!gradingCompany && !gradeValue) {
    return {
      conditionStatus: "raw",
      gradingCompany: null,
      gradeValue: null,
      gradeLabel: null,
    };
  }

  const gradeLabel = [gradingCompany, gradeValue]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    conditionStatus: "graded",
    gradingCompany,
    gradeValue,
    gradeLabel: gradeLabel || null,
  };
}

function buildTitle(card: PendingInventoryCard): string {
  const grade = resolveGradeFields(card);
  return (
    [card.year, card.player_name, card.set_name, card.parallel_type, grade.gradeLabel]
      .filter(Boolean)
      .join(" ")
      .trim() || card.player_name
  );
}

export default function AddCardToInventoryModal({ isOpen, card, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    quantity: String(Math.max(1, card?.quantity ?? 1)),
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
  const [cmvLoading, setCmvLoading] = useState(false);

  // Fetch estimated CMV when modal opens with a card
  useEffect(() => {
    if (!isOpen || !card?.player_name) return;
    setForm((prev) => ({
      ...prev,
      quantity: String(Math.max(1, card.quantity ?? 1)),
    }));
    setCmvLoading(true);
    const q = new URLSearchParams({ player: card.player_name, format: "dual" });
    if (card.year) q.set("year", card.year);
    if (card.set_name) q.set("set", card.set_name);
    const grade = resolveGradeFields(card);
    if (grade.gradeLabel) q.set("grade", grade.gradeLabel);
    if (card.card_number) q.set("card_number", card.card_number);
    if (card.parallel_type) q.set("parallel_type", card.parallel_type);
    fetch(`/api/search?${q.toString()}`)
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        const modeledCmv =
          data?._marketDiscount?.cmv != null &&
          typeof data._marketDiscount.cmv === "number" &&
          Number.isFinite(data._marketDiscount.cmv) &&
          data._marketDiscount.cmv > 0
            ? data._marketDiscount.cmv
            : null;

        const cmv = modeledCmv;
        if (cmv != null) {
          setForm((prev) => ({
            ...prev,
            current_market_value: String(cmv),
          }));
        }
      })
      .finally(() => setCmvLoading(false));
  }, [isOpen, card?.player_name, card?.year, card?.set_name, card?.grader, card?.grade, card?.card_number, card?.parallel_type]);

  if (!isOpen || !card) return null;

  const toCents = (val: string) => {
    const n = parseFloat(val);
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  };

  const title = buildTitle(card);
  const gradeFields = resolveGradeFields(card);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const parsedQuantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1);

      const res = await fetch("/api/business/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: card.card_id ?? null,
          title,
          quantity: parsedQuantity,
          acquisition_type: form.acquisition_type,
          acquisition_date: form.acquisition_date || null,
          cost_basis_total_cents: toCents(form.cost_basis),
          tax_cents: toCents(form.tax),
          shipping_cents: toCents(form.shipping),
          fees_paid_cents: toCents(form.fees_paid),
          condition_status: gradeFields.conditionStatus,
          grading_company: gradeFields.gradingCompany,
          grade: gradeFields.gradeValue,
          psa_cert_number: card.psa_cert_number || null,
          channel: form.channel,
          status: form.status,
          list_price_cents: form.list_price ? toCents(form.list_price) : null,
          current_market_value_cents: form.current_market_value
            ? toCents(form.current_market_value)
            : null,
          image_url: card.user_image_url || card.imageUrl || null,
          image_source: card.user_image_url ? "user" : "none",
          user_image_url: card.user_image_url || null,
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
        quantity: "1",
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
          min={type === "number" && key === "quantity" ? "1" : undefined}
          step={
            type === "number"
              ? key === "quantity"
                ? "1"
                : "0.01"
              : undefined
          }
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
      <div className="bg-[#111827] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-none max-h-[90vh] overflow-y-auto">
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
              {gradeFields.gradeLabel && (
                <p className="text-xs text-blue-400 font-medium">{gradeFields.gradeLabel}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {inp("Quantity", "quantity", "number")}
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
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Market Value / Card ($)
                {cmvLoading && (
                  <span className="ml-2 text-amber-400">Fetching estimate…</span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                value={form.current_market_value}
                onChange={(e) =>
                  setForm({ ...form, current_market_value: e.target.value })
                }
                placeholder="Override with your own value"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              />
            </div>
          </div>
          {inp("Storage", "location", "text", undefined, "Storage unit, binder, etc.")}
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
