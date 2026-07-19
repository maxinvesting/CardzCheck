/**
 * Pure formatting + color helpers for the financials page. No React, no
 * charting deps — safe to import from anywhere.
 */
import type { AgingBucket } from "@/lib/business/financials";

export type PeriodKey = "last_30d" | "mtd" | "ytd";
export type SeriesKey = "revenue" | "profit" | "margin" | "sales";
export type RangeKey = "6m" | "12m";

export type TrendDatum = {
  month: string;
  revenue: number;
  profit: number;
  margin: number;
  sales: number;
};

export const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const MONEY_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const AGING_COLORS: Record<AgingBucket["label"], string> = {
  "0-30": "#20B26B",
  "31-60": "#86B817",
  "61-90": "#F0B429",
  "90+": "#E05C5C",
};

export const SERIES_COLORS: Record<SeriesKey, string> = {
  revenue: "#3B82F6",
  profit: "#20B26B",
  margin: "#F0B429",
  sales: "#A855F7",
};

export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

export function fmtMoneyCompact(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function fmtSigned(value: number, suffix = "%"): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

export function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function pnlClass(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short" });
}

export function formatDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
