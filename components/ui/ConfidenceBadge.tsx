"use client";

import type { FieldConfidence } from "@/types";

interface ConfidenceBadgeProps {
  confidence: FieldConfidence;
  /** Optional per-field confidence (e.g. for tooltip or secondary display). */
  fieldConfidence?: Record<string, FieldConfidence>;
  /** If true, use softer styling (e.g. optional context). */
  optional?: boolean;
  /** Override label; defaults to High/Medium/Low confidence. */
  label?: string;
  className?: string;
}

const CONFIDENCE_STYLES: Record<
  FieldConfidence,
  string
> = {
  high: "bg-green-900/30 text-green-400 dark:bg-green-900/30 dark:text-green-400",
  medium: "bg-yellow-900/30 text-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-red-900/30 text-red-400 dark:bg-red-900/30 dark:text-red-400",
};

const DEFAULT_LABELS: Record<FieldConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/**
 * Badge showing overall identification confidence. Matches existing app styling.
 */
export default function ConfidenceBadge({
  confidence,
  fieldConfidence: _fieldConfidence,
  optional,
  label,
  className = "",
}: ConfidenceBadgeProps) {
  const displayLabel = label ?? DEFAULT_LABELS[confidence];
  const style = CONFIDENCE_STYLES[confidence];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style} ${
        optional ? "opacity-80" : ""
      } ${className}`.trim()}
    >
      {displayLabel}
    </span>
  );
}
