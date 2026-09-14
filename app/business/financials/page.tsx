"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtPct } from "./financialsFormat";
import { createClient } from "@/lib/supabase/client";
import type {
  DayBucket,
  MonthBucket,
  FinancialsSummary,
  PeriodTotals,
  Snapshot,
} from "@/lib/business/financials";

/* ── Time helpers ─────────────────────────────────────────────────────────── */

type Grain = "weekly" | "monthly";

type TimeRow = {
  key: string;
  label: string;
  revenue_cents: number;
  profit_cents: number;
  sales_count: number;
};

function isoKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtMonthYear(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function marginPct(revenue: number, profit: number): number | null {
  return revenue > 0 ? (profit / revenue) * 100 : null;
}

/** Roll the trailing daily buckets up into Monday-anchored weeks, newest first. */
function buildWeekly(daily: DayBucket[]): TimeRow[] {
  const map = new Map<string, TimeRow>();
  for (const d of daily) {
    const [y, m, day] = d.day.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, day));
    const dow = date.getUTCDay(); // 0 = Sun … 6 = Sat
    const shift = dow === 0 ? -6 : 1 - dow; // back to Monday
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() + shift);
    const key = isoKey(start);
    let row = map.get(key);
    if (!row) {
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      row = {
        key,
        label: `${fmtDayShort(key)} – ${fmtDayShort(isoKey(end))}`,
        revenue_cents: 0,
        profit_cents: 0,
        sales_count: 0,
      };
      map.set(key, row);
    }
    row.revenue_cents += d.revenue_cents;
    row.profit_cents += d.profit_cents;
    row.sales_count += d.sales_count;
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

function buildMonthly(monthly: MonthBucket[]): TimeRow[] {
  return [...monthly]
    .reverse()
    .map((m) => ({
      key: m.month,
      label: fmtMonthYear(m.month),
      revenue_cents: m.revenue_cents,
      profit_cents: m.profit_cents,
      sales_count: m.sales_count,
    }));
}

/* ── Small presentational pieces ──────────────────────────────────────────── */

