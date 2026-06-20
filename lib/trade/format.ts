/** Shared money formatting for Trade Center (client-safe). */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const MONEY_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

export function formatCentsPrecise(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY_PRECISE.format(cents / 100);
}

import type { TradeStatus } from "./types";

/** Human label + a tone keyword (drives a badge color) for a trade status. */
export function statusMeta(status: TradeStatus): { label: string; tone: "neutral" | "info" | "warn" | "good" | "bad" } {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "proposed":
      return { label: "Proposed", tone: "info" };
    case "countered":
      return { label: "Countered", tone: "info" };
    case "accepted":
      return { label: "Awaiting cash", tone: "warn" };
    case "cash_pending":
      return { label: "Cash pending", tone: "warn" };
    case "confirmed":
      return { label: "Confirmed — ship now", tone: "good" };
    case "shipped":
      return { label: "Shipping", tone: "good" };
    case "completed":
      return { label: "Completed", tone: "good" };
    case "declined":
      return { label: "Declined", tone: "bad" };
    case "canceled":
      return { label: "Canceled", tone: "bad" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export const TONE_CLASS: Record<
  "neutral" | "info" | "warn" | "good" | "bad",
  string
> = {
  neutral:
    "border-[color:var(--biz-border)] text-[color:var(--biz-muted-strong)] bg-[color:var(--biz-surface-soft)]",
  info: "border-[color:var(--biz-info-border)] text-[color:var(--biz-info)] bg-[color:var(--biz-info-soft)]",
  warn: "border-[color:var(--biz-automation-border,#caa24a)] text-[color:var(--biz-accent-amber,#d8a657)] bg-[color:var(--biz-automation-soft,rgba(216,166,87,0.12))]",
  good: "border-[color:var(--biz-primary-border)] text-[color:var(--biz-profit)] bg-[color:var(--biz-profit-soft)]",
  bad: "border-[color:var(--biz-danger-border)] text-[color:var(--biz-danger)] bg-[color:var(--biz-danger-soft)]",
};
