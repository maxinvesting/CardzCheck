"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fmtMoney,
  fmtPct,
  formatMonth,
  fmtSigned,
  pnlClass,
  type PeriodKey,
} from "./financialsFormat";
import { createClient } from "@/lib/supabase/client";
import type {
  CardPerformance,
  CashFlow,
  ChannelBreakdown,
  MonthBucket,
  FinancialsSummary,
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
      </div>
    </div>
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

/* ── Accounting statement primitives ──────────────────────────────────────── */

function StatementRow({
  label,
  value,
  note,
  tone = "normal",
  indent = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "normal" | "muted" | "total" | "pnl-pos" | "pnl-neg";
  indent?: boolean;
}) {
  const labelCls =
    tone === "total"
      ? "text-[12px] font-semibold text-[#E6E8EB]"
      : tone === "muted"
        ? "text-[12px] text-[#77808C]"
        : "text-[12px] text-[#B8C0CC]";

  const valueCls =
    tone === "total"
      ? "text-[13px] font-semibold text-[#E6E8EB]"
      : tone === "pnl-pos"
        ? "text-[13px] font-medium text-[#20B26B]"
        : tone === "pnl-neg"
          ? "text-[13px] font-medium text-[#E05C5C]"
          : "text-[13px] text-[#E6E8EB]";

  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-[7px] ${
        tone === "total" ? "border-t border-[#343941]" : ""
      }`}
    >
      <div className={`flex items-baseline gap-2 ${indent ? "pl-3" : ""}`}>
        <span className={labelCls}>{label}</span>
        {note ? (
          <span className="text-[10px] text-[#5A626D]">{note}</span>
        ) : null}
      </div>
      <span className={`font-mono-num tabular-nums ${valueCls}`}>{value}</span>
    </div>
  );
}

function StatementCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[#24282D] bg-[#0F1317]">
      <div className="flex items-center justify-between gap-3 border-b border-[#24282D] px-4 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E6E8EB]">
            {title}
          </h2>
          {subtitle ? (
            <span className="text-[10px] text-[#77808C]">{subtitle}</span>
          ) : null}
        </div>
        {right}
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

/* ── Position: what the business is worth right now ───────────────────────── */

function PositionStatement({ snapshot }: { snapshot: Snapshot }) {
  const unrealized = snapshot.unrealized_pnl_cents;
  return (
    <StatementCard
      title="Position"
      subtitle="what you hold today"
    >
      <StatementRow
        label="Cash on hand"
        value={fmtMoney(snapshot.cash_on_hand_cents)}
      />
      <StatementRow
        label="Inventory at cost"
        value={fmtMoney(snapshot.cost_basis_cents)}
        note={`${snapshot.active_count} cards`}
      />
      <StatementRow
        label="Inventory at market"
        value={fmtMoney(snapshot.inventory_value_cents)}
        tone="muted"
        indent
      />
      <StatementRow
        label="Unrealized gain"
        value={fmtMoney(unrealized)}
        note={
          snapshot.unrealized_pnl_pct != null
            ? fmtSigned(snapshot.unrealized_pnl_pct)
            : undefined
        }
        tone={unrealized >= 0 ? "pnl-pos" : "pnl-neg"}
        indent
      />
      {snapshot.unrealized_trade_gain_cents !== 0 ? (
        <StatementRow
          label="Unrealized trade gain"
          value={fmtMoney(snapshot.unrealized_trade_gain_cents)}
          note="books as cards sell"
          tone="muted"
          indent
        />
      ) : null}
      <StatementRow
        label="Total value"
        value={fmtMoney(snapshot.total_business_value_cents)}
        note="cash + inventory at market"
        tone="total"
      />
    </StatementCard>
  );
}

/* ── P&L: what the business earned over a period ──────────────────────────── */

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: "last_30d", label: "Last 30d" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
];

function PnlStatement({
  totals,
  period,
  setPeriod,
}: {
  totals: FinancialsSummary["totals"];
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
}) {
  const t = totals[period];
  const grossProfit = t.revenue_cents - t.cogs_cents;
  // `profit_cents` is stored per sale rather than derived, so it can drift from
  // the components above (a row edited without recomputing profit, or a cost
  // captured only in the stored figure). Surface any gap as its own line so the
  // statement always foots instead of silently disagreeing with itself.
  const adjustments =
    t.profit_cents - (grossProfit - t.fees_cents - t.shipping_cost_cents);

  return (
    <StatementCard
      title="Profit & loss"
      subtitle="realized — sold cards only"
      right={
        <div className="flex items-center gap-1">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-2 py-[3px] text-[10px] uppercase tracking-[0.08em] transition-colors ${
                period === p.key
                  ? "bg-[#1B2A22] text-[#20B26B]"
                  : "text-[#77808C] hover:text-[#B8C0CC]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      <StatementRow
        label="Revenue"
        value={fmtMoney(t.revenue_cents)}
        note={`${t.sales_count} ${t.sales_count === 1 ? "sale" : "sales"}`}
      />
      <StatementRow
        label="Cost of goods sold"
        value={`(${fmtMoney(t.cogs_cents)})`}
        tone="muted"
        indent
      />
      <StatementRow
        label="Gross profit"
        value={fmtMoney(grossProfit)}
        tone="total"
      />
      <StatementRow
        label="Platform fees"
        value={`(${fmtMoney(t.fees_cents)})`}
        tone="muted"
        indent
      />
      <StatementRow
        label="Shipping"
        value={`(${fmtMoney(t.shipping_cost_cents)})`}
        tone="muted"
        indent
      />
      {adjustments !== 0 ? (
        <StatementRow
          label="Adjustments"
          value={fmtMoney(adjustments)}
          note="recorded profit differs from line items"
          tone="muted"
          indent
        />
      ) : null}
      <StatementRow
        label="Net profit"
        value={fmtMoney(t.profit_cents)}
        note={t.margin_pct != null ? `${fmtPct(t.margin_pct)} margin` : undefined}
        tone="total"
      />
      <StatementRow
        label="Average sale"
        value={fmtMoney(t.avg_order_value_cents)}
        tone="muted"
      />
    </StatementCard>
  );
}

/* ── Monthly P&L history ──────────────────────────────────────────────────── */

function MonthlyPnlTable({ monthly }: { monthly: MonthBucket[] }) {
  const rows = [...monthly].reverse().filter((m) => m.sales_count > 0);
  if (rows.length === 0) return null;

  const totals = rows.reduce(
    (acc, m) => ({
      sales: acc.sales + m.sales_count,
      revenue: acc.revenue + m.revenue_cents,
      cogs: acc.cogs + m.cogs_cents,
      fees: acc.fees + m.fees_cents,
      shipping: acc.shipping + m.shipping_cost_cents,
      profit: acc.profit + m.profit_cents,
    }),
    { sales: 0, revenue: 0, cogs: 0, fees: 0, shipping: 0, profit: 0 }
  );

  const cell = "px-3 py-[6px] text-right font-mono-num tabular-nums text-[12px]";
  const head =
    "px-3 py-[6px] text-right text-[9px] font-semibold uppercase tracking-[0.1em] text-[#5A626D]";

  return (
    <StatementCard title="Monthly P&L" subtitle="trailing 12 months">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-[#24282D]">
              <th className={`${head} text-left`}>Month</th>
              <th className={head}>Sales</th>
              <th className={head}>Revenue</th>
              <th className={head}>COGS</th>
              <th className={head}>Gross</th>
              <th className={head}>Fees</th>
              <th className={head}>Ship</th>
              <th className={head}>Adj</th>
              <th className={head}>Net</th>
              <th className={head}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const gross = m.revenue_cents - m.cogs_cents;
              const adj =
                m.profit_cents -
                (gross - m.fees_cents - m.shipping_cost_cents);
              const margin =
                m.revenue_cents > 0
                  ? (m.profit_cents / m.revenue_cents) * 100
                  : null;
              return (
                <tr
                  key={m.month}
                  className="border-b border-[#191D21] last:border-0"
                >
                  <td className="px-3 py-[6px] text-left text-[12px] text-[#B8C0CC]">
                    {formatMonth(m.month)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>{m.sales_count}</td>
                  <td className={`${cell} text-[#E6E8EB]`}>
                    {fmtMoney(m.revenue_cents)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>
                    {fmtMoney(m.cogs_cents)}
                  </td>
                  <td className={`${cell} text-[#B8C0CC]`}>
                    {fmtMoney(gross)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>
                    {fmtMoney(m.fees_cents)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>
                    {fmtMoney(m.shipping_cost_cents)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>
                    {adj === 0 ? "—" : fmtMoney(adj)}
                  </td>
                  <td className={`${cell} ${pnlClass(m.profit_cents)}`}>
                    {fmtMoney(m.profit_cents)}
                  </td>
                  <td className={`${cell} text-[#77808C]`}>{fmtPct(margin, 0)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-[#343941]">
              <td className="px-3 py-[6px] text-left text-[12px] font-semibold text-[#E6E8EB]">
                Total
              </td>
              <td className={`${cell} font-semibold text-[#B8C0CC]`}>
                {totals.sales}
              </td>
              <td className={`${cell} font-semibold text-[#E6E8EB]`}>
                {fmtMoney(totals.revenue)}
              </td>
              <td className={`${cell} text-[#77808C]`}>
                {fmtMoney(totals.cogs)}
              </td>
              <td className={`${cell} font-semibold text-[#B8C0CC]`}>
                {fmtMoney(totals.revenue - totals.cogs)}
              </td>
              <td className={`${cell} text-[#77808C]`}>
                {fmtMoney(totals.fees)}
              </td>
              <td className={`${cell} text-[#77808C]`}>
                {fmtMoney(totals.shipping)}
              </td>
              <td className={`${cell} text-[#77808C]`}>
                {fmtMoney(
                  totals.profit -
                    (totals.revenue - totals.cogs - totals.fees - totals.shipping)
                )}
              </td>
              <td className={`${cell} font-semibold ${pnlClass(totals.profit)}`}>
                {fmtMoney(totals.profit)}
              </td>
              <td className={`${cell} text-[#77808C]`}>
                {fmtPct(
                  totals.revenue > 0
                    ? (totals.profit / totals.revenue) * 100
                    : null,
                  0
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatementCard>
  );
}

/* ── Inventory detail: aging + velocity ───────────────────────────────────── */

function InventoryDetail({
  inventory,
  velocity,
}: {
  inventory: FinancialsSummary["inventory"];
  velocity: Velocity;
}) {
  return (
    <StatementCard title="Inventory" subtitle="aging & velocity">
      {inventory.aging.map((b) => {
        const unrealized = b.estimated_value_cents - b.cost_basis_cents;
        return (
          <StatementRow
            key={b.label}
            label={`${b.label} days`}
            value={fmtMoney(b.cost_basis_cents)}
            note={
              b.count > 0
                ? `${b.count} ${b.count === 1 ? "card" : "cards"} · ${fmtMoney(
                    unrealized
                  )} unrlzd`
                : "—"
            }
            tone={b.count === 0 ? "muted" : "normal"}
          />
        );
      })}
      <StatementRow
        label="Total at cost"
        value={fmtMoney(inventory.total_cost_basis_cents)}
        tone="total"
      />
      <StatementRow
        label="Avg hold"
        value={
          velocity.avg_hold_days != null
            ? `${Math.round(velocity.avg_hold_days)}d`
            : "—"
        }
        tone="muted"
      />
      <StatementRow
        label="Avg days to sell"
        value={
          velocity.avg_days_to_sell != null
            ? `${Math.round(velocity.avg_days_to_sell)}d`
            : "—"
        }
        note="last 180d"
        tone="muted"
      />
      <StatementRow
        label="Sell-through"
        value={fmtPct(velocity.sell_through_pct, 0)}
        note={`${velocity.sold_last_90d} sold · 90d`}
        tone="muted"
      />
      <StatementRow
        label="Turn rate"
        value={
          velocity.turn_rate_annualized != null
            ? `${velocity.turn_rate_annualized.toFixed(1)}×`
            : "—"
        }
        note="annualized"
        tone="muted"
      />
    </StatementCard>
  );
}

/* ── Cash flow ────────────────────────────────────────────────────────────── */

function CashFlowStatement({ cashflow }: { cashflow: CashFlow }) {
  const recent = [...cashflow.monthly]
    .reverse()
    .filter((m) => m.cash_in_cents !== 0 || m.cash_out_cents !== 0)
    .slice(0, 6);

  return (
    <StatementCard title="Cash flow" subtitle="this month">
      <StatementRow
        label="Cash in"
        value={fmtMoney(cashflow.current_month_in_cents)}
        note="sale payouts"
      />
      <StatementRow
        label="Cash out"
        value={`(${fmtMoney(cashflow.current_month_out_cents)})`}
        note="inventory bought"
        tone="muted"
      />
      <StatementRow
        label="Net this month"
        value={fmtMoney(cashflow.current_month_net_cents)}
        tone="total"
      />
      <StatementRow
        label="Prior month"
        value={fmtMoney(cashflow.prev_month_net_cents)}
        tone="muted"
      />
      {recent.length > 0 ? (
        <div className="mt-1 border-t border-[#24282D] pt-1">
          {recent.map((m) => (
            <div
              key={m.month}
              className="flex items-baseline justify-between gap-4 py-[5px]"
            >
              <span className="text-[11px] text-[#77808C]">
                {formatMonth(m.month)}
              </span>
              <span className="flex items-baseline gap-3 font-mono-num tabular-nums text-[11px]">
                <span className="text-[#5A626D]">
                  +{fmtMoney(m.cash_in_cents)}
                </span>
                <span className="text-[#5A626D]">
                  -{fmtMoney(m.cash_out_cents)}
                </span>
                <span className={`w-16 text-right ${pnlClass(m.net_cents)}`}>
                  {fmtMoney(m.net_cents)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </StatementCard>
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
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <PositionStatement snapshot={summary.snapshot} />
              <PnlStatement
                totals={summary.totals}
                period={period}
                setPeriod={setPeriod}
              />
            </div>
            {summary.inventory.stale.count > 0 ? (
              <StaleAlertBlock stale={summary.inventory.stale} />
            ) : null}
            <MonthlyPnlTable monthly={summary.monthly} />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <InventoryDetail
                inventory={summary.inventory}
                velocity={summary.velocity}
              />
              <CashFlowStatement cashflow={summary.cashflow} />
            </div>
            <ChannelPerformancePanel rows={summary.channels_90d} />
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
