"use client";

import type { ReactNode, HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  trailing?: ReactNode;
  /** Optional small descriptor under the label */
  sub?: string;
  /** When true, removes inner padding so callers can manage layout */
  flush?: boolean;
  /** Force a different elevation tone */
  tone?: "default" | "soft";
  bodyClassName?: string;
  children: ReactNode;
}

export default function TerminalPanel({
  label,
  trailing,
  sub,
  flush = false,
  tone = "default",
  className = "",
  bodyClassName = "",
  children,
  ...rest
}: Props) {
  const surface =
    tone === "soft"
      ? "bg-[var(--biz-surface-soft)]"
      : "bg-[var(--biz-surface)]";
  return (
    <section
      {...rest}
      className={`flex flex-col rounded-md border border-[var(--biz-border)] ${surface} ${className}`}
    >
      {label ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--biz-border)] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
              {label}
            </p>
            {sub ? (
              <p className="mt-0.5 text-[11px] text-[var(--biz-muted)]">{sub}</p>
            ) : null}
          </div>
          {trailing ? (
            <div className="flex shrink-0 items-center gap-2">{trailing}</div>
          ) : null}
        </header>
      ) : null}
      <div
        className={`min-h-0 flex-1 ${flush ? "" : "px-3 py-3"} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
