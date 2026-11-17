"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BusinessInventoryItem } from "@/types";
import type { ConsignmentOrder } from "@/lib/business/consignment";
import type { ConsignmentOrderDraft } from "@/components/business/ConsignmentOrderModal";

const ConsignmentOrderModal = dynamic(
  () => import("@/components/business/ConsignmentOrderModal"),
  { ssr: false }
);

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmt = (cents: number) => MONEY.format(cents / 100);
const fmtSigned = (cents: number) => `${cents < 0 ? "-" : cents > 0 ? "+" : ""}${fmt(Math.abs(cents))}`;
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function pnlClass(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function fmtIsoDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function orderTotals(order: ConsignmentOrder) {
  let paid = 0;
  let sold = 0;
  let net = 0;
  for (const i of order.items) {
    paid += i.cost_cents;
    sold += i.sold_price_cents ?? 0;
    net += i.payout_cents ?? 0;
  }
  return { paid, sold, fees: order.fees_total_cents ?? 0, net, profit: net - paid };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export default function ConsignmentPage() {
  const [orders, setOrders] = useState<ConsignmentOrder[]>([]);
  const [inventory, setInventory] = useState<BusinessInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, inv] = await Promise.all([
        api<{ orders: ConsignmentOrder[] }>("/api/business/consignment"),
        api<{ items: BusinessInventoryItem[] }>("/api/business/inventory"),
      ]);
      setOrders(o.orders ?? []);
      setInventory(Array.isArray(inv.items) ? inv.items : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    let cards = 0;
    let paid = 0;
    let sold = 0;
    let fees = 0;
    let net = 0;
    for (const o of orders) {
      const t = orderTotals(o);
      cards += o.items.length;
      paid += t.paid;
      sold += t.sold;
      fees += t.fees;
      net += t.net;
    }
    const profit = net - paid;
    return {
      cards,
      paid,
      sold,
      fees,
      profit,
      perCard: cards > 0 ? Math.round(profit / cards) : null,
      recovery: paid > 0 ? net / paid : null,
    };
  }, [orders]);

  const handleSubmit = async (draft: ConsignmentOrderDraft) => {
    const { order } = await api<{ order: ConsignmentOrder }>("/api/business/consignment", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    const t = orderTotals(order);
    setNotice(
      `Recorded ${order.items.length} sale${order.items.length === 1 ? "" : "s"} from ${order.consignor}: ${fmtSigned(t.profit)}. They're in Sales & Trades under the Consignment channel.`
    );
    setExpanded((prev) => new Set(prev).add(order.id));
    await load();
  };

  const deleteOrder = async (order: ConsignmentOrder) => {
    if (
      !window.confirm(
        `Delete the ${order.consignor} order? Its ${order.items.length} sale(s) are removed from Sales & Trades, picked inventory cards go back to unsold, and cards typed by hand are removed.`
      )
    )
      return;
    try {
      await api(`/api/business/consignment/${order.id}`, { method: "DELETE" });
      setNotice("Order deleted and its sales removed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      // Re-sync so the list never shows an order the server no longer has.
      await load();
      return;
    }
  };

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <header className="flex items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">Inventory</div>
          <h1 className="text-lg font-semibold">Consignment</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden text-[11px] text-[#77808C] md:block">
            Cards that miss your grading cut. Each order&apos;s cards are recorded as sales.
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[13px] font-semibold text-[#07100B] hover:bg-[#33C47C]"
          >
            New order
          </button>
        </div>
      </header>

      {notice ? (
        <div className="mx-4 mb-3 flex items-center justify-between border border-[#1F5F45] bg-[#0E251B] px-3 py-2 text-xs text-[#20B26B]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="px-1">
            x
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto border-y border-[#24282D] bg-[#0B0D0F]">
        <div className="grid min-w-[820px] grid-cols-5 divide-x divide-[#24282D]">
          <SummaryCell
            label="Cards consigned"
            value={loading ? "—" : String(stats.cards)}
            sub={orders.length > 0 ? `${orders.length} order${orders.length === 1 ? "" : "s"}` : undefined}
          />
          <SummaryCell
            label="Paid → sold"
            value={loading || stats.cards === 0 ? "—" : `${fmt(stats.paid)} → ${fmt(stats.sold)}`}
            sub={stats.fees > 0 ? `${fmt(stats.fees)} consignor fees` : undefined}
          />
          <SummaryCell
            label="Total profit / loss"
            value={loading || stats.cards === 0 ? "—" : fmtSigned(stats.profit)}
            valueClass={stats.cards ? pnlClass(stats.profit) : undefined}
          />
          <SummaryCell
            label="Avg per card"
            value={stats.perCard == null ? "—" : fmtSigned(stats.perCard)}
            valueClass={stats.perCard != null ? pnlClass(stats.perCard) : undefined}
          />
          <SummaryCell
            label="Avg recovery"
            value={pct(stats.recovery)}
            sub={stats.recovery != null ? "of what you paid, after fees" : undefined}
          />
        </div>
      </div>

      <section className="space-y-3 p-4">
        {error ? (
          <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">{error}</div>
        ) : null}
        {loading ? (
          <div className="h-[240px] animate-pulse border border-[#24282D] bg-[#0B0D0F]" />
        ) : orders.length === 0 ? (
          <div className="border border-[#24282D] bg-[#0B0D0F] px-4 py-10 text-center text-sm text-[#77808C]">
            No consignment orders yet. When one finishes, use New order to enter what you paid and what each
            card sold for.
          </div>
        ) : (
          orders.map((order) => {
            const t = orderTotals(order);
            const isExpanded = expanded.has(order.id);
            return (
              <div key={order.id} className="border border-[#24282D] bg-[#0B0D0F]">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(order.id)) next.delete(order.id);
                      else next.add(order.id);
                      return next;
                    })
                  }
                  className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-left hover:bg-[#111315]"
                >
                  <span className="w-3 text-[11px] text-[#77808C]">{isExpanded ? "▾" : "▸"}</span>
                  <span className="min-w-[180px] flex-1">
                    <span className="font-semibold">{order.consignor}</span>
                    {order.reference ? <span className="text-[#77808C]"> · #{order.reference}</span> : null}
                    <span className="block text-[11px] text-[#77808C]">
                      Sold {fmtIsoDate(order.settled_date)}
                      {order.sent_date && order.sent_date !== order.settled_date
                        ? ` · sent ${fmtIsoDate(order.sent_date)}`
                        : ""}
                    </span>
                  </span>
                  <Stat label="Cards" value={String(order.items.length)} />
                  <Stat label="Paid" value={fmt(t.paid)} />
                  <Stat label="Sold" value={fmt(t.sold)} />
                  <Stat label="Fees" value={fmt(t.fees)} />
                  <Stat label="P/L" value={fmtSigned(t.profit)} valueClass={pnlClass(t.profit)} />
                </button>

                {isExpanded && (
                  <div className="border-t border-[#24282D]">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-[13px]">
                        <thead>
                          <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                            <th className="px-4 py-2">Card</th>
                            <th className="px-3 py-2 text-right">Paid</th>
                            <th className="px-3 py-2 text-right">Sold</th>
                            <th className="px-3 py-2 text-right">Fee share</th>
                            <th className="px-3 py-2 text-right">Net</th>
                            <th className="px-3 py-2 text-right">P/L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E2227]">
                          {order.items.map((item) => {
                            const pnl = (item.payout_cents ?? 0) - item.cost_cents;
                            return (
                              <tr key={item.id}>
                                <td className="px-4 py-2">
                                  <div>{item.title}</div>
                                  <div className="text-[11px] text-[#77808C]">
                                    {[
                                      item.card_number ? `#${item.card_number}` : null,
                                      item.created_inventory ? "typed by hand" : "from inventory",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-data tabular-nums">{fmt(item.cost_cents)}</td>
                                <td className="px-3 py-2 text-right font-data tabular-nums">
                                  {fmt(item.sold_price_cents ?? 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-data tabular-nums text-[#77808C]">
                                  {fmt(item.fee_cents ?? 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-data tabular-nums">
                                  {fmt(item.payout_cents ?? 0)}
                                </td>
                                <td className={`px-3 py-2 text-right font-data tabular-nums ${pnlClass(pnl)}`}>
                                  {fmtSigned(pnl)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#24282D] px-4 py-3 text-[12px] text-[#77808C]">
                      <span>
                        {order.notes ? `${order.notes} · ` : ""}
                        Fees split evenly across {order.items.length} card{order.items.length === 1 ? "" : "s"}.
                        Recorded as sales on the Consignment channel.
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteOrder(order)}
                        className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#77808C] hover:text-[#E05C5C]"
                      >
                        Delete order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <ConsignmentOrderModal
        isOpen={showModal}
        inventory={inventory}
        onClose={() => setShowModal(false)}
        onSubmit={handleSubmit}
      />
    </main>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="min-w-[80px] text-right">
      <span className="block text-[10px] uppercase tracking-[0.08em] text-[#77808C]">{label}</span>
      <span className={`font-data text-[13px] tabular-nums ${valueClass ?? "text-[#E6E8EB]"}`}>{value}</span>
    </span>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">{label}</div>
      <div className={`mt-0.5 font-data text-[13px] font-semibold tabular-nums ${valueClass ?? "text-[#E6E8EB]"}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-[#77808C]">{sub}</div> : null}
    </div>
  );
}
