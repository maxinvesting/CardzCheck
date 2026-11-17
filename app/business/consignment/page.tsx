"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BusinessInventoryItem } from "@/types";
import type { ConsignmentOrder } from "@/lib/business/consignment";
import {
  allocateConsignmentPayout,
  type ConsignmentSplitMethod,
} from "@/lib/business/consignment-allocation";
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

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function orderCost(order: ConsignmentOrder): number {
  return order.items.reduce((sum, i) => sum + i.cost_cents, 0);
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
  const [modal, setModal] = useState<{ addingTo: ConsignmentOrder | null } | null>(null);

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

  const replaceOrder = (order: ConsignmentOrder) =>
    setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));

  const takenIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.status !== "open") continue;
      for (const i of o.items) if (i.inventory_item_id) set.add(i.inventory_item_id);
    }
    return set;
  }, [orders]);

  const stats = useMemo(() => {
    const open = orders.filter((o) => o.status === "open");
    const settled = orders.filter((o) => o.status === "settled");
    const openCards = open.reduce((s, o) => s + o.items.length, 0);
    const openCost = open.reduce((s, o) => s + orderCost(o), 0);
    const settledCards = settled.reduce((s, o) => s + o.items.length, 0);
    const settledCost = settled.reduce((s, o) => s + orderCost(o), 0);
    const settledPayout = settled.reduce((s, o) => s + (o.payout_total_cents ?? 0), 0);
    const profit = settledPayout - settledCost;
    return {
      openOrders: open.length,
      openCards,
      openCost,
      settledOrders: settled.length,
      settledCards,
      settledCost,
      settledPayout,
      profit,
      perCard: settledCards > 0 ? Math.round(profit / settledCards) : null,
      recovery: settledCost > 0 ? settledPayout / settledCost : null,
    };
  }, [orders]);

  const handleModalSubmit = async (draft: ConsignmentOrderDraft) => {
    const target = modal?.addingTo;
    if (target) {
      const { order } = await api<{ order: ConsignmentOrder }>(`/api/business/consignment/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          add_inventory_item_ids: draft.inventory_item_ids,
          add_manual_items: draft.manual_items,
        }),
      });
      replaceOrder(order);
    } else {
      const { order } = await api<{ order: ConsignmentOrder }>("/api/business/consignment", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          reference: draft.reference || null,
          notes: draft.notes || null,
        }),
      });
      setOrders((prev) => [order, ...prev]);
      setExpanded((prev) => new Set(prev).add(order.id));
      setNotice(`Order created with ${order.items.length} card${order.items.length === 1 ? "" : "s"}.`);
    }
    // Inventory statuses changed (cards → Pending).
    void api<{ items: BusinessInventoryItem[] }>("/api/business/inventory").then((inv) =>
      setInventory(Array.isArray(inv.items) ? inv.items : [])
    );
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
            Cards that miss your grading cut. Payout splits so each card takes an equal share of the loss.
          </div>
          <button
            type="button"
            onClick={() => setModal({ addingTo: null })}
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
            label="Out on consignment"
            value={loading ? "—" : `${stats.openCards} card${stats.openCards === 1 ? "" : "s"}`}
            sub={stats.openOrders > 0 ? `${stats.openOrders} open · ${fmt(stats.openCost)} cost` : undefined}
          />
          <SummaryCell
            label="Settled"
            value={loading ? "—" : `${stats.settledCards} card${stats.settledCards === 1 ? "" : "s"}`}
            sub={stats.settledOrders > 0 ? `${fmt(stats.settledCost)} cost → ${fmt(stats.settledPayout)} paid` : undefined}
          />
          <SummaryCell
            label="Total profit / loss"
            value={loading || stats.settledOrders === 0 ? "—" : fmtSigned(stats.profit)}
            valueClass={stats.settledOrders ? pnlClass(stats.profit) : undefined}
          />
          <SummaryCell
            label="Avg per card"
            value={stats.perCard == null ? "—" : fmtSigned(stats.perCard)}
            valueClass={stats.perCard != null ? pnlClass(stats.perCard) : undefined}
          />
          <SummaryCell
            label="Avg recovery"
            value={pct(stats.recovery)}
            sub={stats.recovery != null ? "of cost paid back" : undefined}
          />
        </div>
      </div>

      <section className="space-y-3 p-4">
        {error ? (
          <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">{error}</div>
        ) : loading ? (
          <div className="h-[240px] animate-pulse border border-[#24282D] bg-[#0B0D0F]" />
        ) : orders.length === 0 ? (
          <div className="border border-[#24282D] bg-[#0B0D0F] px-4 py-10 text-center text-sm text-[#77808C]">
            No consignment orders yet. Use New order to pick cards from inventory or add them by hand.
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expanded.has(order.id)}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(order.id)) next.delete(order.id);
                  else next.add(order.id);
                  return next;
                })
              }
              onChanged={(updated, message) => {
                replaceOrder(updated);
                if (message) setNotice(message);
                void load();
              }}
              onDeleted={() => {
                setOrders((prev) => prev.filter((o) => o.id !== order.id));
                setNotice("Order deleted. Inventory cards are back to their previous status.");
                void load();
              }}
              onAddCards={() => setModal({ addingTo: order })}
            />
          ))
        )}
      </section>

      <ConsignmentOrderModal
        isOpen={modal != null}
        addingTo={modal?.addingTo ? { consignor: modal.addingTo.consignor } : null}
        inventory={inventory}
        takenIds={takenIds}
        onClose={() => setModal(null)}
        onSubmit={handleModalSubmit}
      />
    </main>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
  onChanged,
  onDeleted,
  onAddCards,
}: {
  order: ConsignmentOrder;
  expanded: boolean;
  onToggle: () => void;
  onChanged: (order: ConsignmentOrder, message?: string) => void;
  onDeleted: () => void;
  onAddCards: () => void;
}) {
  const isOpen = order.status === "open";
  const [payout, setPayout] = useState("");
  const [settledDate, setSettledDate] = useState(today);
  const [method, setMethod] = useState<ConsignmentSplitMethod>(order.split_method ?? "equal_loss");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = orderCost(order);
  const payoutCents = isOpen
    ? (() => {
        const n = Number.parseFloat(payout.replace(/[$,]/g, ""));
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
      })()
    : order.payout_total_cents;

  const allocation = useMemo(() => {
    if (!isOpen) return order.items.map((i) => i.payout_cents);
    if (payoutCents == null) return order.items.map(() => null);
    return allocateConsignmentPayout(order.items.map((i) => i.cost_cents), payoutCents, method);
  }, [isOpen, order.items, payoutCents, method]);

  const profit = payoutCents != null ? payoutCents - cost : null;
  const perCardLoss = profit != null && order.items.length > 0 ? Math.round(profit / order.items.length) : null;
  const negativePayout = allocation.some((p) => p != null && p < 0);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const settle = () =>
    run(async () => {
      if (payoutCents == null) throw new Error("Enter the net payout you received");
      const { order: updated } = await api<{ order: ConsignmentOrder }>(
        `/api/business/consignment/${order.id}/settle`,
        {
          method: "POST",
          body: JSON.stringify({ payout_total_cents: payoutCents, settled_date: settledDate, split_method: method }),
        }
      );
      const sales = updated.items.filter((i) => i.sale_id).length;
      onChanged(
        updated,
        `Settled ${order.consignor}: ${fmtSigned(payoutCents - cost)}. ${sales} inventory card${sales === 1 ? "" : "s"} recorded as sold.`
      );
    });

  const reopen = () =>
    run(async () => {
      if (!window.confirm("Reopen this order? Its sales are deleted and the cards go back to Pending.")) return;
      const { order: updated } = await api<{ order: ConsignmentOrder }>(
        `/api/business/consignment/${order.id}/reopen`,
        { method: "POST" }
      );
      setPayout(updated.payout_total_cents != null ? String(updated.payout_total_cents / 100) : "");
      onChanged(updated, "Order reopened.");
    });

  const removeItem = (itemId: string) =>
    run(async () => {
      const { order: updated } = await api<{ order: ConsignmentOrder }>(`/api/business/consignment/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remove_item_ids: [itemId] }),
      });
      onChanged(updated);
    });

  const deleteOrder = () =>
    run(async () => {
      if (!window.confirm(`Delete the ${order.consignor} order? Inventory cards go back to their previous status.`)) return;
      await api(`/api/business/consignment/${order.id}`, { method: "DELETE" });
      onDeleted();
    });

  return (
    <div className="border border-[#24282D] bg-[#0B0D0F]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-left hover:bg-[#111315]"
      >
        <span className="w-3 text-[11px] text-[#77808C]">{expanded ? "▾" : "▸"}</span>
        <span className="min-w-[180px] flex-1">
          <span className="font-semibold">{order.consignor}</span>
          {order.reference ? <span className="text-[#77808C]"> · #{order.reference}</span> : null}
          <span className="block text-[11px] text-[#77808C]">
            Sent {fmtIsoDate(order.sent_date)}
            {order.settled_date ? ` · Paid ${fmtIsoDate(order.settled_date)}` : ""}
          </span>
        </span>
        <span
          className={`border px-2 py-0.5 text-[11px] font-medium ${
            isOpen ? "border-amber-700/60 text-amber-400" : "border-[#1F5F45] text-[#20B26B]"
          }`}
        >
          {isOpen ? "Out" : "Settled"}
        </span>
        <Stat label="Cards" value={String(order.items.length)} />
        <Stat label="Cost" value={fmt(cost)} />
        <Stat label="Payout" value={order.payout_total_cents != null ? fmt(order.payout_total_cents) : "—"} />
        <Stat
          label="P/L"
          value={order.payout_total_cents != null ? fmtSigned(order.payout_total_cents - cost) : "—"}
          valueClass={order.payout_total_cents != null ? pnlClass(order.payout_total_cents - cost) : undefined}
        />
      </button>

      {expanded && (
        <div className="border-t border-[#24282D]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                  <th className="px-4 py-2">Card</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">{isOpen ? "Payout share" : "Payout"}</th>
                  <th className="px-3 py-2 text-right">P/L</th>
                  {isOpen && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2227]">
                {order.items.map((item, idx) => {
                  const share = allocation[idx];
                  const itemPnl = share != null ? share - item.cost_cents : null;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <div>{item.title}</div>
                        {item.card_number || item.quantity > 1 ? (
                          <div className="text-[11px] text-[#77808C]">
                            {[item.card_number ? `#${item.card_number}` : null, item.quantity > 1 ? `qty ${item.quantity}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[#77808C]">
                        {item.inventory_item_id ? (item.sale_id ? "Inventory · sold" : "Inventory") : "By hand"}
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums">{fmt(item.cost_cents)}</td>
                      <td className={`px-3 py-2 text-right font-data tabular-nums ${share != null && share < 0 ? "text-[#E05C5C]" : ""}`}>
                        {share != null ? fmt(share) : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-data tabular-nums ${itemPnl != null ? pnlClass(itemPnl) : "text-[#4F5863]"}`}>
                        {itemPnl != null ? fmtSigned(itemPnl) : "—"}
                      </td>
                      {isOpen && (
                        <td className="text-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeItem(item.id)}
                            className="px-2 text-[#5A626E] hover:text-[#E05C5C]"
                            aria-label={`Remove ${item.title}`}
                          >
                            x
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {order.notes ? (
            <div className="border-t border-[#1E2227] px-4 py-2 text-[12px] text-[#77808C]">{order.notes}</div>
          ) : null}

          <div className="border-t border-[#24282D] px-4 py-3">
            {isOpen ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                    Net payout received ($)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value)}
                    placeholder="after consignor fees"
                    className="w-44 border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#5FA8FF] focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                    Date paid
                  </span>
                  <input
                    type="date"
                    value={settledDate}
                    onChange={(e) => setSettledDate(e.target.value)}
                    className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-sm text-[#E6E8EB] focus:border-[#5FA8FF] focus:outline-none"
                  />
                </label>
                <div>
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                    Split
                  </span>
                  <div className="flex border border-[#343941]">
                    {(
                      [
                        ["equal_loss", "Equal loss"],
                        ["proportional", "By cost"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMethod(value)}
                        className={`px-3 py-1.5 text-[12px] font-medium ${
                          method === value ? "bg-[#1A1F25] text-[#E6E8EB]" : "text-[#77808C] hover:text-[#B8C0CC]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-w-[160px] flex-1 text-[12px] text-[#77808C]">
                  {profit != null ? (
                    <>
                      <span className={`font-data font-semibold ${pnlClass(profit)}`}>{fmtSigned(profit)}</span> on the order
                      {method === "equal_loss" && perCardLoss != null ? (
                        <> · <span className="font-data">{fmtSigned(perCardLoss)}</span> per card</>
                      ) : null}
                      {negativePayout ? (
                        <div className="text-[11px] text-amber-400">
                          A card&apos;s share goes below $0 — try splitting by cost.
                        </div>
                      ) : null}
                    </>
                  ) : (
                    "Enter the payout to preview the split."
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteOrder()}
                    className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#77808C] hover:text-[#E05C5C]"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onAddCards}
                    className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
                  >
                    + Add cards
                  </button>
                  <button
                    type="button"
                    disabled={busy || payoutCents == null || order.items.length === 0}
                    onClick={() => void settle()}
                    className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Settle order"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#77808C]">
                <span>
                  Split {order.split_method === "proportional" ? "by cost" : "as equal loss per card"}. Inventory cards
                  were recorded as sales; hand-added cards were booked to Consignment / Misc profit.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reopen()}
                  className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
                >
                  {busy ? "Working…" : "Reopen"}
                </button>
              </div>
            )}
            {error ? (
              <div className="mt-2 border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">{error}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
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
