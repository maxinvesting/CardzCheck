"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SalesTable, { type SalesFilters } from "@/components/business/SalesTable";
import TradesTable, { type BusinessTrade } from "@/components/business/TradesTable";
import { createClient } from "@/lib/supabase/client";
import type { BusinessSale } from "@/types";
import { formatMoney } from "@/lib/business/sales-utils";
import {
  recognizableFromBusinessTrade,
  tradeRecognition,
  tradeDeferredGain,
} from "@/lib/business/trade-recognition";

const PAGE_SIZE = 25;

type MiscProfitEntry = {
  id: string;
  occurred_at: string;
  amount_cents: number;
  label: string | null;
  created_at: string;
};

function defaultFilters(): SalesFilters {
  const now = new Date();
  const from = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    channel: "",
    search: "",
  };
}

export default function BusinessSalesHistoryPage() {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [trades, setTrades] = useState<BusinessTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [filters, setFilters] = useState<SalesFilters>(defaultFilters);
  const [miscEntries, setMiscEntries] = useState<MiscProfitEntry[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: filters.from,
        to: filters.to,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await fetch(`/api/business/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      if (res.status === 403) {
        setHasAccess(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load sales");
      const data = await res.json();
      setHasAccess(true);
      setSales(data.sales ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load sales",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, page, router]);

  const loadTrades = useCallback(async () => {
    setTradesLoading(true);
    try {
      const res = await fetch("/api/business/trades", { cache: "no-store" });
      if (!res.ok) {
        // Trades are best-effort here; surface nothing if the ledger isn't migrated.
        setTrades([]);
        return;
      }
      const data = await res.json();
      setTrades((data.trades ?? []) as BusinessTrade[]);
    } catch {
      setTrades([]);
    } finally {
      setTradesLoading(false);
    }
  }, []);

  const loadMisc = useCallback(async () => {
    try {
      const res = await fetch("/api/business/misc-profit", { cache: "no-store" });
      if (!res.ok) {
        setMiscEntries([]);
        return;
      }
      const data = await res.json();
      setMiscEntries((data.entries ?? []) as MiscProfitEntry[]);
    } catch {
      setMiscEntries([]);
    }
  }, []);

  const handleAddMisc = useCallback(
    async (input: { amount: number; occurred_at: string; label: string }) => {
      try {
        const res = await fetch("/api/business/misc-profit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: input.amount,
            occurred_at: input.occurred_at,
            label: input.label.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to add entry");
        }
        setToast({ type: "success", message: "Added to profit" });
        await loadMisc();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to add entry",
        });
      }
    },
    [loadMisc]
  );

  const handleDeleteMisc = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/business/misc-profit?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to remove entry");
        }
        setToast({ type: "success", message: "Entry removed" });
        await loadMisc();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to remove entry",
        });
      }
    },
    [loadMisc]
  );

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      void loadSales();
      void loadTrades();
      void loadMisc();
    }
    void init();
  }, [router, loadSales, loadTrades, loadMisc]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleEditSale = useCallback(
    async (saleId: string, updates: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/business/sales/${saleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update sale");
        }
        setToast({ type: "success", message: "Sale updated" });
        await loadSales();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to update sale",
        });
      }
    },
    [loadSales]
  );

  const handleDeleteSale = useCallback(
    async (saleId: string) => {
      try {
        const res = await fetch(`/api/business/sales/${saleId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete sale");
        }
        setToast({ type: "success", message: "Sale deleted" });
        await loadSales();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to delete sale",
        });
      }
    },
    [loadSales]
  );

  const handleDeleteTrade = useCallback(
    async (tradeId: string) => {
      try {
        const res = await fetch(`/api/business/trades/${tradeId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to undo trade");
        }
        setToast({ type: "success", message: "Trade undone" });
        await loadTrades();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to undo trade",
        });
      }
    },
    [loadTrades]
  );

  // Trades come back unpaginated; filter them client-side to match the
  // date range + search the user has applied to sales. A channel filter
  // other than "all" hides trades (they have no sales channel).
  const filteredTrades = useMemo(() => {
    if (filters.channel) return [];
    const fromMs = filters.from ? Date.parse(`${filters.from}T00:00:00.000Z`) : null;
    const toMs = filters.to ? Date.parse(`${filters.to}T23:59:59.999Z`) : null;
    const q = filters.search.trim().toLowerCase();
    return trades.filter((trade) => {
      const tradedMs = Date.parse(trade.traded_at);
      if (fromMs !== null && tradedMs < fromMs) return false;
      if (toMs !== null && tradedMs > toMs) return false;
      if (q) {
        const haystack = [
          trade.partner_name ?? "",
          trade.notes ?? "",
          ...trade.items.map((it) => it.title ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [trades, filters]);

  // Split the trade gains the same way the Financials P&L does: `recognized`
  // is what hits P&L now (cash that can't be deferred); `deferred` rolls into
  // received-card basis and realizes when those cards sell. Summing the raw
  // `realized_gain_cents` here previously double-counted deferred appreciation
  // and disagreed with the P&L — every dollar was labeled "realized" when the
  // app actually defers card-for-card gains.
  const { tradesRecognized, tradesDeferred } = useMemo(() => {
    let recognized = 0;
    let deferred = 0;
    for (const t of filteredTrades) {
      const rec = recognizableFromBusinessTrade(t);
      recognized += tradeRecognition(rec)?.profit_cents ?? 0;
      deferred += tradeDeferredGain(rec);
    }
    return { tradesRecognized: recognized, tradesDeferred: deferred };
  }, [filteredTrades]);

  const summary = useMemo(() => {
    let gross = 0;
    let net = 0;
    let profit = 0;
    for (const s of sales) {
      gross += s.gross_revenue_cents;
      net += s.net_payout_cents;
      profit += s.profit_cents;
    }
    return { gross, net, profit };
  }, [sales]);

  // Consignment / misc. profit that falls in the active date range. Like trades,
  // it has no channel, so a specific channel filter excludes it from the total.
  const { filteredMisc, miscTotal } = useMemo(() => {
    if (filters.channel) return { filteredMisc: [], miscTotal: 0 };
    const from = filters.from || null;
    const to = filters.to || null;
    const inRange = miscEntries.filter((m) => {
      const d = m.occurred_at.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    return {
      filteredMisc: inRange,
      miscTotal: inRange.reduce((acc, m) => acc + m.amount_cents, 0),
    };
  }, [miscEntries, filters]);

  const totalProfit = summary.profit + tradesRecognized + miscTotal;
  const profitNoteParts = [
    tradesRecognized !== 0 ? `${formatMoney(tradesRecognized)} trade cash` : null,
    miscTotal !== 0 ? `${formatMoney(miscTotal)} misc` : null,
  ].filter(Boolean);

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
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                Inventory
              </div>
              <h1 className="mt-0.5 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
                Sales &amp; Trades
              </h1>
            </div>
            <a
              href="/api/business/export?type=sales"
              className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Export
            </a>
          </header>

          <div className="grid grid-cols-1 gap-px border-b border-[#24282D] bg-[#24282D] sm:grid-cols-4">
            <SummaryCell label="Sales in range" value={String(total)} />
            <SummaryCell label="Gross revenue" value={formatMoney(summary.gross)} />
            <SummaryCell label="Net payout" value={formatMoney(summary.net)} />
            <SummaryCell
              label="Profit"
              value={formatMoney(totalProfit)}
              tone={totalProfit >= 0 ? "positive" : "negative"}
              note={
                profitNoteParts.length > 0
                  ? `incl. ${profitNoteParts.join(" + ")}`
                  : undefined
              }
            />
          </div>

          <section className="min-w-0 flex-1 px-4 py-4">
            <SalesTable
              sales={sales}
              loading={loading}
              filters={filters}
              onFiltersChange={(next) => {
                setFilters(next);
                setPage(1);
              }}
              onEditSale={handleEditSale}
              onDeleteSale={handleDeleteSale}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />

            {(tradesLoading || filteredTrades.length > 0) && (
              <div className="mt-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#77808C]">
                    Trades{!tradesLoading ? ` (${filteredTrades.length})` : ""}
                  </h2>
                  {!tradesLoading && filteredTrades.length > 0 && (
                    <span className="flex items-baseline gap-3 text-[11px] text-[#77808C]">
                      <span>
                        Realized{" "}
                        <span
                          className={
                            tradesRecognized >= 0
                              ? "ledger-pnl-pos"
                              : "ledger-pnl-neg"
                          }
                        >
                          {formatMoney(tradesRecognized)}
                        </span>
                      </span>
                      <span title="Trade gains rolled into received-card basis — realizes as profit when those cards sell.">
                        Deferred{" "}
                        <span
                          className={
                            tradesDeferred >= 0
                              ? "ledger-pnl-pos"
                              : "ledger-pnl-neg"
                          }
                        >
                          {formatMoney(tradesDeferred)}
                        </span>
                      </span>
                    </span>
                  )}
                </div>
                <TradesTable
                  trades={filteredTrades}
                  loading={tradesLoading}
                  onDeleteTrade={handleDeleteTrade}
                />
              </div>
            )}

            <MiscProfitSection
              entries={filteredMisc}
              total={miscTotal}
              disabledReason={filters.channel ? "Clear the channel filter to add" : null}
              onAdd={handleAddMisc}
              onDelete={handleDeleteMisc}
            />
          </section>
        </div>
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 rounded border px-4 py-2 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-700 bg-emerald-900/90 text-emerald-50"
                : "border-red-700 bg-red-900/90 text-red-50"
            }`}
          >
            {toast.message}
          </div>
        )}
      </main>
    </>
  );
}

