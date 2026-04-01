"use client";

import { buildEbaySoldUrl, type CompsParams } from "@/lib/ebay/comps-url";

interface GetCompsButtonProps {
  params: CompsParams;
  /** Visual size variant */
  size?: "sm" | "default";
  /** Optional className override — replaces the default style entirely */
  className?: string;
}

/**
 * "Get Comps" button — opens eBay sold listings in a new tab.
 * Uses the card's existing grade if present; shows all sold cards when ungraded.
 * Renders as an <a> tag so middle-click / cmd+click open in new tab.
 */
export default function GetCompsButton({
  params,
  size = "default",
  className,
}: GetCompsButtonProps) {
  const url = buildEbaySoldUrl(params);

  const defaultClass =
    size === "sm"
      ? "inline-flex items-center gap-1 rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
      : "inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-[#1a2f4e] hover:bg-[#1e3a5f] border border-blue-900/40 text-blue-200 text-sm font-medium rounded-lg transition-colors";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className ?? defaultClass}
    >
      <svg
        className={size === "sm" ? "w-2.5 h-2.5 shrink-0" : "w-4 h-4 shrink-0"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      Get Comps
    </a>
  );
}
