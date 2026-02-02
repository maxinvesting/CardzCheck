"use client";

import type { GradeCmv, WorthGradingResult } from "@/types";

interface GradeEstimatorValuePanelProps {
  result: WorthGradingResult;
  loading?: boolean;
}

function formatPrice(cmv: GradeCmv): string {
  if (cmv.price === null) return "Insufficient comps";
  return `$${cmv.price.toFixed(0)}`;
}

function ratingBadge(rating: WorthGradingResult["rating"]): string {
  switch (rating) {
    case "strong_yes":
      return "bg-green-600/20 text-green-300 border-green-500/40";
    case "yes":
      return "bg-emerald-600/20 text-emerald-300 border-emerald-500/40";
    case "maybe":
      return "bg-amber-600/20 text-amber-300 border-amber-500/40";
    default:
      return "bg-red-600/20 text-red-300 border-red-500/40";
  }
}

function formatRatingLabel(rating: WorthGradingResult["rating"]): string {
  switch (rating) {
    case "strong_yes":
      return "Strong Yes";
    case "yes":
      return "Yes";
    case "maybe":
      return "Maybe";
    default:
      return "No";
  }
}

function formatRoi(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export default function GradeEstimatorValuePanel({
  result,
  loading,
}: GradeEstimatorValuePanelProps) {
  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-gray-700 rounded mb-3" />
        <div className="h-6 w-48 bg-gray-700 rounded mb-2" />
        <div className="h-24 w-full bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Post-Grading Value
        </h3>
        <div className="flex items-center gap-2">
          {result.bestOption !== "none" && (
            <span className="text-xs text-gray-400">
              Best: {result.bestOption.toUpperCase()}
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${ratingBadge(
              result.rating
            )}`}
          >
            Worth grading? {formatRatingLabel(result.rating)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-gray-400 font-medium mb-2">Raw CMV</p>
          <p className="text-lg text-white font-semibold">{formatPrice(result.raw)}</p>
          <p className="text-xs text-gray-500 mt-1">{result.raw.n} comps</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-gray-400 font-medium mb-2">PSA CMV</p>
          <ul className="space-y-1 text-gray-300">
            <li>PSA 10: {formatPrice(result.psa["10"])}</li>
            <li>PSA 9: {formatPrice(result.psa["9"])}</li>
            <li>PSA 8: {formatPrice(result.psa["8"])}</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            EV ${result.psa.ev.toFixed(0)} · Net ${result.psa.netGain.toFixed(0)} · ROI{" "}
            {formatRoi(result.psa.roi)}
          </p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-gray-400 font-medium mb-2">BGS CMV</p>
          <ul className="space-y-1 text-gray-300">
            <li>BGS 9.5: {formatPrice(result.bgs["9.5"])}</li>
            <li>BGS 9: {formatPrice(result.bgs["9"])}</li>
            <li>BGS 8.5: {formatPrice(result.bgs["8.5"])}</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            EV ${result.bgs.ev.toFixed(0)} · Net ${result.bgs.netGain.toFixed(0)} · ROI{" "}
            {formatRoi(result.bgs.roi)}
          </p>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
        <p className="text-sm text-blue-200">{result.explanation}</p>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Based on recent sold comps; low comp volume reduces confidence.
      </p>
    </div>
  );
}
