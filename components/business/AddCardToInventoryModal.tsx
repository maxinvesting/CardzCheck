"use client";

import { useState, useEffect } from "react";
import { normalizeCertWriteFields } from "@/lib/images/cert-image";
import CardPhotoUploader from "@/components/business/CardPhotoUploader";

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
  imageUrls?: string[];
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

const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other", "veriswap"] as const;
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
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Seed images from any photo the card already arrived with (grade scan,
  // smart-search, etc.); a fresh manual add starts with none.
  useEffect(() => {
    if (!isOpen) return;
    const seeded = [card?.user_image_url, card?.imageUrl, ...(card?.imageUrls ?? [])].filter(
      (u): u is string => typeof u === "string" && u.length > 0
    );
    setImages(Array.from(new Set(seeded)));
  }, [isOpen, card]);


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
  }, [isOpen, card]);

  if (!isOpen || !card) return null;

  const toCents = (val: string) => {
    const n = parseFloat(val);
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  };

  const title = buildTitle(card);
  const gradeFields = resolveGradeFields(card);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0) {
      setError("Add at least one photo of the card before saving.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const parsedQuantity = Math.max(1, Number.parseInt(form.quantity, 10) || 1);
      const normalizedCert = normalizeCertWriteFields({
        grading_company: gradeFields.gradingCompany,
        cert_number: card.psa_cert_number,
      });
      const resolvedImageUrl = images[0] ?? card.user_image_url ?? card.imageUrl ?? null;
      const resolvedImageSource = resolvedImageUrl ? "user" : "none";

      const res = await fetch("/api/business/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: card.card_id ?? null,
          title,
          player_name: card.player_name,
          year: card.year ?? null,
          set_name: card.set_name ?? null,
          parallel_type: card.parallel_type ?? null,
          card_number: card.card_number ?? null,
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
          cert_number: normalizedCert.cert_number ?? null,
          psa_cert_number: normalizedCert.psa_cert_number ?? null,
          channel: form.channel,
          status: form.status,
          list_price_cents: form.list_price ? toCents(form.list_price) : null,
          current_market_value_cents: form.current_market_value
            ? toCents(form.current_market_value)
            : null,
          image_url: resolvedImageUrl,
          image_source: resolvedImageSource,
          image_urls: images,
          user_image_url: resolvedImageUrl,
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
      setImages([]);

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
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </span>
      {type === "select" ? (
        <select
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] focus:border-[#20B26B] focus:outline-none"
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
          className="w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none"
        />
      )}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add card to inventory"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Inventory
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-[#E6E8EB]">
              Add Card to Inventory
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className="px-1 text-lg leading-none text-[#77808C] hover:text-[#E6E8EB]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4">
            {/* Card photos — left rail (required) */}
            <aside className="w-full flex-shrink-0 sm:w-56">
              <div className="border border-[#24282D] bg-[#0F1317] p-3">
                <CardPhotoUploader
                  images={images}
                  onChange={setImages}
                  max={gradeFields.conditionStatus === "graded" ? 3 : 10}
                  onUploadingChange={setUploading}
                  onError={setError}
                  size="md"
                />
                <p className="mt-2 text-[10px] leading-snug text-[#5A626E]">
                  {gradeFields.conditionStatus === "graded"
                    ? "Up to 3 photos for graded cards."
                    : "Up to 10 photos for raw cards."}{" "}
                  At least one is required.
                </p>

                <div className="mt-3 border-t border-[#24282D] pt-2">
                  <p className="truncate text-sm font-semibold text-[#E6E8EB]">
                    {card.player_name}
                  </p>
                  {card.year && <p className="text-xs text-[#77808C]">{card.year}</p>}
                  {card.set_name && (
                    <p className="truncate text-xs text-[#77808C]">{card.set_name}</p>
                  )}
                  {card.parallel_type && (
                    <p className="mt-1 text-xs font-medium text-[#20B26B]">{card.parallel_type}</p>
                  )}
                  {gradeFields.gradeLabel && (
                    <p className="mt-1 text-xs font-medium text-[#5FA8FF]">{gradeFields.gradeLabel}</p>
                  )}
                </div>
              </div>
            </aside>

            {/* Form fields */}
            <div className="min-w-0 flex-1 space-y-4">
              {error && (
                <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {inp("Quantity", "quantity", "number")}
                {inp("Acquisition Type", "acquisition_type", "select", ACQ_OPTIONS)}
                {inp("Acquisition Date", "acquisition_date", "date")}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inp("Cost Basis ($)", "cost_basis", "number")}
                {inp("Tax ($)", "tax", "number")}
                {inp("Shipping ($)", "shipping", "number")}
                {inp("Fees ($)", "fees_paid", "number")}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inp("Channel", "channel", "select", CHANNEL_OPTIONS)}
                {inp("Status", "status", "select", STATUS_OPTIONS)}
                {inp("List Price ($)", "list_price", "number")}
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                    Market Value / Card ($)
                    {cmvLoading && (
                      <span className="ml-2 text-[#F0B429]">Fetching…</span>
                    )}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.current_market_value}
                    onChange={(e) =>
                      setForm({ ...form, current_market_value: e.target.value })
                    }
                    placeholder="Override estimate"
                    className="w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {inp("Storage", "location", "text", undefined, "Storage unit, binder, etc.")}
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                    Notes
                  </span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Serial number, condition notes, etc."
                    className="w-full resize-none border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="flex items-center justify-end gap-2 border-t border-[#24282D] px-5 py-3">
            <button
              type="button"
              onClick={() => !loading && onClose()}
              className="border border-[#343941] px-4 py-2 text-xs font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading || images.length === 0}
              title={images.length === 0 ? "Add at least one photo first" : undefined}
              className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-xs font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Adding…" : "Add to Inventory"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
