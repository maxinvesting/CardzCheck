"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtPct, fmtSigned, type PeriodKey } from "./financialsFormat";
import { createClient } from "@/lib/supabase/client";
import type { FinancialsSummary, Snapshot } from "@/lib/business/financials";

/* ── Statement primitives ─────────────────────────────────────────────────── */

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
      ? "text-[13px] font-semibold text-[#E6E8EB]"
      : tone === "muted"
        ? "text-[12px] text-[#77808C]"
        : "text-[12px] text-[#B8C0CC]";

  const valueCls =
    tone === "total"
      ? "text-[15px] font-semibold text-[#E6E8EB]"
      : tone === "pnl-pos"
        ? "text-[13px] font-medium text-[#20B26B]"
        : tone === "pnl-neg"
          ? "text-[13px] font-medium text-[#E05C5C]"
          : "text-[13px] text-[#E6E8EB]";

  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-[9px] ${
        tone === "total" ? "mt-1 border-t border-[#343941] pt-3" : ""
      }`}
    >
      <div className={`flex items-baseline gap-2 ${indent ? "pl-3" : ""}`}>
        <span className={labelCls}>{label}</span>
        {note ? <span className="text-[10px] text-[#5A626D]">{note}</span> : null}
      </div>
      <span className={`font-data tabular-nums ${valueCls}`}>{value}</span>
    </div>
  );
}

function StatementCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[#24282D] bg-[#0F1317]">
      <div className="flex items-baseline gap-2 border-b border-[#24282D] px-4 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#E6E8EB]">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[10px] text-[#77808C]">{subtitle}</span>
        ) : null}
      </div>
      <div className="px-4 py-1.5">{children}</div>
    </section>
  );
}

/* ── Hero: the two numbers you came here for ──────────────────────────────── */

function HeroFigure({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "pos" | "neg";
}) {
  const valueCls =
    tone === "pos"
      ? "text-[#20B26B]"
      : tone === "neg"
        ? "text-[#E05C5C]"
        : "text-[#E6E8EB]";
  return (
    <div className="border border-[#24282D] bg-[#0F1317] px-5 py-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-1.5 font-data text-[30px] font-semibold leading-none tabular-nums ${valueCls}`}
      >
        {value}
      </div>
      {note ? (
        <div className="mt-1.5 text-[11px] text-[#77808C]">{note}</div>
      ) : null}
    </div>
  );
}

/* ── Income statement: what the business earned this period ────────────────── */

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: "last_30d", label: "Last 30d" },
  { key: "mtd", label: "This month" },
  { key: "ytd", label: "This year" },
];

function IncomeStatement({
  totals,
  period,
}: {
  totals: FinancialsSummary["totals"];
  period: PeriodKey;
}) {
  const t = totals[period];
  const grossProfit = t.revenue_cents - t.cogs_cents;
  // `profit_cents` is stored per sale (it's what the ledger reports), so it can
  // drift from revenue − cogs − fees − shipping if a row was edited without
  // recomputing. Surface any gap as its own line so the statement always foots
  // to the same net profit the ledger shows instead of silently disagreeing.
  const adjustments =
    t.profit_cents - (grossProfit - t.fees_cents - t.shipping_cost_cents);

  return (
    <StatementCard title="Income" subtitle="realized — sold cards only">
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
    </StatementCard>
  );
}

/* ── Position: what the business is worth today ───────────────────────────── */

function PositionStatement({ snapshot }: { snapshot: Snapshot }) {
  const unrealized = snapshot.unrealized_pnl_cents;
  return (
    <StatementCard title="Position" subtitle="what you hold today">
      <StatementRow
        label="Cash on hand"
        value={fmtMoney(snapshot.cash_on_hand_cents)}
      />
      <StatementRow
        label="Inventory at cost"
        value={fmtMoney(snapshot.cost_basis_cents)}
        note={`${snapshot.active_count} ${
          snapshot.active_count === 1 ? "card" : "cards"
        }`}
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

/* ── Page ─────────────────────────────────────────────────────────────────── */

function LoadingFinancials() {
  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <div className="animate-pulse space-y-3 p-4">
        <div className="h-7 w-40 bg-[#1E2227]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-24 bg-[#1E2227]" />
          <div className="h-24 bg-[#1E2227]" />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="h-64 bg-[#1E2227]" />
          <div className="h-64 bg-[#1E2227]" />
        </div>
      </div>
    </main>
  );
}

export default function FinancialsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<FinancialsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default to MTD so the headline Revenue/Net profit match the ledger's KPI
  // strip (which leads with month-to-date) the moment the page loads.
  const [period, setPeriod] = useState<PeriodKey>("mtd");

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
    return <main className="min-h-screen bg-[#090B0D] px-4 py-4" />;
  }

  const t = summary?.totals[period];

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-normal text-[#E6E8EB]">
            Financials
          </h1>
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#77808C]">
            Synced with ledger
          </span>
        </div>
        <div className="flex items-center gap-1">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                period === p.key
                  ? "bg-[#1B2A22] text-[#20B26B]"
                  : "text-[#77808C] hover:text-[#B8C0CC]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="m-3 border border-[#723030] bg-[#2A1111] p-2 text-[12px] text-[#E05C5C]">
          {error}
        </div>
      ) : null}

      {summary && t ? (
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HeroFigure
              label="Revenue"
              value={fmtMoney(t.revenue_cents)}
              note={`${t.sales_count} ${
                t.sales_count === 1 ? "sale" : "sales"
              } · ${PERIOD_LABELS.find((p) => p.key === period)?.label}`}
            />
            <HeroFigure
              label="Net profit"
              value={fmtMoney(t.profit_cents)}
              note={
                t.margin_pct != null
                  ? `${fmtPct(t.margin_pct)} margin`
                  : undefined
              }
              tone={t.profit_cents >= 0 ? "pos" : "neg"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <IncomeStatement totals={summary.totals} period={period} />
            <PositionStatement snapshot={summary.snapshot} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
