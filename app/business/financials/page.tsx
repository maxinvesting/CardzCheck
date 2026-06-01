"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import { createClient } from "@/lib/supabase/client";
import type {
  AgingBucket,
  CardPerformance,
  ChannelBreakdown,
  DealerScore,
  FinancialsSummary,
  MonthBucket,
  PeriodTotals,
  Snapshot,
  StaleAlert,
  Velocity,
} from "@/lib/business/financials";

type PeriodKey = "last_30d" | "mtd" | "ytd";
type SeriesKey = "revenue" | "profit" | "margin";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MONEY_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const AGING_COLORS: Record<AgingBucket["label"], string> = {
  "0-30": "#20B26B",
  "31-60": "#86B817",
  "61-90": "#F0B429",
  "90+": "#E05C5C",
};

const SERIES_COLORS: Record<SeriesKey, string> = {
  revenue: "#3B82F6",
  profit: "#20B26B",
  margin: "#F0B429",
};

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

function fmtMoneyCompact(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const abs = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}%`;
}

function fmtSigned(value: number, suffix = "%"): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function pnlClass(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function deltaClass(value: number | null): string {
  if (value == null) return "text-[#77808C]";
  if (value > 0) return "text-[#20B26B]";
  if (value < 0) return "text-[#E05C5C]";
  return "text-[#77808C]";
}

function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short" });
}

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
    <div
      className={`flex items-center justify-between gap-3 ${compact ? "mb-2" : "mb-2"}`}
    >
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
    <div className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-0.5 font-data text-[16px] font-semibold tabular-nums leading-tight ${valueClass ?? "text-[#E6E8EB]"}`}
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

function StatTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-[#24282D] bg-[#0B0D0F] px-3 py-2">
      <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-0.5 font-data text-[16px] font-semibold tabular-nums leading-tight ${valueClass ?? "text-[#E6E8EB]"}`}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-[10px] tabular-nums text-[#77808C]">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SnapshotAndVelocity({
  snapshot,
  velocity,
}: {
  snapshot: Snapshot;
  velocity: Velocity;
}) {
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
      <div className="grid grid-cols-2 divide-x divide-y divide-[#24282D] border border-[#24282D] bg-[#0B0D0F] md:grid-cols-4 md:divide-y-0 xl:grid-cols-8">
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

function PnlOverview({
  totals,
  period,
  setPeriod,
}: {
  totals: FinancialsSummary["totals"];
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
}) {
  const current: PeriodTotals = totals[period];
  const compareTo: PeriodTotals = period === "last_30d" ? totals.prev_30d : current;
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

  return (
    <section>
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

      <div className="grid grid-cols-2 divide-x divide-y divide-[#24282D] border border-[#24282D] bg-[#0B0D0F] md:grid-cols-7 md:divide-y-0">
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
    </section>
  );
}

function PnlChart({ monthly }: { monthly: MonthBucket[] }) {
  const [series, setSeries] = useState<Record<SeriesKey, boolean>>({
    revenue: true,
    profit: true,
    margin: true,
  });

  const data = useMemo(
    () =>
      monthly.map((m) => ({
        month: formatMonth(m.month),
        revenue: m.revenue_cents / 100,
        profit: m.profit_cents / 100,
        margin:
          m.revenue_cents > 0 ? (m.profit_cents / m.revenue_cents) * 100 : 0,
      })),
    [monthly]
  );

  const hasData = monthly.some((m) => m.sales_count > 0);
  const toggle = (key: SeriesKey) =>
    setSeries((s) => ({ ...s, [key]: !s[key] }));

  const toggleBtn = (key: SeriesKey, label: string) => (
    <button
      type="button"
      onClick={() => toggle(key)}
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors ${
        series[key]
          ? "border-[#343941] bg-[#111315] text-[#E6E8EB]"
          : "border-[#24282D] text-[#77808C] hover:text-[#B8C0CC]"
      }`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: series[key] ? SERIES_COLORS[key] : "#3F454D",
        }}
      />
      {label}
    </button>
  );

  return (
    <section className="border border-[#24282D] bg-[#0B0D0F] p-3">
      <SectionHeading
        eyebrow="Trend"
        title="Last 12 months"
        compact
        right={
          <div className="flex gap-1">
            {toggleBtn("revenue", "Revenue")}
            {toggleBtn("profit", "Profit")}
            {toggleBtn("margin", "Margin %")}
          </div>
        }
      />
      {hasData ? (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_COLORS.revenue} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES_COLORS.revenue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_COLORS.profit} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES_COLORS.profit} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E2227" strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                stroke="#77808C"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#24282D" }}
              />
              <YAxis
                yAxisId="left"
                stroke="#77808C"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtMoneyCompact(v * 100)}
                tickLine={false}
                axisLine={{ stroke: "#24282D" }}
                width={56}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#77808C"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tickLine={false}
                axisLine={{ stroke: "#24282D" }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "#0B0D0F",
                  border: "1px solid #24282D",
                  fontSize: 12,
                  borderRadius: 0,
                }}
                labelStyle={{ color: "#B8C0CC" }}
                formatter={(value, name) => {
                  const v = Number(value) || 0;
                  const label = String(name);
                  if (label === "Margin") return [`${v.toFixed(1)}%`, label];
                  return [MONEY_PRECISE.format(v), label];
                }}
              />
              {series.revenue ? (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={SERIES_COLORS.revenue}
                  strokeWidth={2}
                  fill="url(#revFill)"
                  isAnimationActive={false}
                />
              ) : null}
              {series.profit ? (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="profit"
                  name="Profit"
                  stroke={SERIES_COLORS.profit}
                  strokeWidth={2}
                  fill="url(#profitFill)"
                  isAnimationActive={false}
                />
              ) : null}
              {series.margin ? (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="margin"
                  name="Margin"
                  stroke={SERIES_COLORS.margin}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No sales in the last 12 months yet. Record a sale from the ledger to see your trend here." />
      )}
    </section>
  );
}

