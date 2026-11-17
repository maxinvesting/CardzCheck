"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { BusinessInventoryItem } from "@/types";
import { computeConsignmentLines } from "@/lib/business/consignment-allocation";

/**
 * Enter a finished consignment order: who sold it, when, the consignor's fees
 * for the whole order, and one row per card with what you paid and what it
 * sold for. Rows come from inventory (search + click) or are typed in by hand.
 * Fees are split evenly across the cards. Saving records every card as a sale.
 */

export interface ConsignmentOrderDraft {
  consignor: string;
  reference: string | null;
  sent_date: string | null;
  sold_date: string;
  notes: string | null;
  fees_total_cents: number;
  cards: {
    inventory_item_id: string | null;
    title: string | null;
    card_number: string | null;
    cost_cents: number;
    sold_price_cents: number;
  }[];
}

interface Props {
  isOpen: boolean;
  inventory: BusinessInventoryItem[];
  onClose: () => void;
  onSubmit: (draft: ConsignmentOrderDraft) => Promise<void>;
}

const CONSIGNOR_SUGGESTIONS = ["Fanatics Collect", "PWCC", "eBay Consignment", "Alt", "Goldin", "MySlabs"];
const ELIGIBLE = new Set(["unlisted", "listed", "pending_sale", "at_grading", "returned"]);

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmt = (cents: number) => MONEY.format(cents / 100);
const fmtSigned = (cents: number) => `${cents < 0 ? "-" : cents > 0 ? "+" : ""}${fmt(Math.abs(cents))}`;
const pnlClass = (cents: number) =>
  cents > 0 ? "text-[#20B26B]" : cents < 0 ? "text-[#E05C5C]" : "text-[#B8C0CC]";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toCents(value: string): number {
  const n = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

interface Row {
  key: number;
  inventoryId: string | null;
  title: string;
  card_number: string;
  paid: string;
  sold: string;
}
let rowKey = 0;
const emptyRow = (): Row => ({ key: ++rowKey, inventoryId: null, title: "", card_number: "", paid: "", sold: "" });
const isBlank = (r: Row) => !r.inventoryId && !r.title.trim() && !r.paid.trim() && !r.sold.trim();

function describe(it: BusinessInventoryItem): string {
  return [
    it.card_number ? `#${it.card_number}` : null,
    it.condition_status === "graded" ? `${it.grading_company ?? ""} ${it.grade ?? ""}`.trim() : "Raw",
    it.quantity > 1 ? `qty ${it.quantity}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ConsignmentOrderModal({ isOpen, inventory, onClose, onSubmit }: Props) {
  const [mounted, setMounted] = useState(false);
  const [consignor, setConsignor] = useState("");
  const [reference, setReference] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [soldDate, setSoldDate] = useState(today);
  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isOpen) return;
    setConsignor("");
    setReference("");
    setSentDate("");
    setSoldDate(today());
    setFees("");
    setNotes("");
    setSearch("");
    setRows([emptyRow()]);
    setError(null);
  }, [isOpen]);

  const inventoryById = useMemo(() => new Map(inventory.map((it) => [it.id, it])), [inventory]);
  const pickedIds = new Set(rows.map((r) => r.inventoryId).filter(Boolean) as string[]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    return inventory
      .filter((it) => ELIGIBLE.has(it.status) && !pickedIds.has(it.id))
      .filter((it) => {
        const hay = [it.title, it.card_number, it.player_name, it.set_name, it.grade, it.grading_company]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, search, rows]);

  const addFromInventory = (it: BusinessInventoryItem) => {
    const row: Row = {
      key: ++rowKey,
      inventoryId: it.id,
      title: it.title,
      card_number: it.card_number ?? "",
      paid: it.cost_basis_total_cents ? String(it.cost_basis_total_cents / 100) : "",
      sold: "",
    };
    setRows((prev) => {
      // Replace a trailing blank row instead of stacking blanks.
      const blankIndex = prev.findIndex(isBlank);
      if (blankIndex === -1) return [...prev, row];
      const next = [...prev];
      next[blankIndex] = row;
      return next;
    });
    setSearch("");
  };

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Paste "card<TAB>#<TAB>paid<TAB>sold" (or card, paid, sold) from a spreadsheet. */
  const handlePaste = (startKey: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    setRows((prev) => {
      const next = [...prev];
      let index = next.findIndex((r) => r.key === startKey);
      for (const line of lines) {
        const c = line.split("\t").map((v) => v.trim().replace(/^\$/, ""));
        if (index >= next.length) next.push(emptyRow());
        const four = c.length >= 4;
        next[index] = {
          ...next[index],
          inventoryId: null,
          title: c[0] ?? "",
          card_number: four ? c[1] ?? "" : "",
          paid: (four ? c[2] : c[1])?.replace(/,/g, "") ?? "",
          sold: (four ? c[3] : c[2])?.replace(/,/g, "") ?? "",
        };
        index += 1;
      }
      return next;
    });
  };

  const filled = rows.filter((r) => !isBlank(r));
  const lines = useMemo(
    () =>
      computeConsignmentLines(
        filled.map((r) => ({ costCents: toCents(r.paid), soldCents: toCents(r.sold) })),
        toCents(fees)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, fees]
  );
  const lineByKey = new Map(filled.map((r, i) => [r.key, lines[i]]));
  const totals = lines.reduce(
    (t, l) => ({
      paid: t.paid + l.costCents,
      sold: t.sold + l.soldCents,
      fees: t.fees + l.feeCents,
      net: t.net + l.netCents,
      profit: t.profit + l.profitCents,
    }),
    { paid: 0, sold: 0, fees: 0, net: 0, profit: 0 }
  );

  const submit = async () => {
    setError(null);
    if (!consignor.trim()) return setError("Who consigned them?");
    if (filled.length === 0) return setError("Add at least one card.");
    const missingTitle = filled.find((r) => !r.inventoryId && !r.title.trim());
    if (missingTitle) return setError("Every card typed by hand needs a name.");
    const missingSold = filled.find((r) => !r.sold.trim());
    if (missingSold) return setError(`Enter what "${missingSold.title || "a card"}" sold for (0 if it didn't sell).`);
    setSubmitting(true);
    try {
      await onSubmit({
        consignor: consignor.trim(),
        reference: reference.trim() || null,
        sent_date: sentDate || null,
        sold_date: soldDate,
        notes: notes.trim() || null,
        fees_total_cents: toCents(fees),
        cards: filled.map((r) => ({
          inventory_item_id: r.inventoryId,
          title: r.inventoryId ? null : r.title.trim(),
          card_number: r.inventoryId ? null : r.card_number.trim() || null,
          cost_cents: toCents(r.paid),
          sold_price_cents: toCents(r.sold),
        })),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]";
  const inputClass =
    "w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#5FA8FF] focus:outline-none";
  const cellClass =
    "w-full border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-[#E6E8EB] placeholder-[#4F5863] hover:border-[#24282D] focus:border-[#5FA8FF] focus:bg-[#0F1317] focus:outline-none";
  const moneyCell = `${cellClass} text-right font-data tabular-nums`;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 lg:pl-[17rem]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="my-6 w-full max-w-6xl border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">New consignment order</h2>
            <p className="mt-1 text-xs text-[#77808C]">
              Enter what you paid and what each card sold for. Consignor fees are split evenly across the
              cards. Saving records every card as a sale in Sales &amp; Trades.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <label className="col-span-2 block md:col-span-1">
              <span className={labelClass}>Consignor *</span>
              <input
                list="consignor-suggestions"
                value={consignor}
                onChange={(e) => setConsignor(e.target.value)}
                placeholder="Fanatics Collect"
                className={inputClass}
                autoFocus
              />
              <datalist id="consignor-suggestions">
                {CONSIGNOR_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className={labelClass}>Order / Ref #</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Date Sent</span>
              <input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Date Sold / Paid *</span>
              <input type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Consignor Fees ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="whole order"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Notes</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </label>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#77808C]">Cards</div>
              <div className="relative w-full max-w-sm">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Add from inventory — search player, set, #…"
                  className="w-full border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[13px] text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#5FA8FF] focus:outline-none"
                />
                {search.trim() ? (
                  <div className="absolute right-0 z-10 mt-1 w-full border border-[#343941] bg-[#0F1317] shadow-xl">
                    {matches.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-[#77808C]">No unsold inventory matches.</div>
                    ) : (
                      matches.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => addFromInventory(it)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#1A1F25]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px]">{it.title}</span>
                            <span className="block text-[11px] text-[#77808C]">{describe(it)}</span>
                          </span>
                          <span className="shrink-0 font-data text-[12px] text-[#B8C0CC]">
                            {fmt(it.cost_basis_total_cents ?? 0)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto border border-[#24282D]">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                    <th className="w-8 px-2 py-2 text-right">#</th>
                    <th className="px-2 py-2">Card</th>
                    <th className="w-[80px] px-2 py-2">Card #</th>
                    <th className="w-[100px] px-2 py-2 text-right">Paid ($)</th>
                    <th className="w-[100px] px-2 py-2 text-right">Sold ($)</th>
                    <th className="w-[90px] px-2 py-2 text-right">Fee share</th>
                    <th className="w-[100px] px-2 py-2 text-right">Net</th>
                    <th className="w-[100px] px-2 py-2 text-right">P/L</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2227]">
                  {rows.map((row, i) => {
                    const line = lineByKey.get(row.key);
                    const inv = row.inventoryId ? inventoryById.get(row.inventoryId) : null;
                    return (
                      <tr key={row.key}>
                        <td className="px-2 text-right font-data text-[11px] text-[#5A626E]">{i + 1}</td>
                        <td>
                          {row.inventoryId ? (
                            <div className="px-2 py-1.5 text-[13px]">
                              <div>{row.title}</div>
                              <div className="text-[11px] text-[#77808C]">
                                From inventory{inv ? ` · ${describe(inv)}` : ""}
                              </div>
                            </div>
                          ) : (
                            <input
                              value={row.title}
                              onChange={(e) => updateRow(row.key, { title: e.target.value })}
                              onPaste={(e) => handlePaste(row.key, e)}
                              placeholder="Type a card, or search inventory above"
                              className={cellClass}
                            />
                          )}
                        </td>
                        <td>
                          {row.inventoryId ? (
                            <span className="px-2 text-[13px] text-[#B8C0CC]">{row.card_number || "—"}</span>
                          ) : (
                            <input
                              value={row.card_number}
                              onChange={(e) => updateRow(row.key, { card_number: e.target.value })}
                              className={cellClass}
                            />
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.paid}
                            onChange={(e) => updateRow(row.key, { paid: e.target.value })}
                            className={moneyCell}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.sold}
                            onChange={(e) => updateRow(row.key, { sold: e.target.value })}
                            className={moneyCell}
                          />
                        </td>
                        <td className="px-2 text-right font-data text-[13px] tabular-nums text-[#77808C]">
                          {line ? fmt(line.feeCents) : "—"}
                        </td>
                        <td className="px-2 text-right font-data text-[13px] tabular-nums">
                          {line ? fmt(line.netCents) : "—"}
                        </td>
                        <td className={`px-2 text-right font-data text-[13px] tabular-nums ${line ? pnlClass(line.profitCents) : "text-[#4F5863]"}`}>
                          {line ? fmtSigned(line.profitCents) : "—"}
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : [emptyRow()]))
                            }
                            className="px-1 text-[#5A626E] hover:text-[#E05C5C]"
                            aria-label={`Remove card ${i + 1}`}
                          >
                            x
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
              >
                + Add card by hand
              </button>
              <span className="text-[11px] text-[#5A626E]">
                Paste rows from a spreadsheet: card, #, paid, sold.
              </span>
            </div>
          </div>

          {error && (
            <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">{error}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#24282D] pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#77808C]">
              <span>
                <span className="font-semibold text-[#E6E8EB]">{filled.length}</span> card{filled.length === 1 ? "" : "s"}
              </span>
              <span>
                Paid <span className="font-data text-[#E6E8EB]">{fmt(totals.paid)}</span>
              </span>
              <span>
                Sold <span className="font-data text-[#E6E8EB]">{fmt(totals.sold)}</span>
              </span>
              <span>
                Fees <span className="font-data text-[#E6E8EB]">{fmt(totals.fees)}</span>
              </span>
              <span>
                Net <span className="font-data text-[#E6E8EB]">{fmt(totals.net)}</span>
              </span>
              <span>
                P/L <span className={`font-data font-semibold ${pnlClass(totals.profit)}`}>{fmtSigned(totals.profit)}</span>
                {filled.length > 0 ? (
                  <span> ({fmtSigned(Math.round(totals.profit / filled.length))} / card)</span>
                ) : null}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="border border-[#343941] px-4 py-2 text-sm font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || filled.length === 0}
                className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
              >
                {submitting ? "Recording…" : `Save & record ${filled.length || ""} sale${filled.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
