"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { BusinessInventoryItem, WorthGradingResult } from "@/types";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import { useGradeEstimateFromImages } from "@/lib/grading/useGradeEstimateFromImages";
import { gradingCopy } from "@/copy/grading";
import { formatEbayTitle, calculateEbayParityPrice, EBAY_FEE_RATES } from "@/lib/ebay/parity-price";
import type { EbayFeeRateKey } from "@/lib/ebay/parity-price";
import EbayListingModal from "@/components/business/EbayListingModal";
import GetCompsButton from "@/components/ui/GetCompsButton";
import { compsParamsFromTitle } from "@/lib/ebay/comps-url";
import CMVDisplay from "@/components/comps/CMVDisplay";
import type { CardCmv } from "@/types/comps";

function fmtCents(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

interface Props {
  item: BusinessInventoryItem | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<BusinessInventoryItem>) => void;
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

function getDaysHeldColor(days: number | null): string {
  if (days === null) return "text-gray-500";
  if (days < 30) return "text-emerald-400";
  if (days <= 60) return "text-amber-400";
  return "text-red-400";
}

export default function ItemDetailDrawer({
  item,
  onClose,
  onSave,
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
  const [ebayOverrideImages, setEbayOverrideImages] = useState<string[] | null>(null);

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
        if (imageUrls.length === 0 && (card.image_url || card.user_image_url)) {
          if (card.image_url) imageUrls.push(card.image_url);
          if (card.user_image_url) imageUrls.push(card.user_image_url);
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
    if (
      !cardForGrade?.cardIdentity ||
      !gradeEstimate.estimate?.grade_probabilities
    ) {
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
          estimatorConfidence:
            gradeEstimate.estimate.grade_probabilities.confidence,
        }),
      });
      if (!response.ok) {
        throw new Error("POST_GRADING_VALUE_UNAVAILABLE");
      }
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
    if (
      !cardForGrade?.cardIdentity ||
      !gradeEstimate.estimate?.grade_probabilities
    ) {
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

  const daysHeld = getDaysHeld(form.acquisition_date || item.acquisition_date);
  const daysHeldColor = getDaysHeldColor(daysHeld);

  const handleSave = () => {
    // Validation
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
      current_market_value_cents: form.current_market_value
        ? toCents(form.current_market_value)
        : null,
      notes: form.notes || null,
    });
  };

  const handleFetchCmv = async () => {
    if (!item?.title?.trim()) return;
    setCmvLoading(true);
    try {
      const res = await fetch(
        `/api/business/inventory/fetch-cmv?item_id=${encodeURIComponent(item.id)}`
      );
      const data = await res.json().catch(() => null);
      const cmv = data?.cmv;
      if (typeof cmv === "number" && Number.isFinite(cmv) && cmv > 0) {
        const cents = Math.round(cmv * 100);
        setForm((prev) => ({
          ...prev,
          current_market_value: cmv.toFixed(2),
        }));
        onSave(item.id, {
          current_market_value_cents: cents,
        });
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
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-[#111827] border-l border-white/[0.08] z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h2 className="text-lg font-bold text-white">Edit Item</h2>
            <div className="flex items-center gap-2">
              {item.status !== "sold" && !((item as any).ebay_item_id) && (
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
                    : compsParamsFromTitle(item.title, form.grade || item.grade, form.grading_company || item.grading_company)
                }
              />
              {item.id && (
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
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {item.id && (
            <p className="text-xs text-gray-400 mb-4 -mt-2">
              Card profile has photos, full details, and grade probability.
            </p>
          )}

          {/* Copy eBay Title */}
          <button
            type="button"
            onClick={() => {
              const title = item.title || "";
              // Try to parse structured parts from the title for optimal eBay format
              const ebayTitle = formatEbayTitle({
                player: title, // Use full title as fallback
                grade: form.grade || item.grade,
                grading_company: form.grading_company || item.grading_company,
              });
              navigator.clipboard.writeText(ebayTitle || title).then(() => {
                setEbayTitleCopied(true);
                setTimeout(() => setEbayTitleCopied(false), 2000);
              });
            }}
            className="mb-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {ebayTitleCopied ? "Copied!" : "Copy eBay Title"}
          </button>

          {/* Days Held Badge */}
          <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-wider">Days Held</span>
              <span className={`text-lg font-bold tabular-nums ${daysHeldColor}`}>
                {daysHeld !== null ? `${daysHeld} days` : "—"}
              </span>
            </div>
            {daysHeld !== null && (
              <p className="text-[10px] text-gray-500 mt-1">
                {daysHeld < 30
                  ? "Recently acquired"
                  : daysHeld <= 60
                  ? "Consider listing or selling soon"
                  : "Held over 60 days — consider taking action"}
              </p>
            )}
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="mb-3 rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {validationError}
            </div>
          )}

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
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Est. Market Value ($)
                </label>
                {(() => {
                  const cmvCents = item.current_market_value_cents;
                  if (cmvCents && cmvCents > 0) {
                    const syntheticCmv: CardCmv = {
                      id: "",
                      card_id: item.id,
                      cmv_value: cmvCents / 100,
                      cmv_low: null,
                      cmv_high: null,
                      confidence: "low",
                      comps_count: 0,
                      excluded_count: 0,
                      last_updated: item.updated_at,
                    };
                    return (
                      <div className="mb-2">
                        <CMVDisplay cmv={syntheticCmv} compact />
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={form.current_market_value ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, current_market_value: e.target.value })
                    }
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                  {(!form.current_market_value || form.current_market_value === "0" || form.current_market_value === "0.00") && (
                    <button
                      type="button"
                      onClick={handleFetchCmv}
                      disabled={cmvLoading || !item.title?.trim()}
                      className="shrink-0 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
                    >
                      {cmvLoading ? "…" : "Get estimate"}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Override with your own value or open card profile to set comps.
                </p>
              </div>
            </div>
            {/* eBay Parity Price (read-only, auto-calculated) */}
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
                <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                        eBay Parity Price
                      </p>
                      <p className="text-lg font-semibold text-blue-400">
                        ${parityPrice.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                      {feeLabel} fee
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    List at this price on eBay to net the same as your ${listPriceDollars.toFixed(2)} shop price after fees.
                  </p>
                </div>
              );
            })()}

            {field("Notes", "notes", "textarea")}

            <button
              onClick={handleSave}
              className="w-full py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>

          {/* Grade probability */}
          <div className="mt-8 pt-6 border-t border-gray-800" id="grade-probability-block">
            <h3 className="text-md font-semibold text-white mb-3">{gradingCopy.page.title}</h3>
            {!item.card_id ? (
              <p className="text-xs text-gray-500">
                Grade probability is available for items linked to a card with photos. Add this item from a card in your collection to enable it.
              </p>
            ) : cardForGradeLoading ? (
              <p className="text-xs text-gray-500">Loading card photos...</p>
            ) : !cardForGrade || cardForGrade.imageUrls.length === 0 ? (
              <p className="text-xs text-gray-500">
                No photos on the linked card. Add photos in the{" "}
                <Link href={`/card/${item.id}?from=business`} className="text-blue-400 hover:underline">
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
                    className="px-3 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
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
                    className="mt-2 px-3 py-2.5 min-h-[44px] bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
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
                    <p className="text-xs text-amber-400">{gradeEstimate.error}</p>
                    <button
                      type="button"
                      onClick={() => { gradeEstimate.reset(); void gradeEstimate.run(); }}
                      className="text-xs text-blue-400 hover:underline"
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
                    {item.status !== "sold" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const urls = cardForGrade.imageUrls.filter(
                              (u) => typeof u === "string" && u.length > 0
                            );
                            if (urls.length === 0) return;
                            setEbayOverrideImages(urls);
                            setShowEbayListingModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-[#86b817] hover:bg-[#86b817]/90 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <span className="text-[11px] font-extrabold tracking-tight">
                            <span style={{ color: "#e43137" }}>e</span>
                            <span style={{ color: "#0064d3" }}>B</span>
                            <span style={{ color: "#f5af02" }}>a</span>
                            <span style={{ color: "#86b817" }}>y</span>
                          </span>
                          <span>List with these photos</span>
                        </button>
                        <p className="text-[10px] text-gray-500">
                          Uses the grade run images as your eBay photos.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {gradeEstimate.estimate && (valueLoading || valueResult || valueError) && (
                  <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">
                        Should you grade this?
                      </p>
                      {valueLoading && (
                        <span className="text-[10px] text-gray-400">
                          Analyzing pricing data…
                        </span>
                      )}
                    </div>
                    {valueError && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-amber-300">
                        <span>{valueError}</span>
                        <button
                          type="button"
                          onClick={() => void fetchWorthGrading()}
                          className="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 text-[10px] font-medium"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {valueResult && !valueError && (
                      <div className="mt-2 space-y-1 text-[11px] text-gray-300">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            {ratingLabel(valueResult.rating)}
                          </span>
                          {valueResult.bestOption !== "none" && (
                            <span className="text-[11px] text-gray-400">
                              Best: {valueResult.bestOption.toUpperCase()}
                            </span>
                          )}
                          <span className="ml-auto text-[11px] text-gray-400">
                            EV: $
                            {(valueResult.bestOption === "psa"
                              ? valueResult.psa.ev
                              : valueResult.bestOption === "bgs"
                              ? valueResult.bgs.ev
                              : 0
                            ).toFixed(0)}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {valueResult.explanation}
                        </p>
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-gray-500">
                      {gradingCopy.valuePanel.confidenceNote}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {showEbayListingModal && item && (
        <EbayListingModal
          item={item}
          overrideImageUrls={ebayOverrideImages ?? undefined}
          onClose={() => setShowEbayListingModal(false)}
          onSuccess={(listingId) => {
            onSave(item.id, {
              status: "listed",
              channel: "ebay",
              ...( { ebay_item_id: listingId } as any),
            });
            setEbayOverrideImages(null);
            setShowEbayListingModal(false);
          }}
        />
      )}
    </>
  );
}
