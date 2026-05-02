"use client";

import type { ReactNode } from "react";
import type { StatusTone } from "./StatusPill";

const TONE_VALUE: Record<StatusTone, string> = {
  neutral: "text-[var(--biz-text-strong)]",
  primary: "text-[var(--biz-primary)]",
  profit: "text-[var(--biz-profit)]",
  warning: "text-[var(--biz-warning)]",
  danger: "text-[var(--biz-danger)]",
  automation: "text-[var(--biz-automation)]",
  info: "text-[var(--biz-info)]",
  muted: "text-[var(--biz-muted-strong)]",
};

interface Props {
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
  trailing?: ReactNode;
  emphasizeValue?: boolean;
  className?: string;
}

export default function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  trailing,
  emphasizeValue = true,
  className = "",
}: Props) {
  const valueColor = TONE_VALUE[tone];
  return (
    <div
      className={`rounded-md border border-[var(--biz-border)] bg-[var(--biz-surface)] px-3 py-2.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)]">
          {label}
        </p>
        {trailing}
      </div>
      <p
        className={`mt-1.5 ${
          emphasizeValue ? "text-[20px]" : "text-[16px]"
        } font-semibold leading-none biz-mono ${valueColor}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--biz-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