function StaleAlertBlock({ stale }: { stale: StaleAlert }) {
  if (stale.count === 0) {
    return (
      <div className="border border-[#1F5F45] bg-[#0E251B] p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#20B26B]">
          Clean inventory
        </div>
        <div className="mt-1 text-[13px] text-[#E6E8EB]">
          No cards have been sitting longer than 90 days.
        </div>
      </div>
    );
  }
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
          href="/business/sales-agent?intent=reprice_stale"
          className="border border-[#343941] bg-[#0B0D0F] px-3 py-1.5 text-[11px] font-semibold text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          Bulk reprice →
        </Link>
      </div>
    </div>
  );
}

function InventoryHealth({
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
        eyebrow="Inventory Health"
        title="How much is sitting where"
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
        <div className="relative">
          {hasData ? (
            <>
              <div className="h-[170px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      stroke="#0B0D0F"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={AGING_COLORS[entry.name as AgingBucket["label"]]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#0B0D0F",
                        border: "1px solid #24282D",
                        fontSize: 12,
                        borderRadius: 0,
                      }}
                      formatter={(value, _name, item) => {
                        const v = Number(value) || 0;
                        const payload = (item as { payload?: { count?: number; name?: string } } | undefined)?.payload;
                        return [
                          `${MONEY.format(v / 100)} (${payload?.count ?? 0} cards)`,
                          `${payload?.name ?? ""} days`,
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#77808C]">
                  Inventory
                </div>
                <div className="font-data text-[15px] font-semibold tabular-nums leading-tight text-[#E6E8EB]">
                  {fmtMoneyCompact(inventory.total_estimated_value_cents)}
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
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: AGING_COLORS[row.label] }}
                        />
                        {row.label} days
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#B8C0CC]">
                      {row.count}
                    </td>
                    <td className="py-2 pr-3 text-right font-data tabular-nums">
                      {fmtMoney(row.cost_basis_cents)}
                    </td>
                    <td className="py-2 pr-3 text-right font-data tabular-nums text-[#B8C0CC]">
                      {fmtMoney(row.estimated_value_cents)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[#B8C0CC]">
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

function ChannelBreakdownPanel({ rows }: { rows: ChannelBreakdown[] }) {
  if (rows.length === 0) {
    return (
      <section className="border border-[#24282D] bg-[#0B0D0F] p-3">
        <SectionHeading
          eyebrow="Channels (90d)"
          title="Profit by channel"
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
        eyebrow="Channels (90d)"
        title="Profit by channel"
        compact
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12px]">
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
              const widthPct = Math.max(
                4,
                (Math.abs(row.profit_cents) / maxProfit) * 100
              );
              return (
                <tr
                  key={row.channel}
                  className="group border-t border-[#1E2227] text-[#E6E8EB] transition-colors hover:bg-[#111315]"
                >
                  <td className="py-1.5 pr-3 font-semibold capitalize">
                    {row.channel}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-data tabular-nums">
                    {fmtMoney(row.revenue_cents)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right font-data tabular-nums ${pnlClass(row.profit_cents)}`}
                  >
                    {fmtMoney(row.profit_cents)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-data tabular-nums text-[#F0B429]">
                    {fmtPct(row.margin_pct, 0)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[#B8C0CC]">
                    {row.sales_count}
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="h-1.5 w-20 bg-[#1E2227]">
                      <div
                        className={`h-full ${row.profit_cents >= 0 ? "bg-[#20B26B]" : "bg-[#E05C5C]"}`}
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

function PerformersPanel({
  winners,
  losers,
}: {
  winners: CardPerformance[];
  losers: CardPerformance[];
}) {
  return (
    <section>
      <SectionHeading
        eyebrow="Performers (180d)"
        title="Best and worst trades"
        compact
      />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
    <div className="border border-[#24282D] bg-[#0B0D0F]">
      <div className="flex items-center justify-between border-b border-[#24282D] px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC]">
          {title}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
          Profit · ROI
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
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

function DealerScoreInline({ score }: { score: DealerScore }) {
  const scoreClass =
    score.total >= 80
      ? "text-[#20B26B]"
      : score.total >= 60
        ? "text-[#86B817]"
        : score.total >= 40
          ? "text-[#F0B429]"
          : "text-[#E05C5C]";
  const components: { label: string; value: number }[] = [
    { label: "Margin", value: score.components.margin },
    { label: "Turn", value: score.components.turn },
    { label: "Stale", value: score.components.stale },
    { label: "Sell-thr", value: score.components.sell_through },
  ];
  return (
    <div
      className="flex items-center gap-3 border border-[#24282D] bg-[#0B0D0F] px-3 py-1.5"
      title={`Composite of margin / turn / stale / sell-through (25 pts each)`}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-[#77808C]">
          Dealer
        </span>
        <span className={`font-data text-[18px] font-semibold tabular-nums leading-none ${scoreClass}`}>
          {score.total}
        </span>
        <span className="text-[10px] text-[#77808C]">/100</span>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        {components.map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-[0.06em] text-[#77808C]">
              {c.label}
            </span>
            <div className="h-1 w-10 bg-[#1E2227]">
              <div
                className="h-full bg-[#3B82F6]"
                style={{ width: `${(c.value / 25) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[160px] items-center justify-center px-4 text-center text-[12px] text-[#77808C]">
      {message}
    </div>
  );
}

function LoadingFinancials() {
  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-7 w-40 bg-[#1E2227]" />
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-[#1E2227]" />
            ))}
          </div>
          <div className="h-[280px] bg-[#1E2227]" />
          <div className="h-[280px] bg-[#1E2227]" />
        </div>
      </main>
    </AuthenticatedLayout>
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
      <AuthenticatedLayout>
        <main className="min-h-screen bg-[#090B0D] px-4 py-4">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
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
          {summary ? (
            <DealerScoreInline score={summary.dealer_score} />
          ) : null}
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
            />
            <PnlOverview
              totals={summary.totals}
              period={period}
              setPeriod={setPeriod}
            />
            {summary.inventory.stale.count > 0 ? (
              <StaleAlertBlock stale={summary.inventory.stale} />
            ) : null}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_380px]">
              <PnlChart monthly={summary.monthly} />
              <InventoryHealth inventory={summary.inventory} />
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ChannelBreakdownPanel rows={summary.channels_90d} />
              <PerformersPanel
                winners={summary.winners}
                losers={summary.losers}
              />
            </div>
          </div>
        ) : null}
      </main>
    </AuthenticatedLayout>
  );
}
