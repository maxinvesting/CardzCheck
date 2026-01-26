"use client";

import type { GradeEstimate } from "@/types";

interface GradeEstimateDisplayProps {
  estimate: GradeEstimate;
  compact?: boolean;
}

function getGradeColor(low: number, high: number): string {
  const avg = (low + high) / 2;
  if (avg >= 9) return "text-green-400 bg-green-500/10 border-green-500/30";
  if (avg >= 7) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

function getGradeBadgeColor(low: number, high: number): string {
  const avg = (low + high) / 2;
  if (avg >= 9) return "bg-green-600";
  if (avg >= 7) return "bg-amber-600";
  return "bg-red-600";
}

export default function GradeEstimateDisplay({
  estimate,
  compact = false,
}: GradeEstimateDisplayProps) {
  const colorClasses = getGradeColor(
    estimate.estimated_grade_low,
    estimate.estimated_grade_high
  );
  const badgeColor = getGradeBadgeColor(
    estimate.estimated_grade_low,
    estimate.estimated_grade_high
  );

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colorClasses}`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="font-semibold">
          Est. PSA {estimate.estimated_grade_low}-{estimate.estimated_grade_high}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
      {/* Header with Grade Badge */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          AI Grade Estimate
        </h3>
        <div
          className={`px-4 py-2 rounded-lg font-bold text-lg text-white ${badgeColor}`}
        >
          PSA {estimate.estimated_grade_low}-{estimate.estimated_grade_high}
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
            <span className="text-gray-500 font-medium">Centering</span>
          </div>
          <p className="text-gray-300">{estimate.centering}</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            <span className="text-gray-500 font-medium">Corners</span>
          </div>
          <p className="text-gray-300">{estimate.corners}</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            <span className="text-gray-500 font-medium">Surface</span>
          </div>
          <p className="text-gray-300">{estimate.surface}</p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
              />
            </svg>
            <span className="text-gray-500 font-medium">Edges</span>
          </div>
          <p className="text-gray-300">{estimate.edges}</p>
        </div>
      </div>

      {/* Notes */}
      {estimate.grade_notes && (
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
          <p className="text-sm text-blue-300">
            <span className="font-medium">Notes:</span> {estimate.grade_notes}
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-4 text-xs text-gray-500 border-t border-gray-700 pt-3">
        Estimate based on photo quality. Actual grades may vary based on factors
        not visible in images. For accurate grading, submit to PSA, BGS, SGC, or
        CGC.
      </p>
    </div>
  );
}
