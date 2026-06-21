"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AGING_COLORS,
  SERIES_COLORS,
  fmtMoney,
  fmtMoneyCompact,
  fmtPct,
  fmtSigned,
  pctDelta,
  pnlClass,
  formatMonth,
  formatDay,
  type PeriodKey,
  type SeriesKey,
  type RangeKey,
  type TrendDatum,
} from "./financialsFormat";
// recharts is heavy — load the chart module's chunk only when these render.
const TrendChart = dynamic(
  () => import("./FinancialsCharts").then((m) => m.TrendChart),
  { ssr: false }
);
const AgingPieChart = dynamic(
  () => import("./FinancialsCharts").then((m) => m.AgingPieChart),
  { ssr: false }
);
import BusinessPaywall from "@/components/business/BusinessPaywall";
import { createClient } from "@/lib/supabase/client";
import type {
  CardPerformance,
  CashFlow,
  ChannelBreakdown,
  DayBucket,
  FinancialsSummary,
  MonthBucket,
  PeriodTotals,
  Snapshot,
  StaleAlert,
  Velocity,
} from "@/lib/business/financials";

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  right,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-[13px] font-semibold tracking-tight text-[#E6E8EB]">
          {title}
        </h2>
        {subtitle && !compact ? (
          <p className="text-[10px] text-[#77808C]">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function MetricCell({
  label,
  value,
  sub,
  valueClass,
  align = "left",
}: {
  label: string;
  value: string;
  sub?: { text: string; tone?: "neutral" | "up" | "down" | null };
  valueClass?: string;
  align?: "left" | "right";
}) {
  const subTone =
    !sub || sub.tone == null
      ? "text-[#77808C]"
      : sub.tone === "up"
        ? "text-[#20B26B]"
        : sub.tone === "down"
          ? "text-[#E05C5C]"
          : "text-[#77808C]";
  return (
    <div className={`px-3 py-1.5 ${align === "right" ? "text-right" : ""}`}>
      <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-0.5 font-data text-[15px] font-semibold tabular-nums leading-tight ${valueClass ?? "text-[#E6E8EB]"}`}
      >
        {value}
      </div>
      {sub ? (
        <div className={`mt-0.5 text-[10px] tabular-nums ${subTone}`}>
          {sub.text}
        </div>
      ) : null}
    </div>
  );
}

function SnapshotAndVelocity({
  snapshot,
  velocity,
  cashflow,
}: {
  snapshot: Snapshot;
  velocity: Velocity;
  cashflow: CashFlow;
}) {
  const cashDelta =
    cashflow.current_month_net_cents - cashflow.prev_month_net_cents;
  const cashSub =
    cashflow.prev_month_net_cents === 0 && cashDelta === 0
      ? { text: "no prior month", tone: null }
      : {
          text: `${cashDelta >= 0 ? "+" : "-"}${fmtMoneyCompact(Math.abs(cashDelta))} vs last mo`,
          tone:
            cashDelta > 0
              ? ("up" as const)
              : cashDelta < 0
                ? ("down" as const)
                : null,
        };
  const pnlSub =
    snapshot.unrealized_pnl_pct == null
      ? undefined
      : {
          text: `${fmtSigned(snapshot.unrealized_pnl_pct)} vs cost`,
          tone:
            snapshot.unrealized_pnl_cents > 0
              ? ("up" as const)
              : snapshot.unrealized_pnl_cents < 0
                ? ("down" as const)
                : null,
        };
  const turnText =
    velocity.turn_rate_annualized == null
      ? "—"
      : `${velocity.turn_rate_annualized.toFixed(1)}×`;

  return (
    <section>
      <div className="grid grid-cols-2 divide-x divide-y divide-[#24282D] border border-[#24282D] bg-[#0B0D0F] sm:grid-cols-3 sm:divide-y-0 xl:grid-cols-11">
        <MetricCell
          label="Cash on hand"
          value={fmtMoney(snapshot.cash_on_hand_cents)}
          valueClass="text-[#20B26B]"
          sub={{ text: "manage in ledger", tone: null }}
        />
        <MetricCell
          label="Total value"
          value={fmtMoney(snapshot.total_business_value_cents)}
          sub={{ text: "inventory + cash", tone: null }}
        />
        <MetricCell
          label="Inventory value"
          value={fmtMoney(snapshot.inventory_value_cents)}
        />
        <MetricCell
          label="Cost basis"
          value={fmtMoney(snapshot.cost_basis_cents)}
        />
        <MetricCell
          label="Unrealized P&L"
          value={fmtMoney(snapshot.unrealized_pnl_cents)}
          valueClass={pnlClass(snapshot.unrealized_pnl_cents)}
          sub={pnlSub}
        />
        <MetricCell
          label="Cash flow (mo)"
          value={fmtMoney(cashflow.current_month_net_cents)}
          valueClass={pnlClass(cashflow.current_month_net_cents)}
          sub={cashSub}
        />
        <MetricCell
          label="Active inventory"
          value={snapshot.active_count.toLocaleString("en-US")}
          sub={
            snapshot.avg_unrealized_per_card_cents != null
              ? {
                  text: `${fmtMoney(snapshot.avg_unrealized_per_card_cents)} / card`,
                  tone: null,
                }
              : undefined
          }
        />
        <MetricCell
          label="Avg hold time"
          value={
            snapshot.avg_hold_days == null
              ? "—"
              : `${snapshot.avg_hold_days}d`
          }
        />
        <MetricCell
          label="Turn rate"
          value={turnText}
          sub={{ text: "TTM / yr", tone: null }}
        />
        <MetricCell
          label="Sell-through"
          value={fmtPct(velocity.sell_through_pct, 0)}
          sub={{ text: `${velocity.sold_last_90d} sold · 90d`, tone: null }}
        />
        <MetricCell
          label="Sold (90d)"
          value={velocity.sold_last_90d.toLocaleString("en-US")}
        />
      </div>
    </section>
  );
}

function PnlSection({
  totals,
  monthly,
  daily,
  period,
  setPeriod,
}: {
  totals: FinancialsSummary["totals"];
  monthly: MonthBucket[];
  daily: DayBucket[];
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const current: PeriodTotals = totals[period];
  const compareTo: PeriodTotals =
    period === "last_30d" ? totals.prev_30d : current;
  const showDelta = period === "last_30d";

  const revenueDelta = showDelta
    ? pctDelta(current.revenue_cents, compareTo.revenue_cents)
    : null;
  const profitDelta = showDelta
    ? pctDelta(current.profit_cents, compareTo.profit_cents)
    : null;
  const marginDelta =
    showDelta && current.margin_pct != null && compareTo.margin_pct != null
      ? current.margin_pct - compareTo.margin_pct
      : null;

  const periodOpts: { key: PeriodKey; label: string }[] = [
    { key: "last_30d", label: "Last 30d" },
    { key: "mtd", label: "MTD" },
    { key: "ytd", label: "YTD" },
  ];

  // Full 12-month series — feeds the "Expand analytics" modal, which keeps its
  // own 6M/12M range control regardless of the selected period.
  const monthlyChartData = useMemo(
    () =>
      monthly.map((m) => ({
        month: formatMonth(m.month),
        revenue: m.revenue_cents / 100,
        profit: m.profit_cents / 100,
        margin:
          m.revenue_cents > 0 ? (m.profit_cents / m.revenue_cents) * 100 : 0,
        sales: m.sales_count,
      })),
    [monthly]
  );

  // Inline trend preview follows the selected timeframe: daily resolution for
  // the short windows, the current calendar year's months for YTD.
  const periodChartData = useMemo<TrendDatum[]>(() => {
    if (period === "ytd") {
      const yearPrefix = `${new Date().getFullYear()}-`;
      return monthly
        .filter((m) => m.month.startsWith(yearPrefix))
        .map((m) => ({
          month: formatMonth(m.month),
          revenue: m.revenue_cents / 100,
          profit: m.profit_cents / 100,
          margin:
            m.revenue_cents > 0 ? (m.profit_cents / m.revenue_cents) * 100 : 0,
          sales: m.sales_count,
        }));
    }
    const now = new Date();
    const monthStartKey = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, "0")}-01`;
    const days =
      period === "mtd"
        ? daily.filter((d) => d.day >= monthStartKey)
        : daily.slice(-30);
    return days.map((d) => ({
      month: formatDay(d.day),
      revenue: d.revenue_cents / 100,
      profit: d.profit_cents / 100,
      margin:
        d.revenue_cents > 0 ? (d.profit_cents / d.revenue_cents) * 100 : 0,
      sales: d.sales_count,
    }));
  }, [monthly, daily, period]);

  const trendLabel =
    period === "last_30d"
      ? "Trend · 30d"
      : period === "mtd"
        ? "Trend · MTD"
        : "Trend · YTD";
  const emptyMessage =
    period === "last_30d"
      ? "No sales in the last 30 days yet. Record a sale from the ledger to see your trend here."
      : period === "mtd"
        ? "No sales this month yet. Record a sale from the ledger to see your trend here."
        : "No sales this year yet. Record a sale from the ledger to see your trend here.";

  const hasChart = periodChartData.some(
    (d) => d.sales > 0 || d.revenue !== 0 || d.profit !== 0
  );
  const hasModalChart = monthly.some((m) => m.sales_count > 0);

  return (
    <section className="border border-[#24282D] bg-[#0B0D0F]">
      <div className="border-b border-[#24282D] px-3 pt-2.5">
        <SectionHeading
          eyebrow="Profit & Loss"
          title="Am I making money?"
          compact
          right={
            <div className="flex border border-[#24282D]">
              {periodOpts.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    period === opt.key
                      ? "bg-[#20B26B] text-[#07100B]"
                      : "text-[#B8C0CC] hover:text-[#E6E8EB]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[#24282D] border-b border-[#24282D] sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-7">
        <MetricCell
          label="Net profit"
          value={fmtMoney(current.profit_cents)}
          valueClass={pnlClass(current.profit_cents)}
          sub={
            showDelta && profitDelta != null
              ? {
                  text: `${fmtSigned(profitDelta)} vs prior 30d`,
                  tone:
                    profitDelta > 0 ? "up" : profitDelta < 0 ? "down" : null,
                }
              : undefined
          }
        />
        <MetricCell
          label="Revenue"
          value={fmtMoney(current.revenue_cents)}
          sub={
            showDelta && revenueDelta != null
              ? {
                  text: `${fmtSigned(revenueDelta)} vs prior 30d`,
                  tone:
                    revenueDelta > 0 ? "up" : revenueDelta < 0 ? "down" : null,
                }
              : undefined
          }
        />
        <MetricCell
          label="Margin"
          value={fmtPct(current.margin_pct)}
          sub={
            showDelta && marginDelta != null
              ? {
                  text: `${fmtSigned(marginDelta, " pts")} vs prior 30d`,
                  tone:
                    marginDelta > 0 ? "up" : marginDelta < 0 ? "down" : null,
                }
              : undefined
          }
        />
        <MetricCell
          label="Sales"
          value={current.sales_count.toLocaleString("en-US")}
          sub={
            current.avg_order_value_cents != null
              ? {
                  text: `${fmtMoney(current.avg_order_value_cents)} avg`,
                  tone: null,
                }
              : undefined
          }
        />
        <MetricCell label="COGS" value={fmtMoney(current.cogs_cents)} />
        <MetricCell label="Fees" value={fmtMoney(current.fees_cents)} />
        <MetricCell
          label="Shipping"
          value={fmtMoney(current.shipping_cost_cents)}
        />
      </div>

      {/* Compact trend preview */}
      <div className="px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#77808C]">
              {trendLabel}
            </span>
            <div className="hidden items-center gap-2.5 sm:flex">
              <LegendDot color={SERIES_COLORS.revenue} label="Revenue" />
              <LegendDot color={SERIES_COLORS.profit} label="Profit" />
              <LegendDot color={SERIES_COLORS.margin} label="Margin %" />
            </div>
          </div>
          {hasModalChart ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 border border-[#343941] bg-[#111315] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Expand analytics ↗
            </button>
          ) : null}
        </div>
        {hasChart ? (
          <div className="h-[120px] w-full">
            <TrendChart
              data={periodChartData}
              active={{ revenue: true, profit: true, margin: true, sales: false }}
              compact
            />
          </div>
        ) : (
          <EmptyState message={emptyMessage} height={120} />
        )}
      </div>

      {expanded ? (
        <AnalyticsModal
          data={monthlyChartData}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[#77808C]">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function AnalyticsModal({
  data,
  onClose,
}: {
  data: TrendDatum[];
  onClose: () => void;
}) {
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({
    revenue: true,
    profit: true,
    margin: true,
    sales: false,
  });
  const [range, setRange] = useState<RangeKey>("12m");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const view = useMemo(
    () => (range === "6m" ? data.slice(-6) : data),
    [data, range]
  );

  const toggle = (key: SeriesKey) =>
    setActive((s) => ({ ...s, [key]: !s[key] }));

  const seriesOpts: { key: SeriesKey; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "profit", label: "Profit" },
    { key: "margin", label: "Margin %" },
    { key: "sales", label: "Sales count" },
  ];
  const rangeOpts: { key: RangeKey; label: string }[] = [
    { key: "6m", label: "6M" },
    { key: "12m", label: "12M" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col border border-[#24282D] bg-[#0B0D0F] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#24282D] px-4 py-3">
          <div>
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Profit & Loss
            </div>
            <h2 className="text-[14px] font-semibold tracking-tight text-[#E6E8EB]">
              Performance trend
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-[#24282D]">
              {rangeOpts.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    range === opt.key
                      ? "bg-[#20B26B] text-[#07100B]"
                      : "text-[#B8C0CC] hover:text-[#E6E8EB]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="border border-[#24282D] bg-[#111315] px-2.5 py-1.5 text-[12px] font-semibold text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Esc ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-[#24282D] px-4 py-2.5">
          {seriesOpts.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                active[opt.key]
                  ? "border-[#343941] bg-[#111315] text-[#E6E8EB]"
                  : "border-[#24282D] text-[#77808C] hover:text-[#B8C0CC]"
              }`}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: active[opt.key]
                    ? SERIES_COLORS[opt.key]
                    : "#3F454D",
                }}
              />
              {opt.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 p-4">
          <div className="h-[55vh] min-h-[320px] w-full">
            <TrendChart data={view} active={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StaleAlertBlock({ stale }: { stale: StaleAlert }) {
  return (
    <div className="border border-[#723030] bg-[#1A0E0E] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#E05C5C]">
            Stale capital alert
          </div>
          <div className="mt-1 font-data text-[22px] font-semibold tabular-nums text-[#E05C5C]">
            {fmtMoney(stale.cost_basis_cents)}
            <span className="ml-2 text-[12px] font-medium tracking-normal text-[#B8C0CC]">
              tied up in inventory older than 90 days
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[#B8C0CC]">
        <span>
          <span className="text-[#E6E8EB]">{stale.count}</span> card
          {stale.count === 1 ? "" : "s"}
        </span>
        <span className="text-[#3F454D]">•</span>
        <span>
          Average age{" "}
          <span className="text-[#E6E8EB]">{stale.avg_age_days ?? "—"} days</span>
        </span>
        <span className="text-[#3F454D]">•</span>
        <span>
          Est. value{" "}
          <span className="text-[#E6E8EB]">
            {fmtMoney(stale.estimated_value_cents)}
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/business/ledger?aging=90"
          className="border border-[#E05C5C] bg-[#E05C5C] px-3 py-1.5 text-[11px] font-semibold text-[#1A0E0E] hover:bg-[#F26D6D]"
        >
          View inventory →
        </Link>
        <Link
          href="/marketplace/sell/messages?intent=reprice_stale"
          className="border border-[#343941] bg-[#0B0D0F] px-3 py-1.5 text-[11px] font-semibold text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          Bulk reprice →
        </Link>
      </div>
    </div>
  );
}

function CapitalAllocation({
  inventory,
}: {
  inventory: FinancialsSummary["inventory"];
}) {
  const totalCapital = inventory.aging.reduce(
    (a, b) => a + b.cost_basis_cents,
    0
  );
  const totalCount = inventory.aging.reduce((a, b) => a + b.count, 0);

  const pieData = inventory.aging.map((b) => ({
    name: b.label,
    value: b.cost_basis_cents,
    count: b.count,
  }));

  const hasData = totalCapital > 0;

  return (
    <section className="border border-[#24282D] bg-[#0B0D0F] p-3">
      <SectionHeading
        eyebrow="Capital Allocation"
        title="Where your capital is tied up"
        compact
        right={
          <Link
            href="/business/ledger"
            className="text-[11px] font-medium text-[#3B82F6] hover:text-[#60A5FA]"
          >
            Open ledger →
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
        <div className="relative">
          {hasData ? (
            <>
              <div className="h-[160px] w-full">
                <AgingPieChart pieData={pieData} />
              </div>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#77808C]">
                  Capital
                </div>
                <div className="font-data text-[15px] font-semibold tabular-nums leading-tight text-[#E6E8EB]">
                  {fmtMoneyCompact(totalCapital)}
                </div>
                <div className="text-[9px] text-[#77808C]">
                  {totalCount} card{totalCount === 1 ? "" : "s"}
                </div>
              </div>
            </>
          ) : (
            <EmptyState message="Add inventory in the ledger to see aging." />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3 text-right">Cards</th>
                <th className="py-2 pr-3 text-right">Cost basis</th>
                <th className="py-2 pr-3 text-right">Est. value</th>
                <th className="py-2 text-right">% of capital</th>
              </tr>
            </thead>
            <tbody>
              {inventory.aging.map((row) => {
                const pct =
                  totalCapital > 0
                    ? (row.cost_basis_cents / totalCapital) * 100
                    : 0;
                return (
                  <tr
                    key={row.label}
                    className="border-t border-[#1E2227] text-[#E6E8EB]"
                  >
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: AGING_COLORS[row.label] }}
                        />
                        {row.label} days
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-[#B8C0CC]">
                      {row.count}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-data tabular-nums">
                      {fmtMoney(row.cost_basis_cents)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-data tabular-nums text-[#B8C0CC]">
                      {fmtMoney(row.estimated_value_cents)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-[#B8C0CC]">
                      {pct.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ChannelPerformancePanel({ rows }: { rows: ChannelBreakdown[] }) {
  if (rows.length === 0) {
    return (
      <section className="border border-[#24282D] bg-[#0B0D0F] p-3">
        <SectionHeading
          eyebrow="Channel Performance"
          title="Revenue & profit by channel"
          compact
        />
        <EmptyState message="No sales in the last 90 days." />
      </section>
    );
  }
  const maxProfit = Math.max(...rows.map((r) => Math.abs(r.profit_cents)), 1);
  return (
    <section className="border border-[#24282D] bg-[#0B0D0F] p-3">
      <SectionHeading
        eyebrow="Channel Performance"
        title="Revenue & profit by channel"
        compact
        right={
          <span className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
            Last 90d
          </span>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
              <th className="py-2 pr-3">Channel</th>
              <th className="py-2 pr-3 text-right">Revenue</th>
              <th className="py-2 pr-3 text-right">Profit</th>
              <th className="py-2 pr-3 text-right">Margin</th>
              <th className="py-2 pr-3 text-right">Sales</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const negative = row.profit_cents < 0;
              const widthPct = Math.max(
                4,
                (Math.abs(row.profit_cents) / maxProfit) * 100
              );
              return (
                <tr
                  key={row.channel}
                  className={`group border-t border-[#1E2227] text-[#E6E8EB] transition-colors hover:bg-[#111315] ${
                    negative ? "bg-[#160C0C]" : ""
                  }`}
                >
                  <td className="py-1.5 pr-3 font-semibold capitalize">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          negative ? "bg-[#E05C5C]" : "bg-[#20B26B]"
                        }`}
                      />
                      {row.channel}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-data tabular-nums">
                    {fmtMoney(row.revenue_cents)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-data tabular-nums ${pnlClass(row.profit_cents)}`}
                  >
                    {fmtMoney(row.profit_cents)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-data tabular-nums ${
                      negative ? "text-[#E05C5C]" : "text-[#F0B429]"
                    }`}
                  >
                    {fmtPct(row.margin_pct, 0)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[#B8C0CC]">
                    {row.sales_count}
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="h-1.5 w-20 bg-[#1E2227]">
                      <div
                        className={`h-full ${negative ? "bg-[#E05C5C]" : "bg-[#20B26B]"}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PerformersAccordion({
  winners,
  losers,
}: {
  winners: CardPerformance[];
  losers: CardPerformance[];
}) {
  const [open, setOpen] = useState(false);
  const count = winners.length + losers.length;
  return (
    <section className="border border-[#24282D] bg-[#0B0D0F]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#111315]"
      >
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Performers · 180d
            </div>
            <div className="text-[13px] font-semibold tracking-tight text-[#E6E8EB]">
              View performers
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
            Best & worst trades · Profit · ROI
          </span>
        </div>
        <span className="text-[12px] text-[#77808C]">
          {count > 0 ? `${count} ` : ""}
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-1 gap-2 border-t border-[#24282D] p-2 md:grid-cols-2">
          <PerformerList
            title="Best performing"
            rows={winners}
            emptyMessage="No profitable sales in the last 180 days yet."
            tone="up"
          />
          <PerformerList
            title="Worst performing"
            rows={losers}
            emptyMessage="No losing sales in the last 180 days — well done."
            tone="down"
          />
        </div>
      ) : null}
    </section>
  );
}

function PerformerList({
  title,
  rows,
  emptyMessage,
  tone,
}: {
  title: string;
  rows: CardPerformance[];
  emptyMessage: string;
  tone: "up" | "down";
}) {
  return (
    <div className="border border-[#24282D] bg-[#090B0D]">
      <div className="flex items-center justify-between border-b border-[#24282D] px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC]">
          {title}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
          Profit · ROI
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} height={120} />
      ) : (
        <ul className="divide-y divide-[#1E2227]">
          {rows.map((row, i) => (
            <li
              key={`${row.title}-${row.sold_at}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-[#E6E8EB]">
                  {row.title}
                </div>
                <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.06em] text-[#77808C]">
                  {row.channel} · {new Date(row.sold_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-data text-[13px] font-semibold tabular-nums ${
                    tone === "up" ? "text-[#20B26B]" : "text-[#E05C5C]"
                  }`}
                >
                  {fmtMoney(row.profit_cents)}
                </div>
                <div className="text-[11px] tabular-nums text-[#77808C]">
                  {row.roi_pct == null ? "—" : fmtSigned(row.roi_pct)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  message,
  height = 160,
}: {
  message: string;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center px-4 text-center text-[12px] text-[#77808C]"
      style={{ height }}
    >
      {message}
    </div>
  );
}

function LoadingFinancials() {
  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-7 w-40 bg-[#1E2227]" />
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-14 bg-[#1E2227]" />
            ))}
          </div>
          <div className="h-[260px] bg-[#1E2227]" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="h-[220px] bg-[#1E2227]" />
            <div className="h-[220px] bg-[#1E2227]" />
          </div>
        </div>
      </main>
    </>
  );
}

export default function FinancialsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<FinancialsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last_30d");

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

  if (loading) return <LoadingFinancials />;

  if (hasAccess === false) {
    return (
      <>
        <main className="min-h-screen bg-[#090B0D] px-4 py-4">
          <BusinessPaywall />
        </main>
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#24282D] px-4 py-2 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[15px] font-semibold tracking-normal text-[#E6E8EB]">
              Financials
            </h1>
            <span className="text-[10px] uppercase tracking-[0.12em] text-[#77808C]">
              Synced with ledger
            </span>
          </div>
        </header>

        {error ? (
          <div className="m-3 border border-[#723030] bg-[#2A1111] p-2 text-[12px] text-[#E05C5C]">
            {error}
          </div>
        ) : null}

        {summary ? (
          <div className="space-y-3 px-4 py-3 sm:px-6">
            <SnapshotAndVelocity
              snapshot={summary.snapshot}
              velocity={summary.velocity}
              cashflow={summary.cashflow}
            />
            <PnlSection
              totals={summary.totals}
              monthly={summary.monthly}
              daily={summary.daily}
              period={period}
              setPeriod={setPeriod}
            />
            {summary.inventory.stale.count > 0 ? (
              <StaleAlertBlock stale={summary.inventory.stale} />
            ) : null}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <CapitalAllocation inventory={summary.inventory} />
              <ChannelPerformancePanel rows={summary.channels_90d} />
            </div>
            <PerformersAccordion
              winners={summary.winners}
              losers={summary.losers}
            />
          </div>
        ) : null}
      </main>
    </>
  );
}