function SummaryCell({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  note?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "ledger-pnl-pos"
      : tone === "negative"
      ? "ledger-pnl-neg"
      : "text-[#E6E8EB]";
  return (
    <div className="bg-[#090B0D] px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
        {label}
      </div>
      <div className={`mt-0.5 text-[18px] font-semibold tracking-normal ${valueClass}`}>
        {value}
      </div>
      {note ? (
        <div className="mt-0.5 text-[10px] text-[#77808C]">{note}</div>
      ) : null}
    </div>
  );
}

function MiscProfitSection({
  entries,
  total,
  disabledReason,
  onAdd,
  onDelete,
}: {
  entries: MiscProfitEntry[];
  total: number;
  disabledReason: string | null;
  onAdd: (input: { amount: number; occurred_at: string; label: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const inputCls =
    "border border-[#24282D] bg-[#090B0D] px-2.5 py-1.5 text-[13px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#20B26B] focus:outline-none";

  const submit = async () => {
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed === 0) return;
    setSaving(true);
    try {
      await onAdd({ amount: parsed, occurred_at: date, label });
      setAmount("");
      setLabel("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 border border-[#24282D] bg-[color:var(--biz-surface)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#24282D] px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold text-[#E6E8EB]">
            Consignment / Misc. Profit
          </h2>
          <p className="text-[11px] text-[#77808C]">
            Profit outside of sales &amp; trades — adds to your total.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            In range
          </div>
          <div
            className={`font-data text-[16px] font-semibold tabular-nums ${
              total >= 0 ? "ledger-pnl-pos" : "ledger-pnl-neg"
            }`}
          >
            {formatMoney(total)}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {disabledReason ? (
          <p className="mb-3 text-[12px] text-[#77808C]">{disabledReason}.</p>
        ) : (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
              Amount ($)
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="0.00"
                className={`${inputCls} mt-1 w-28`}
              />
            </label>
            <label className="flex flex-col text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputCls} mt-1`}
              />
            </label>
            <label className="flex flex-1 flex-col text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
              Note
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="e.g. consignment payout, show cash, refund"
                className={`${inputCls} mt-1 w-full min-w-40`}
              />
            </label>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !amount.trim()}
              className="border border-[#20B26B] bg-[#20B26B] px-4 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-[12px] text-[#5A626E]">
            No entries in this range yet.
          </p>
        ) : (
          <div className="divide-y divide-[#191D21]">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="font-data tabular-nums text-[#77808C]">
                    {e.occurred_at.slice(0, 10)}
                  </span>
                  <span className="truncate text-[#B8C0CC]">
                    {e.label || "Misc. profit"}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-data tabular-nums font-semibold ${
                      e.amount_cents >= 0 ? "ledger-pnl-pos" : "ledger-pnl-neg"
                    }`}
                  >
                    {formatMoney(e.amount_cents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Remove this entry?")) void onDelete(e.id);
                    }}
                    className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#77808C] transition-colors hover:text-[#E05C5C]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
