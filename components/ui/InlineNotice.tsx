"use client";

interface InlineNoticeProps {
  type: "info" | "warning";
  children: React.ReactNode;
  className?: string;
}

const STYLES = {
  info: "border-blue-800/40 bg-blue-900/20 text-blue-200 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-200",
  warning:
    "border-amber-800/40 bg-amber-900/20 text-amber-200 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200",
};

/**
 * Inline, non-blocking notice for info or warning messages.
 * Use instead of red toast/error banners for non-critical sections.
 * Reserve toasts for blocking actions (auth, payment, destructive).
 */
export default function InlineNotice({ type, children, className = "" }: InlineNoticeProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${STYLES[type]} ${className}`.trim()}
      role="status"
    >
      {children}
    </div>
  );
}
