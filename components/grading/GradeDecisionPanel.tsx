"use client";

import { useState } from "react";
import type {
  GradeEstimate,
  WorthGradingResult,
  CardIdentificationResult,
} from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────
type Decision = "grade_it" | "sell_raw" | "hold" | "add_inventory";

interface DecisionOption {
  key: Decision;
  label: string;
  description: string;
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
}

interface GradeDecisionPanelProps {
  estimate: GradeEstimate;
  valueResult: WorthGradingResult | null;
  identifiedCard: CardIdentificationResult;
  onAddToCollection?: () => void;
  onAddToInventory?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getGradeVerdict(estimate: GradeEstimate): {
  label: string;
  color: string;
  summary: string;
} {
  const probs = estimate.grade_probabilities;
  if (!probs) {
    return {
      label: "Inconclusive",
      color: "text-[#7a91a8]",
      summary: "Not enough data to make a recommendation.",
    };
  }

  const psa10 = probs.psa["10"] ?? 0;
  const psa9 = probs.psa["9"] ?? 0;
  const highGradeChance = psa10 + psa9;

  if (psa10 >= 0.4) {
    return {
      label: "Strong Grade Candidate",
      color: "text-emerald-400",
      summary: `${Math.round(psa10 * 100)}% chance of PSA 10. This card is a strong candidate for grading.`,
    };
  }
  if (highGradeChance >= 0.6) {
    return {
      label: "Worth Grading",
      color: "text-blue-400",
      summary: `${Math.round(highGradeChance * 100)}% chance of PSA 9+. Grading could add significant value.`,
    };
  }
  if (highGradeChance >= 0.35) {
    return {
      label: "Borderline",
      color: "text-amber-400",
      summary: `${Math.round(highGradeChance * 100)}% chance of PSA 9+. Consider the card's raw value before deciding.`,
    };
  }
  return {
    label: "Sell Raw",
    color: "text-rose-400",
    summary: `Low probability of high grade. Better to sell raw or hold for the right moment.`,
  };
}

function getROISummary(valueResult: WorthGradingResult | null): string | null {
  if (!valueResult) return null;

  const { rating, bestOption } = valueResult;
  if (rating === "strong_yes") {
    return `High ROI potential${bestOption !== "none" ? ` via ${bestOption.toUpperCase()}` : ""}. Grading is strongly recommended.`;
  }
  if (rating === "yes") {
    return `Moderate ROI potential. Grading could be profitable depending on turnaround cost.`;
  }
  if (rating === "maybe") {
    return "Marginal ROI. Consider bulk grading or waiting for market movement.";
  }
  return "Low ROI. Selling raw is likely the better option.";
}

// ── Icons (inline SVGs) ────────────────────────────────────────────────────

const GradeIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const SellRawIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const HoldIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const InventoryIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
    />
  </svg>
);

// ── Decision options ───────────────────────────────────────────────────────

