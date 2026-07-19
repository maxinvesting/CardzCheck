"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  fmtMoney,
  fmtPct,
  fmtSigned,
  pnlClass,
  type PeriodKey,
} from "./financialsFormat";
import { createClient } from "@/lib/supabase/client";
import type {
  CardPerformance,
  ChannelBreakdown,
  FinancialsSummary,
  Snapshot,
  StaleAlert,
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
