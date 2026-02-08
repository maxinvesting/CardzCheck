"use client";

interface NeedsConfirmationPillProps {
  label: string;
  className?: string;
}

/**
 * Small, subtle pill for "needs confirmation" state (e.g. Year, Set).
 */
export default function NeedsConfirmationPill({ label, className = "" }: NeedsConfirmationPillProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 ${className}`.trim()}
    >
      {label}: Needs confirmation
    </span>
  );
}