const DECISION_OPTIONS: DecisionOption[] = [
  {
    key: "grade_it",
    label: "Grade It",
    description: "Submit to PSA or BGS for professional grading",
    icon: GradeIcon,
    bgColor: "bg-emerald-500/5",
    borderColor: "border-emerald-500/20 hover:border-emerald-500/40",
    textColor: "text-emerald-300",
    accentColor: "text-emerald-400",
  },
  {
    key: "sell_raw",
    label: "Sell Raw",
    description: "List for sale without grading",
    icon: SellRawIcon,
    bgColor: "bg-blue-500/5",
    borderColor: "border-blue-500/20 hover:border-blue-500/40",
    textColor: "text-blue-300",
    accentColor: "text-blue-400",
  },
  {
    key: "hold",
    label: "Hold",
    description: "Keep in collection and monitor market",
    icon: HoldIcon,
    bgColor: "bg-amber-500/5",
    borderColor: "border-amber-500/20 hover:border-amber-500/40",
    textColor: "text-amber-300",
    accentColor: "text-amber-400",
  },
  {
    key: "add_inventory",
    label: "Add to Inventory",
    description: "Add to business inventory for listing",
    icon: InventoryIcon,
    bgColor: "bg-violet-500/5",
    borderColor: "border-violet-500/20 hover:border-violet-500/40",
    textColor: "text-violet-300",
    accentColor: "text-violet-400",
  },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function GradeDecisionPanel({
  estimate,
  valueResult,
  identifiedCard,
  onAddToCollection,
  onAddToInventory,
}: GradeDecisionPanelProps) {
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);

  const verdict = getGradeVerdict(estimate);
  const roiSummary = getROISummary(valueResult);

  const probs = estimate.grade_probabilities;
  const psa10Pct = probs ? Math.round((probs.psa["10"] ?? 0) * 100) : null;
  const psa9Pct = probs ? Math.round((probs.psa["9"] ?? 0) * 100) : null;

  const handleDecisionClick = (decision: Decision) => {
    setSelectedDecision(decision);
    if (decision === "add_inventory" && onAddToInventory) {
      onAddToInventory();
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0c1a2e] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#e2eaf3]">
              What should I do with this card?
            </h3>
            <p className="text-xs text-[#3a5068] mt-0.5">
              AI recommendation based on grade analysis &amp; market data
            </p>
          </div>
        </div>

        {/* AI Verdict */}
        <div className="rounded-lg bg-[#07111d] border border-white/[0.06] p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${verdict.color}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-semibold ${verdict.color}`}>
                  {verdict.label}
                </span>
                {psa10Pct !== null && (
                  <span className="text-[10px] font-mono text-[#3a5068] bg-[#0f1f35] px-1.5 py-0.5 rounded">
                    PSA 10: {psa10Pct}%
                    {psa9Pct !== null && ` · PSA 9: ${psa9Pct}%`}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7a91a8] leading-relaxed">
                {verdict.summary}
              </p>
              {roiSummary && (
                <p className="text-xs text-[#3a5068] mt-1.5 leading-relaxed">
                  {roiSummary}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        {probs && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { label: "PSA 10", value: psa10Pct ?? 0, color: "text-emerald-400" },
              { label: "PSA 9", value: psa9Pct ?? 0, color: "text-blue-400" },
              {
                label: "PSA 8",
                value: Math.round((probs.psa["8"] ?? 0) * 100),
                color: "text-amber-400",
              },
              {
                label: "≤ PSA 7",
                value: Math.round((probs.psa["7_or_lower"] ?? 0) * 100),
                color: "text-rose-400",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center py-2 rounded-lg bg-[#07111d] border border-white/[0.04]"
              >
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}%</p>
                <p className="text-[9px] text-[#3a5068] uppercase tracking-wider font-medium mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Cards */}
      <div className="px-6 pb-6">
        <p className="text-[10px] uppercase tracking-widest font-medium text-[#3a5068] mb-3">
          Choose your action
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DECISION_OPTIONS.map((option) => {
            const isSelected = selectedDecision === option.key;
            return (
              <button
                key={option.key}
                onClick={() => handleDecisionClick(option.key)}
                className={`
                  relative flex flex-col items-center gap-2 p-4 min-h-[44px] rounded-xl border transition-all duration-200
                  ${isSelected
                    ? `${option.bgColor} ${option.borderColor} ring-1 ring-current`
                    : `bg-[#07111d] border-white/[0.06] hover:${option.bgColor} ${option.borderColor}`
                  }
                `}
              >
                <div className={isSelected ? option.accentColor : "text-[#3a5068]"}>
                  {option.icon}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isSelected ? option.textColor : "text-[#e2eaf3]"
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-[9px] text-[#3a5068] text-center leading-tight">
                  {option.description}
                </span>
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <svg
                      className={`w-3.5 h-3.5 ${option.accentColor}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected decision expanded content */}
        {selectedDecision && (
          <div className="mt-4 rounded-lg bg-[#07111d] border border-white/[0.06] p-4 animate-in fade-in slide-in-from-top-1 duration-200">
            {selectedDecision === "grade_it" && (
              <div className="space-y-3">
                <p className="text-xs text-[#7a91a8] leading-relaxed">
                  Based on the analysis, submitting to a professional grading service could increase this card&apos;s value.
                  {psa10Pct !== null && psa10Pct >= 30 && (
                    <span className="text-emerald-400 font-medium">
                      {" "}With a {psa10Pct}% chance of PSA 10, this is a strong submission candidate.
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onAddToCollection}
                    className="px-3 py-2.5 min-h-[44px] text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                  >
                    Add to Collection
                  </button>
                </div>
              </div>
            )}

            {selectedDecision === "sell_raw" && (
              <div className="space-y-3">
                <p className="text-xs text-[#7a91a8] leading-relaxed">
                  Selling raw avoids grading costs and turnaround time. Consider listing on eBay or your shop.
                  {valueResult?.raw?.price && (
                    <span className="text-blue-400 font-medium">
                      {" "}Estimated raw value: ${valueResult.raw.price.toFixed(0)}.
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {onAddToInventory && (
                    <button
                      onClick={onAddToInventory}
                      className="px-3 py-2.5 min-h-[44px] text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      Add to Inventory
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedDecision === "hold" && (
              <div className="space-y-3">
                <p className="text-xs text-[#7a91a8] leading-relaxed">
                  Hold this card in your collection and monitor the market. Set a price alert or revisit when market conditions change.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onAddToCollection}
                    className="px-3 py-2.5 min-h-[44px] text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
                  >
                    Add to Collection
                  </button>
                </div>
              </div>
            )}

            {selectedDecision === "add_inventory" && (
              <div className="space-y-3">
                <p className="text-xs text-[#7a91a8] leading-relaxed">
                  Add this card to your business inventory for listing in your shop or on eBay.
                </p>
                <div className="flex flex-wrap gap-2">
                  {onAddToInventory && (
                    <button
                      onClick={onAddToInventory}
                      className="px-3 py-2.5 min-h-[44px] text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                    >
                      Add to Inventory
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Back analysis note */}
      {identifiedCard.imageUrls && identifiedCard.imageUrls.length > 1 && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-[10px] text-emerald-400/80">
              Front &amp; back photos analyzed — includes back centering, print quality, and wax stains.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
