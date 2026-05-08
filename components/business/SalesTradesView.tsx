"use client";

import { useEffect, useState, useCallback } from "react";
import type { BusinessSale } from "@/types";

interface TradeRow {
  id: string;
  partner_name: string | null;
  traded_at: string;
  cash_paid_cents: number;
  cash_received_cents: number;
  outgoing_basis_cents: number;
  incoming_basis_cents: number;
  realized_gain_cents: number;
  notes: string | null;
  items: Array<{
    direction: "in" | "out";
    collection_item_id: string;
    fair_value_cents: number | null;
    allocated_cost_basis_cents: number | null;
    title: string | null;
  }>;
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function fmt(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

function pnlClass(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

export default function SalesTradesView() {
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesRes, tradesRes] = await Promise.all([
        fetch("/api/business/sales", { cache: "no-store" }),
        fetch("/api/business/trades", { cache: "no-store" }),
      ]);
      if (salesRes.ok) {
        const data = await salesRes.json();
        setSales(Array.isArray(data?.sales) ? data.sales : data?.items ?? []);
      }
      if (tradesRes.ok) {
        const data = await tradesRes.json();
        setTrades(Array.isArray(data?.trades) ? data.trades : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sales/trades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-[#E6E8EB]">Sales</h2>
          <span className="text-[11px] uppercase tracking-wider text-[#77808C]">
            {sales.length} record{sales.length === 1 ? "" : "s"}
          </span>
        </header>
        <div className="overflow-x-auto border border-[#24282D] bg-[#0B0D0F]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#24282D] bg-[#0F1317]">
              <tr className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
                <th className="px-3 py-2 font-medium">Sold</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">Fees</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
                <th className="px-3 py-2 text-right font-medium">COGS</th>
                <th className="px-3 py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#24282D]">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-[#77808C]">
                    Loading sales…
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-center text-[#77808C]">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
              {!loading &&
                sales.map((sale) => {
                  const fees =
                    (sale.platform_fees_cents ?? 0) +
                    (sale.shipping_cost_cents ?? 0) +
                    (sale.tax_cents ?? 0);
                  return (
                    <tr key={sale.id} className="hover:bg-[#11161B]">
                      <td className="px-3 py-2 text-[#B8C0CC]">
                        {sale.sold_at ? new Date(sale.sold_at).toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-3 py-2 text-[#E6E8EB]">
                        {sale.inventory_item?.title?.trim() || "Unlinked sale"}
                      </td>
                      <td className="px-3 py-2 text-[#B8C0CC]">{sale.channel}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                        {fmt(sale.gross_revenue_cents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B8C0CC]">{fmt(fees)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                        {fmt(sale.net_payout_cents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B8C0CC]">
                        {fmt(sale.cogs_cents)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${pnlClass(sale.profit_cents ?? 0)}`}>
                        {fmt(sale.profit_cents)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-[#E6E8EB]">Trades</h2>
          <span className="text-[11px] uppercase tracking-wider text-[#77808C]">
            {trades.length} record{trades.length === 1 ? "" : "s"}
          </span>
        </header>
        <div className="overflow-x-auto border border-[#24282D] bg-[#0B0D0F]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#24282D] bg-[#0F1317]">
              <tr className="text-[10px] uppercase tracking-[0.08em] text-[#77808C]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Partner</th>
                <th className="px-3 py-2 font-medium">Cards out</th>
                <th className="px-3 py-2 font-medium">Cards in</th>
                <th className="px-3 py-2 text-right font-medium">Cash paid</th>
                <th className="px-3 py-2 text-right font-medium">Cash received</th>
                <th className="px-3 py-2 text-right font-medium">Realized gain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#24282D]">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-[#77808C]">
                    Loading trades…
                  </td>
                </tr>
              )}
              {!loading && trades.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-[#77808C]">
                    No trades recorded yet.
                  </td>
                </tr>
              )}
              {!loading &&
                trades.map((trade) => {
                  const out = trade.items.filter((i) => i.direction === "out");
                  const inn = trade.items.filter((i) => i.direction === "in");
                  return (
                    <tr key={trade.id} className="align-top hover:bg-[#11161B]">
                      <td className="px-3 py-2 text-[#B8C0CC]">
                        {new Date(trade.traded_at).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-3 py-2 text-[#E6E8EB]">
                        {trade.partner_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-[#B8C0CC]">
                        <ul className="space-y-0.5">
                          {out.map((it, idx) => (
                            <li key={`${trade.id}-out-${idx}`} className="truncate">
                              {it.title || "(card)"}
                              {it.fair_value_cents != null && (
                                <span className="ml-1 text-[10px] text-[#77808C]">
                                  {fmt(it.fair_value_cents)}
                                </span>
                              )}
                            </li>
                          ))}
                          {out.length === 0 && <li className="text-[#77808C]">—</li>}
                        </ul>
                      </td>
                      <td className="px-3 py-2 text-[#B8C0CC]">
                        <ul className="space-y-0.5">
                          {inn.map((it, idx) => (
                            <li key={`${trade.id}-in-${idx}`} className="truncate">
                              {it.title || "(card)"}
                              {it.fair_value_cents != null && (
                                <span className="ml-1 text-[10px] text-[#77808C]">
                                  {fmt(it.fair_value_cents)}
                                </span>
                              )}
                            </li>
                          ))}
                          {inn.length === 0 && <li className="text-[#77808C]">—</li>}
                        </ul>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B8C0CC]">
                        {fmt(trade.cash_paid_cents)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#B8C0CC]">
                        {fmt(trade.cash_received_cents)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${pnlClass(trade.realized_gain_cents)}`}>
                        {fmt(trade.realized_gain_cents)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
          {error}
        </div>
      )}
    </div>
  );
}
