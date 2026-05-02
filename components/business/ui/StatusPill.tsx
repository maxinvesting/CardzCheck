"use client";

import type { ReactNode } from "react";

export type StatusTone =
  | "neutral"
  | "primary"
  | "profit"
  | "warning"
  | "danger"
  | "automation"
  | "info"
  | "muted";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral:
    "border-[var(--biz-border)] bg-[var(--biz-surface)] text-[var(--biz-muted-strong)]",
  primary:
    "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] text-[var(--biz-primary)]",
  profit:
    "border-[rgba(32,178,107,0.32)] bg-[var(--biz-profit-soft)] text-[var(--biz-profit)]",
  warning:
    "border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] text-[var(--biz-warning)]",
  danger:
    "border-[var(--biz-danger-border)] bg-[var(--biz-danger-soft)] text-[var(--biz-danger)]",
  automation:
    "border-[var(--biz-automation-border)] bg-[var(--biz-automation-soft)] text-[var(--biz-automation)]",
  info:
    "border-[var(--biz-info-border)] bg-[var(--biz-info-soft)] text-[var(--biz-info)]",
  muted:
    "border-[var(--biz-border-subtle)] bg-transparent text-[var(--biz-faint)]",
};

interface Props {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  uppercase?: boolean;
  dot?: boolean;
}

export default function StatusPill({
  tone = "neutral",
  children,
  className = "",
  uppercase = true,
  dot = false,
}: Props) {
  const toneClass = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${
        uppercase ? "uppercase tracking-[0.10em]" : ""
      } ${toneClass} ${className}`}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}
