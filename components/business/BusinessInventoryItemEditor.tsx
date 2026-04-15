"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { BusinessInventoryItem, WorthGradingResult } from "@/types";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import { useGradeEstimateFromImages } from "@/lib/grading/useGradeEstimateFromImages";
import { gradingCopy } from "@/copy/grading";
import { formatEbayTitle, calculateEbayParityPrice } from "@/lib/ebay/parity-price";
import type { EbayFeeRateKey } from "@/lib/ebay/parity-price";
import EbayListingModal from "@/components/business/EbayListingModal";
import GetCompsButton from "@/components/ui/GetCompsButton";
import { compsParamsFromTitle } from "@/lib/ebay/comps-url";

function fmtCents(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

type EditorTone = "dark" | "light";

interface Props {
  item: BusinessInventoryItem | null;
  onSave: (id: string, updates: Partial<BusinessInventoryItem>) => void | Promise<void>;
  onClose?: () => void;
  tone?: EditorTone;
  showOpenProfileLink?: boolean;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

function getDaysHeld(acquisitionDate: string | null | undefined): number | null {
  if (!acquisitionDate) return null;
  const acq = new Date(acquisitionDate);
  if (isNaN(acq.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - acq.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysHeldColor(days: number | null, tone: EditorTone): string {
  if (days === null) return tone === "dark" ? "text-gray-500" : "text-gray-400";
  if (days < 30) return tone === "dark" ? "text-emerald-400" : "text-emerald-700";
  if (days <= 60) return tone === "dark" ? "text-amber-400" : "text-amber-700";
  return tone === "dark" ? "text-red-400" : "text-red-600";
}

export default function BusinessInventoryItemEditor({
  item,
  onSave,
  onClose,
  tone = "dark",
  showOpenProfileLink = true,
}: Props) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [cmvLoading, setCmvLoading] = useState(false);
  const [cardForGrade, setCardForGrade] = useState<{
    imageUrls: string[];
    cardIdentity: GradeEstimatorCardInput;
  } | null>(null);
  const [cardForGradeLoading, setCardForGradeLoading] = useState(false);
  const [valueResult, setValueResult] = useState<WorthGradingResult | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [ebayTitleCopied, setEbayTitleCopied] = useState(false);
  const [showEbayListingModal, setShowEbayListingModal] = useState(false);

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

  useEffect(() => {
    if (!item?.card_id) {
      setCardForGrade(null);
      return;
    }
    let cancelled = false;
    setCardForGradeLoading(true);
    setCardForGrade(null);
    fetch(`/api/cards/${item.card_id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.card) return;
        const card = data.card;
        const images = card.card_images ?? [];
        const imageUrls = images
          .map((img: { url?: string }) => img?.url)
          .filter((u: unknown): u is string => typeof u === "string" && u.length > 0);
        if (imageUrls.length === 0 && card.trusted_image?.frontCandidates?.length) {
          imageUrls.push(...card.trusted_image.frontCandidates);
        }
        const cardIdentity: GradeEstimatorCardInput = {
          player_name: card.player_name ?? "",
          year: card.year,
          set_name: card.set_name,
          card_number: card.card_number,
          parallel_type: card.parallel_type,
          variation: card.variation,
          insert: card.insert,
        };
        setCardForGrade({ imageUrls, cardIdentity });
      })
      .catch(() => {
        if (!cancelled) setCardForGrade(null);
      })
      .finally(() => {
        if (!cancelled) setCardForGradeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item?.card_id]);

  const gradeEstimate = useGradeEstimateFromImages({
    imageUrls: cardForGrade?.imageUrls ?? [],
    card: cardForGrade?.cardIdentity ?? null,
  });

  const fetchWorthGrading = useCallback(async () => {
    if (!cardForGrade?.cardIdentity || !gradeEstimate.estimate?.grade_probabilities) {
      return;
    }
    setValueLoading(true);
    setValueError(null);
    try {
      const response = await fetch("/api/grade-estimator/value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: cardForGrade.cardIdentity,
          gradeProbabilities: gradeEstimate.estimate.grade_probabilities,
          estimatorConfidence: gradeEstimate.estimate.grade_probabilities.confidence,
        }),
      });
      if (!response.ok) throw new Error("POST_GRADING_VALUE_UNAVAILABLE");
      const result: WorthGradingResult = await response.json();
      setValueResult(result);
    } catch {
      setValueResult(null);
      setValueError(gradingCopy.status.postGradingValueFailed);
    } finally {
      setValueLoading(false);
    }
  }, [cardForGrade, gradeEstimate.estimate]);

  useEffect(() => {
    if (!cardForGrade?.cardIdentity || !gradeEstimate.estimate?.grade_probabilities) {
      setValueResult(null);
      setValueError(null);
      setValueLoading(false);
      return;
    }
    void fetchWorthGrading();
  }, [cardForGrade, gradeEstimate.estimate, fetchWorthGrading]);

  const ratingLabel = (rating: WorthGradingResult["rating"]): string => {
    switch (rating) {
      case "strong_yes":
        return "Strong yes";
      case "yes":
        return "Yes";
      case "maybe":
        return "Maybe";
      default:
        return "No";
    }
  };

  if (!item) return null;

  const dark = tone === "dark";
  const daysHeld = getDaysHeld(form.acquisition_date || item.acquisition_date);
  const daysHeldColor = getDaysHeldColor(daysHeld, tone);
  const labelClass = dark ? "block text-xs text-gray-400 mb-1" : "block text-xs text-[#6F7D74] mb-1 font-medium";
  const inputClass = dark
    ? "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
    : "w-full bg-white border border-[#DCE9E1] rounded-lg px-3 py-2 text-sm text-[#101A14]";
  const cardClass = dark
    ? "rounded-lg border border-gray-800 bg-gray-900/70"
    : "rounded-lg border border-[#DCE9E1] bg-[#FBFEFC]";

  const handleSave = () => {
    if (!form.title?.trim()) {
      setValidationError("Title cannot be empty.");
      return;
    }
    const costVal = parseFloat(form.cost_basis_total);
    if (!isNaN(costVal) && costVal < 0) {
      setValidationError("Cost basis cannot be negative.");
      return;
    }
    setValidationError(null);

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
      current_market_value_cents: form.current_market_value ? toCents(form.current_market_value) : null,
      notes: form.notes || null,
    });
  };

  const handleFetchCmv = async () => {
    if (!item?.title?.trim()) return;
    setCmvLoading(true);
    try {
      const res = await fetch(`/api/business/inventory/fetch-cmv?item_id=${encodeURIComponent(item.id)}`);
      const data = await res.json().catch(() => null);
      const cmv = data?.cmv;
      if (typeof cmv === "number" && Number.isFinite(cmv) && cmv > 0) {
        const cents = Math.round(cmv * 100);
        setForm((prev) => ({ ...prev, current_market_value: cmv.toFixed(2) }));
        onSave(item.id, { current_market_value_cents: cents });
      }
    } finally {
      setCmvLoading(false);
    }
  };

  const field = (
    label: string,
    key: string,
    type: "text" | "number" | "date" | "select" | "textarea" = "text",
    options?: readonly string[]
  ) => (
    <div>
      <label className={labelClass}>{label}</label>
      {type === "select" ? (
        <select
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className={inputClass}
        >
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className={inputClass}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className={`text-lg font-bold ${dark ? "text-white" : "text-[#101A14]"}`}>Edit Item</h2>
          <div className="flex items-center gap-2">
            {item.status !== "sold" && !item.ebay_item_id && (
              <button
                type="button"
                onClick={() => setShowEbayListingModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#86b817] hover:bg-[#86b817]/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span className="text-xs font-extrabold tracking-tight">
                  <span style={{ color: "#e43137" }}>e</span>
                  <span style={{ color: "#0064d3" }}>B</span>
                  <span style={{ color: "#f5af02" }}>a</span>
                  <span style={{ color: "#86b817" }}>y</span>
                </span>
                <span>List on eBay</span>
              </button>
            )}
            <GetCompsButton
              params={
                cardForGrade?.cardIdentity
                  ? {
                      player: cardForGrade.cardIdentity.player_name,
                      year: cardForGrade.cardIdentity.year?.toString(),
                      setName: cardForGrade.cardIdentity.set_name,
                      parallel: cardForGrade.cardIdentity.parallel_type,
                      grade: form.grade || item.grade,
                      gradingCompany: form.grading_company || item.grading_company,
                    }
                  : compsParamsFromTitle(
                      item.title,
                      form.grade || item.grade,
                      form.grading_company || item.grading_company
                    )
              }
            />
            {showOpenProfileLink && item.id && (
              <Link
                href={`/card/${item.id}?from=business`}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                </svg>
                Open card profile
              </Link>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className={`${dark ? "text-gray-400 hover:text-white" : "text-gray-400 hover:text-[#101A14]"} p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const title = item.title || "";
            const ebayTitle = formatEbayTitle({
              player: title,
              grade: form.grade || item.grade,
              grading_company: form.grading_company || item.grading_company,
            });
            navigator.clipboard.writeText(ebayTitle || title).then(() => {
              setEbayTitleCopied(true);
              setTimeout(() => setEbayTitleCopied(false), 2000);
            });
          }}
          className={`mb-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-medium transition-colors ${dark ? "bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300" : "bg-white hover:bg-[#F6FAF7] border border-[#DCE9E1] text-[#2E3B33]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          {ebayTitleCopied ? "Copied!" : "Copy eBay Title"}
        </button>

        <div className={`mb-4 px-4 py-3 ${cardClass}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs uppercase tracking-wider ${dark ? "text-gray-400" : "text-[#6F7D74]"}`}>Days Held</span>
            <span className={`text-lg font-bold tabular-nums ${daysHeldColor}`}>
              {daysHeld !== null ? `${daysHeld} days` : "—"}
            </span>
          </div>
          {daysHeld !== null && (
            <p className={`text-[10px] mt-1 ${dark ? "text-gray-500" : "text-[#6F7D74]"}`}>
              {daysHeld < 30
                ? "Recently acquired"
                : daysHeld <= 60
                ? "Consider listing or selling soon"
                : "Held over 60 days - consider taking action"}
            </p>
          )}
        </div>

        {validationError && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${dark ? "border border-red-800 bg-red-900/30 text-red-300" : "border border-red-200 bg-red-50 text-red-700"}`}>
            {validationError}
          </div>
        )}

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
            <div>
              <label className={labelClass}>Est. Market Value ($)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={form.current_market_value ?? ""}
                  onChange={(e) => setForm({ ...form, current_market_value: e.target.value })}
                  className={inputClass}
                />
                {(!form.current_market_value || form.current_market_value === "0" || form.current_market_value === "0.00") && (
                  <button
                    type="button"
                    onClick={handleFetchCmv}
                    disabled={cmvLoading || !item.title?.trim()}
                    className={`shrink-0 px-3 py-2 disabled:opacity-50 text-sm rounded-lg font-medium ${dark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-[#1C8C58] hover:bg-[#146B42] text-white"}`}
                  >
                    {cmvLoading ? "..." : "Get estimate"}
                  </button>
                )}
              </div>
            </div>
          </div>
          {(() => {
            const listPriceCents = item.list_price_cents;
            if (!listPriceCents || listPriceCents <= 0) return null;
            const listPriceDollars = listPriceCents / 100;
            const feeRateKey: EbayFeeRateKey =
              typeof window !== "undefined"
                ? ((window.localStorage.getItem("cardzcheck_ebay_fee_rate") as EbayFeeRateKey) || "standard")
                : "standard";
            const parityPrice = calculateEbayParityPrice(listPriceDollars, feeRateKey);
            const feeLabel = feeRateKey === "top_rated_plus" ? "12% TRP" : "13% Std";
            return (
              <div className={`p-3 ${cardClass}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-medium ${dark ? "text-gray-400" : "text-[#6F7D74]"}`}>
                      eBay Parity Price
                    </p>
                    <p className={`text-lg font-semibold ${dark ? "text-blue-400" : "text-[#146B42]"}`}>
                      ${parityPrice.toFixed(2)}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${dark ? "text-gray-500 bg-gray-800" : "text-[#6F7D74] bg-[#F6FAF7]"}`}>
                    {feeLabel} fee
                  </span>
                </div>
                <p className={`text-[10px] mt-1 ${dark ? "text-gray-500" : "text-[#6F7D74]"}`}>
                  List at this price on eBay to net the same as your ${listPriceDollars.toFixed(2)} shop price after fees.
                </p>
              </div>
            );
          })()}

          {field("Notes", "notes", "textarea")}
          <button
            onClick={handleSave}
            className={`w-full py-2.5 min-h-[44px] text-white font-medium rounded-lg transition-colors ${dark ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#1C8C58] hover:bg-[#146B42]"}`}
          >
            Save Changes
          </button>
        </div>

        <div className={`mt-8 pt-6 ${dark ? "border-t border-gray-800" : "border-t border-[#DCE9E1]"}`} id="grade-probability-block">
          <h3 className={`text-md font-semibold mb-3 ${dark ? "text-white" : "text-[#101A14]"}`}>{gradingCopy.page.title}</h3>
          {!item.card_id ? (
            <p className={`text-xs ${dark ? "text-gray-500" : "text-[#6F7D74]"}`}>
              Grade probability is available for items linked to a card with photos.
            </p>
          ) : cardForGradeLoading ? (
            <p className={`text-xs ${dark ? "text-gray-500" : "text-[#6F7D74]"}`}>Loading card photos...</p>
          ) : !cardForGrade || cardForGrade.imageUrls.length === 0 ? (
            <p className={`text-xs ${dark ? "text-gray-500" : "text-[#6F7D74]"}`}>
              No photos on the linked card. Add photos in the{" "}
              <Link href={`/card/${item.id}?from=business`} className={dark ? "text-blue-400 hover:underline" : "text-[#146B42] hover:underline"}>
                card profile
              </Link>{" "}
              to run grade probability.
            </p>
          ) : (
            <>
              {!gradeEstimate.estimate && !gradeEstimate.isRunning && !gradeEstimate.error && (
                <button
                  type="button"
                  onClick={() => void gradeEstimate.run()}
                  className={`px-3 py-2.5 min-h-[44px] disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors ${dark ? "bg-blue-600 hover:bg-blue-700" : "bg-[#1C8C58] hover:bg-[#146B42]"}`}
                >
                  Run grade estimate
                </button>
              )}
              {gradeEstimate.estimate && !gradeEstimate.isRunning && (
                <button
                  type="button"
                  onClick={() => {
                    gradeEstimate.reset();
                    void gradeEstimate.run();
                  }}
                  className={`mt-2 px-3 py-2.5 min-h-[44px] text-white text-xs font-medium rounded-lg transition-colors ${dark ? "bg-gray-700 hover:bg-gray-600" : "bg-[#2E3B33] hover:bg-[#1E2822]"}`}
                >
                  Re-run grade estimate
                </button>
              )}
              {gradeEstimate.isRunning && gradeEstimate.job && (
                <div className="mt-2">
                  <GradeEstimateProgressPanel
                    status={gradeEstimate.job.status}
                    steps={gradeEstimate.job.steps}
                    errorMessage={gradeEstimate.job.error ?? null}
                  />
                </div>
              )}
              {gradeEstimate.error && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className={`text-xs ${dark ? "text-amber-400" : "text-amber-700"}`}>{gradeEstimate.error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      gradeEstimate.reset();
                      void gradeEstimate.run();
                    }}
                    className={dark ? "text-xs text-blue-400 hover:underline" : "text-xs text-[#146B42] hover:underline"}
                  >
                    Retry
                  </button>
                </div>
              )}
              {gradeEstimate.estimate && (
                <div className="mt-3">
                  <GradeProbabilityPanel
                    estimate={gradeEstimate.estimate}
                    cardIdentity={cardForGrade.cardIdentity}
                    primaryImageUrl={cardForGrade.imageUrls[0] ?? null}
                    imageUrls={cardForGrade.imageUrls}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showEbayListingModal && item && (
        <EbayListingModal
          item={item}
          onClose={() => setShowEbayListingModal(false)}
          onSuccess={(listingId) => {
            onSave(item.id, { status: "listed", channel: "ebay", ebay_item_id: listingId });
            setShowEbayListingModal(false);
          }}
        />
      )}
    </>
  );
}