function pnlColor(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

/** One of the three headline timeframes (this week / month / year). */
function Headline({
  label,
  totals,
}: {
  label: string;
  totals: { revenue_cents: number; profit_cents: number; sales_count: number };
}) {
  const margin = marginPct(totals.revenue_cents, totals.profit_cents);
  return (
    <div className="px-1 py-3 sm:px-6 sm:py-1">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#77808C]">
        {label}
      </div>
      <div className="mt-2 font-data text-[28px] font-semibold leading-none tabular-nums text-[#E6E8EB]">
        {fmtMoney(totals.revenue_cents)}
      </div>
      <div className="mt-1 text-[11px] text-[#5A626D]">
        revenue · {totals.sales_count}{" "}
        {totals.sales_count === 1 ? "sale" : "sales"}
      </div>
      <div
        className={`mt-3 font-data text-[16px] font-semibold tabular-nums ${pnlColor(
          totals.profit_cents
        )}`}
      >
        {fmtMoney(totals.profit_cents)}
      </div>
      <div className="mt-0.5 text-[11px] text-[#5A626D]">
        net profit{margin != null ? ` · ${fmtPct(margin, 1)} margin` : ""}
      </div>
    </div>
  );
}

/** A single figure in the Position footer strip. */
function PositionStat({
  label,
  value,
  note,
  tone = "neutral",
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "pos" | "neg";
  strong?: boolean;
}) {
  const valueCls =
    tone === "pos"
      ? "text-[#20B26B]"
      : tone === "neg"
        ? "text-[#E05C5C]"
        : strong
          ? "text-[#E6E8EB]"
          : "text-[#B8C0CC]";
  return (
    <div className="px-1 py-2 sm:px-5">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-1.5 font-data text-[17px] tabular-nums ${
          strong ? "font-semibold" : "font-medium"
        } ${valueCls}`}
      >
        {value}
      </div>
      {note ? (
        <div className="mt-0.5 text-[10px] text-[#5A626D]">{note}</div>
      ) : null}
    </div>
  );
}

/* ── Breakdown table ──────────────────────────────────────────────────────── */

function Breakdown({
  weekly,
  monthly,
  grain,
  setGrain,
}: {
  weekly: TimeRow[];
  monthly: TimeRow[];
  grain: Grain;
  setGrain: (g: Grain) => void;
}) {
  const rows = (grain === "weekly" ? weekly : monthly).filter(
    (r) => r.sales_count > 0
  );

  const total = rows.reduce(
    (acc, r) => ({
      revenue_cents: acc.revenue_cents + r.revenue_cents,
      profit_cents: acc.profit_cents + r.profit_cents,
      sales_count: acc.sales_count + r.sales_count,
    }),
    { revenue_cents: 0, profit_cents: 0, sales_count: 0 }
  );

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B8C0CC]">
          Revenue &amp; profit over time
        </h2>
        <div className="flex items-center gap-1">
          {(["weekly", "monthly"] as Grain[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrain(g)}
              className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] capitalize transition-colors ${
                grain === g
                  ? "bg-[#1B2A22] text-[#20B26B]"
                  : "text-[#77808C] hover:text-[#B8C0CC]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-[#1E2227] py-10 text-center text-[12px] text-[#5A626D]">
          No sales in this window yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#24282D] text-[9px] font-semibold uppercase tracking-[0.1em] text-[#5A626D]">
                <th className="py-2 pr-3 text-left font-semibold">
                  {grain === "weekly" ? "Week" : "Month"}
                </th>
                <th className="py-2 pr-3 text-right font-semibold">Sales</th>
                <th className="py-2 pr-3 text-right font-semibold">Revenue</th>
                <th className="py-2 pr-3 text-right font-semibold">Profit</th>
                <th className="py-2 text-right font-semibold">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = marginPct(r.revenue_cents, r.profit_cents);
                return (
                  <tr
                    key={r.key}
                    className="border-b border-[#16191D] transition-colors hover:bg-[#0E1114]"
                  >
                    <td className="py-2.5 pr-3 text-left text-[#E6E8EB]">
                      {r.label}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-data tabular-nums text-[#77808C]">
                      {r.sales_count}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-data tabular-nums text-[#E6E8EB]">
                      {fmtMoney(r.revenue_cents)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-data tabular-nums ${pnlColor(
                        r.profit_cents
                      )}`}
                    >
                      {fmtMoney(r.profit_cents)}
                    </td>
                    <td className="py-2.5 text-right font-data tabular-nums text-[#77808C]">
                      {fmtPct(m, 0)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[#343941] font-semibold">
                <td className="py-2.5 pr-3 text-left text-[#E6E8EB]">Total</td>
                <td className="py-2.5 pr-3 text-right font-data tabular-nums text-[#B8C0CC]">
                  {total.sales_count}
                </td>
                <td className="py-2.5 pr-3 text-right font-data tabular-nums text-[#E6E8EB]">
                  {fmtMoney(total.revenue_cents)}
                </td>
                <td
                  className={`py-2.5 pr-3 text-right font-data tabular-nums ${pnlColor(
                    total.profit_cents
                  )}`}
                >
                  {fmtMoney(total.profit_cents)}
                </td>
                <td className="py-2.5 text-right font-data tabular-nums text-[#77808C]">
                  {fmtPct(
                    marginPct(total.revenue_cents, total.profit_cents),
                    0
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Position footer ──────────────────────────────────────────────────────── */

function Position({ snapshot }: { snapshot: Snapshot }) {
  const unrealized = snapshot.unrealized_pnl_cents;
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B8C0CC]">
        Position
        <span className="ml-2 font-normal normal-case tracking-normal text-[#5A626D]">
          what you hold today
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-y-1 border-t border-[#24282D] pt-1 sm:flex sm:flex-wrap sm:items-start sm:gap-y-0 sm:divide-x sm:divide-[#1E2227]">
        <PositionStat
          label="Cash on hand"
          value={fmtMoney(snapshot.cash_on_hand_cents)}
          strong
        />
        <PositionStat
          label="Inventory at cost"
          value={fmtMoney(snapshot.cost_basis_cents)}
          note={`${snapshot.active_count} ${
            snapshot.active_count === 1 ? "card" : "cards"
          }`}
          strong
        />
        <PositionStat
          label="At market"
          value={fmtMoney(snapshot.inventory_value_cents)}
        />
        <PositionStat
          label="Unrealized gain"
          value={fmtMoney(unrealized)}
          note={
            snapshot.unrealized_pnl_pct != null
              ? `${snapshot.unrealized_pnl_pct >= 0 ? "+" : ""}${fmtPct(
                  snapshot.unrealized_pnl_pct,
                  1
                )}`
              : undefined
          }
          tone={unrealized >= 0 ? "pos" : "neg"}
        />
        {snapshot.unrealized_trade_gain_cents !== 0 ? (
          <PositionStat
            label="Trade gain"
            value={fmtMoney(snapshot.unrealized_trade_gain_cents)}
            note="books as cards sell"
          />
        ) : null}
        <PositionStat
          label="Total value"
          value={fmtMoney(snapshot.total_business_value_cents)}
          note="cash + inventory"
          strong
        />
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

function LoadingFinancials() {
  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <div className="animate-pulse space-y-6 p-6">
        <div className="h-7 w-40 bg-[#1E2227]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="h-28 bg-[#1E2227]" />
          <div className="h-28 bg-[#1E2227]" />
          <div className="h-28 bg-[#1E2227]" />
        </div>
        <div className="h-64 bg-[#1E2227]" />
      </div>
    </main>
  );
}

const ZERO: PeriodTotals = {
  revenue_cents: 0,
  cogs_cents: 0,
  fees_cents: 0,
  shipping_cost_cents: 0,
  profit_cents: 0,
  sales_count: 0,
  margin_pct: null,
  avg_order_value_cents: null,
};

export default function FinancialsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<FinancialsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grain, setGrain] = useState<Grain>("monthly");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirect=/business/financials");
        return;
      }
      try {
        const res = await fetch("/api/business/financials/summary", {
          cache: "no-store",
        });
        if (res.status === 403) {
          setHasAccess(false);
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load financials");
        }
        setHasAccess(true);
        setSummary(data as FinancialsSummary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  const weekly = useMemo(
    () => (summary ? buildWeekly(summary.daily) : []),
    [summary]
  );
  const monthly = useMemo(
    () => (summary ? buildMonthly(summary.monthly) : []),
    [summary]
  );

  if (loading) return <LoadingFinancials />;

  if (hasAccess === false) {
    return <main className="min-h-screen bg-[#090B0D] px-4 py-4" />;
  }

  // "This week" = the current Monday-anchored week (includes today).
  const thisWeek = weekly[0] ?? {
    revenue_cents: 0,
    profit_cents: 0,
    sales_count: 0,
  };
  const mtd = summary?.totals.mtd ?? ZERO;
  const ytd = summary?.totals.ytd ?? ZERO;

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <header className="flex items-baseline gap-3 border-b border-[#24282D] px-6 py-3">
        <h1 className="text-[15px] font-semibold tracking-normal text-[#E6E8EB]">
          Financials
        </h1>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#77808C]">
          Synced with ledger
        </span>
      </header>

      {error ? (
        <div className="m-6 border border-[#723030] bg-[#2A1111] p-2 text-[12px] text-[#E05C5C]">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
          {/* Headline: revenue + profit across the three timeframes */}
          <section className="grid grid-cols-1 divide-y divide-[#1E2227] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Headline label="This week" totals={thisWeek} />
            <Headline label="This month" totals={mtd} />
            <Headline label="This year" totals={ytd} />
          </section>

          <Breakdown
            weekly={weekly}
            monthly={monthly}
            grain={grain}
            setGrain={setGrain}
          />

          <Position snapshot={summary.snapshot} />
        </div>
      ) : null}
    </main>
  );
}
