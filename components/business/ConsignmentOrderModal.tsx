"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { BusinessInventoryItem } from "@/types";

/**
 * New consignment order, or "add cards" to an existing open one. Cards come
 * from two places: picked out of inventory (checkboxes, searchable) or typed in
 * by hand (title, #, cost). Inventory cards go to status Pending while out.
 */

export interface ConsignmentOrderDraft {
  consignor: string;
  reference: string;
  sent_date: string;
  notes: string;
  inventory_item_ids: string[];
  manual_items: { title: string; card_number: string | null; cost_cents: number }[];
}

interface Props {
  isOpen: boolean;
  /** Set when adding cards to an existing order — hides the order fields. */
  addingTo?: { consignor: string } | null;
  inventory: BusinessInventoryItem[];
  /** Inventory ids already in an open consignment order. */
  takenIds: Set<string>;
  onClose: () => void;
  onSubmit: (draft: ConsignmentOrderDraft) => Promise<void>;
}

const CONSIGNOR_SUGGESTIONS = ["Fanatics Collect", "PWCC", "eBay Consignment", "Alt", "Goldin", "MySlabs"];
const ELIGIBLE = new Set(["unlisted", "listed", "pending_sale", "at_grading", "returned"]);

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmt = (cents: number) => MONEY.format(cents / 100);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toCents(value: string): number {
  const n = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

interface ManualRow {
  key: number;
  title: string;
  card_number: string;
  cost: string;
}
let rowKey = 0;
const emptyRow = (): ManualRow => ({ key: ++rowKey, title: "", card_number: "", cost: "" });

function statusLabel(status: string): string {
  if (status === "pending_sale") return "Pending";
  if (status === "at_grading") return "At grading";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ConsignmentOrderModal({
  isOpen,
  addingTo,
  inventory,
  takenIds,
  onClose,
  onSubmit,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [consignor, setConsignor] = useState("");
  const [reference, setReference] = useState("");
  const [sentDate, setSentDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<ManualRow[]>(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!isOpen) return;
    setConsignor("");
    setReference("");
    setSentDate(today());
    setNotes("");
    setSearch("");
    setSelected(new Set());
    setRows([emptyRow()]);
    setError(null);
  }, [isOpen]);

  const eligible = useMemo(
    () =>
      inventory
        .filter((it) => ELIGIBLE.has(it.status) && !takenIds.has(it.id))
        .sort((a, b) => (a.title || "").localeCompare(b.title || "")),
    [inventory, takenIds]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    const terms = q.split(/\s+/);
    return eligible.filter((it) => {
      const hay = [it.title, it.card_number, it.player_name, it.set_name, it.grade, it.grading_company]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [eligible, search]);

  const filledRows = rows.filter((r) => r.title.trim());
  const selectedItems = eligible.filter((it) => selected.has(it.id));
  const totalCost =
    selectedItems.reduce((sum, it) => sum + (it.cost_basis_total_cents ?? 0), 0) +
    filledRows.reduce((sum, r) => sum + toCents(r.cost), 0);
  const cardCount = selectedItems.length + filledRows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((it) => selected.has(it.id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of visible) {
        if (allVisibleSelected) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });

  const updateRow = (key: number, patch: Partial<ManualRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Paste "title<TAB>#<TAB>cost" lines from a spreadsheet. */
  const handlePaste = (startKey: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
    setRows((prev) => {
      const next = [...prev];
      let index = next.findIndex((r) => r.key === startKey);
      for (const line of lines) {
        const c = line.split("\t").map((v) => v.trim());
        if (index >= next.length) next.push(emptyRow());
        next[index] = {
          ...next[index],
          title: c[0] ?? "",
          card_number: c.length >= 3 ? c[1] ?? "" : "",
          cost: (c.length >= 3 ? c[2] : c[1])?.replace(/[$,]/g, "") ?? "",
        };
        index += 1;
      }
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    if (!addingTo && !consignor.trim()) {
      setError("Who did you consign them with?");
      return;
    }
    if (cardCount === 0) {
      setError("Pick cards from inventory or add some by hand.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        consignor: consignor.trim(),
        reference: reference.trim(),
        sent_date: sentDate,
        notes: notes.trim(),
        inventory_item_ids: selectedItems.map((it) => it.id),
        manual_items: filledRows.map((r) => ({
          title: r.title.trim(),
          card_number: r.card_number.trim() || null,
          cost_cents: toCents(r.cost),
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
  const sectionLabel = "text-[10px] font-semibold uppercase tracking-[0.1em] text-[#77808C]";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 lg:pl-[17rem]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="my-6 w-full max-w-5xl border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              {addingTo ? `Add cards · ${addingTo.consignor}` : "New consignment order"}
            </h2>
            <p className="mt-1 text-xs text-[#77808C]">
              Inventory cards are marked Pending while they&apos;re out. When the payout comes in,
              settle the order and the loss is split across the cards.
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
          {!addingTo && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className={labelClass}>Consignor *</span>
                <input
                  list="consignor-suggestions"
                  value={consignor}
                  onChange={(e) => setConsignor(e.target.value)}
                  placeholder="e.g. Fanatics Collect"
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
                <span className={labelClass}>Notes</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
              </label>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <div className={sectionLabel}>
                From inventory{" "}
                <span className="font-normal normal-case tracking-normal text-[#5A626E]">
                  · {selected.size} selected
                </span>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player, set, #…"
                className="w-full max-w-xs border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[13px] text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#5FA8FF] focus:outline-none"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto border border-[#24282D]">
              {eligible.length === 0 ? (
                <div className="px-3 py-6 text-center text-[13px] text-[#77808C]">
                  No unsold inventory to pick from.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-[#0B0D0F]">
                    <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                      <th className="w-9 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all shown"
                        />
                      </th>
                      <th className="px-2 py-2">Card</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2227]">
                    {visible.map((it) => (
                      <tr
                        key={it.id}
                        onClick={() => toggle(it.id)}
                        className={`cursor-pointer ${selected.has(it.id) ? "bg-[#0E1A14]" : "hover:bg-[#111315]"}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(it.id)}
                            onChange={() => toggle(it.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${it.title}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-[#E6E8EB]">{it.title}</div>
                          <div className="text-[11px] text-[#77808C]">
                            {[
                              it.card_number ? `#${it.card_number}` : null,
                              it.condition_status === "graded"
                                ? `${it.grading_company ?? ""} ${it.grade ?? ""}`.trim()
                                : "Raw",
                              it.quantity > 1 ? `qty ${it.quantity}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-[12px] text-[#B8C0CC]">{statusLabel(it.status)}</td>
                        <td className="px-3 py-2 text-right font-data tabular-nums">
                          {fmt(it.cost_basis_total_cents ?? 0)}
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-[12px] text-[#77808C]">
                          Nothing matches “{search}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div className={sectionLabel}>Add by hand</div>
              <div className="text-[11px] text-[#5A626E]">
                Not in inventory. Paste rows: card, #, cost.
              </div>
            </div>
            <div className="border border-[#24282D]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                    <th className="px-2 py-2">Card</th>
                    <th className="w-[90px] px-2 py-2">Card #</th>
                    <th className="w-[110px] px-2 py-2 text-right">Cost ($)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2227]">
                  {rows.map((row, i) => (
                    <tr key={row.key}>
                      <td>
                        <input
                          value={row.title}
                          onChange={(e) => updateRow(row.key, { title: e.target.value })}
                          onPaste={(e) => handlePaste(row.key, e)}
                          placeholder="2023 Prizm Victor Wembanyama Silver"
                          className={cellClass}
                        />
                      </td>
                      <td>
                        <input
                          value={row.card_number}
                          onChange={(e) => updateRow(row.key, { card_number: e.target.value })}
                          className={cellClass}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.cost}
                          onChange={(e) => updateRow(row.key, { cost: e.target.value })}
                          className={`${cellClass} text-right font-data tabular-nums`}
                        />
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : [emptyRow()]))
                          }
                          className="px-1 text-[#5A626E] hover:text-[#E05C5C]"
                          aria-label={`Remove row ${i + 1}`}
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="mt-2 border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
            >
              + Add row
            </button>
          </div>

          {error && (
            <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">{error}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#24282D] pt-4">
            <div className="flex gap-6 text-[12px] text-[#77808C]">
              <span>
                <span className="font-semibold text-[#E6E8EB]">{cardCount}</span> card{cardCount === 1 ? "" : "s"}
              </span>
              <span>
                Cost <span className="font-data font-semibold text-[#E6E8EB]">{fmt(totalCost)}</span>
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
                disabled={submitting || cardCount === 0}
                className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
              >
                {submitting ? "Saving…" : addingTo ? `Add ${cardCount || ""} card${cardCount === 1 ? "" : "s"}` : "Create order"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
