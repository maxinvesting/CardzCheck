"use client";

import type { CardCmv } from "@/types/comps";
import ConfidenceBadge from "@/components/ui/ConfidenceBadge";

interface CMVDisplayProps {
  cmv: CardCmv | null;
  /** Render as a single inline line for dense list views. */
  compact?: boolean;
  className?: string;
}

function formatDollar(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function CMVDisplay({ cmv, compact = false, className = "" }: CMVDisplayProps) {
  if (!cmv || cmv.cmv_value === null) {
    if (compact) {
      return (
        <span className={`text-gray-400 dark:text-gray-500 ${className}`}>
          No CMV yet
        </span>
      );
    }
    return (
      <div className={className}>
        <p className="text-sm text-gray-400 dark:text-gray-500">No CMV yet</p>
        {cmv && cmv.comps_count === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Add comps below to calculate market value.
          </p>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <span className={`font-medium text-gray-900 dark:text-white ${className}`}>
        {formatDollar(cmv.cmv_value)}
        <span className="ml-1.5">
          <ConfidenceBadge confidence={cmv.confidence} className="text-[10px]" />
        </span>
      </span>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatDollar(cmv.cmv_value)}
        </span>
        <ConfidenceBadge confidence={cmv.confidence} />
      </div>

      {cmv.cmv_low !== null && cmv.cmv_high !== null && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Range: {formatDollar(cmv.cmv_low)} – {formatDollar(cmv.cmv_high)}
        </p>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Based on {cmv.comps_count} selected comp{cmv.comps_count !== 1 ? "s" : ""}
        {cmv.excluded_count > 0 && ` · ${cmv.excluded_count} excluded`}
        {" · "}Updated{" "}
        {new Date(cmv.last_updated).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
