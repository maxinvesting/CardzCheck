"use client";

import type { CardComp } from "@/types/comps";

interface CompItemProps {
  comp: CardComp;
  onToggle: (id: string, selected: boolean) => void;
  onDelete: (id: string) => void;
}

const QUALITY_STYLES: Record<CardComp["match_quality"], string> = {
  exact: "bg-green-900/30 text-green-400",
  near: "bg-yellow-900/30 text-yellow-400",
  weak: "bg-gray-800 text-gray-400",
};

const QUALITY_LABELS: Record<CardComp["match_quality"], string> = {
  exact: "Exact",
  near: "Near",
  weak: "Weak",
};

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDollar(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function CompItem({ comp, onToggle, onDelete }: CompItemProps) {
  return (
    <div className={`flex items-start gap-3 py-3 ${!comp.is_selected ? "opacity-50" : ""}`}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={comp.is_selected}
        onChange={(e) => onToggle(comp.id, e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 cursor-pointer shrink-0"
      />

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${QUALITY_STYLES[comp.match_quality]}`}
          >
            {QUALITY_LABELS[comp.match_quality]}
          </span>
          {comp.grade && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{comp.grade}</span>
          )}
          {comp.date_sold && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatRelativeDate(comp.date_sold)}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 truncate">{comp.title}</p>
      </div>

      {/* Price + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {formatDollar(comp.price)}
        </span>
        {comp.ebay_url && (
          <a
            href={comp.ebay_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-500 transition-colors"
            title="View on eBay"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
        <button
          onClick={() => onDelete(comp.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Remove comp"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
