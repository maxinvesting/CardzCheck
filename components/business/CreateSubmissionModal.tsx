"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { gradeTiersFor } from "@/lib/business/grading-forecast";
import { buildInventoryTitle } from "@/lib/business/grade";

/**
 * Create a grading submission in bulk: shared submission details (company,
 * service, fee per card, turnaround, sent date, shipping) plus one row per card.
 * Every card is added to inventory as a raw card with status at_grading via the
 * bulk-add endpoint, so it shows in both the Inventory ledger and At Grading.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (count: number) => void;
}

const COMPANY_OPTIONS = ["PSA", "BGS", "SGC", "CGC", "TAG", "Other"] as const;

interface CardRow {
  key: number;
  year: string;
  player_name: string;
  set_name: string;
  parallel_type: string;
  card_number: string;
  cost: string;
  /** grade label → dollars as typed */
  estimates: Record<string, string>;
}

let rowKey = 0;
function emptyRow(): CardRow {
  rowKey += 1;
  return {
    key: rowKey,
    year: "",
    player_name: "",
    set_name: "",
    parallel_type: "",
    card_number: "",
    cost: "",
    estimates: {},
  };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toCents(value: string): number {
  const n = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const fmt = (cents: number) => MONEY.format(cents / 100);

/** Splits `total` across `n` rows; the rounding remainder lands on row 0. */
function splitEvenly(totalCents: number, n: number, index: number): number {
  const base = Math.floor(totalCents / n);
  return base + (index === 0 ? totalCents - base * n : 0);
}

const isBlank = (row: CardRow) =>
  !row.player_name.trim() && !row.year.trim() && !row.set_name.trim() && !row.cost.trim();

export default function CreateSubmissionModal({ isOpen, onClose, onCreated }: Props) {
  const [mounted, setMounted] = useState(false);
  const [company, setCompany] = useState("PSA");
  const [service, setService] = useState("");
  const [fee, setFee] = useState("");
  const [turnaround, setTurnaround] = useState("");
  const [sentDate, setSentDate] = useState(today);
  const [shipping, setShipping] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(today);
  const [rows, setRows] = useState<CardRow[]>(() => Array.from({ length: 5 }, emptyRow));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    setCompany("PSA");
    setService("");
    setFee("");
    setTurnaround("");
    setSentDate(today());
    setShipping("");
    setAcquisitionDate(today());
    setRows(Array.from({ length: 5 }, emptyRow));
    setError(null);
  }, [isOpen]);

  const tiers = gradeTiersFor(company);
  const filled = rows.filter((r) => !isBlank(r));

  const totals = useMemo(() => {
    const cardCents = filled.reduce((sum, r) => sum + toCents(r.cost), 0);
    const feeCents = toCents(fee) * filled.length;
    const shippingCents = filled.length > 0 ? toCents(shipping) : 0;
    return { cardCents, feeCents, shippingCents, allIn: cardCents + feeCents + shippingCents };
  }, [filled, fee, shipping]);

  const updateRow = (key: number, patch: Partial<CardRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /**
   * Pasting a block from a spreadsheet fills rows starting at the target row.
   * Column order: year, player, set, parallel, card #, cost, then one value per
   * grade tier (highest first).
   */
  const handlePaste = (startKey: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    setRows((prev) => {
      const next = [...prev];
      let index = next.findIndex((r) => r.key === startKey);
      for (const line of lines) {
        const c = line.split("\t").map((v) => v.trim());
        if (index >= next.length) next.push(emptyRow());
        const estimates: Record<string, string> = {};
        tiers.forEach((g, i) => {
          if (c[6 + i]) estimates[g] = c[6 + i].replace(/[$,]/g, "");
        });
        next[index] = {
          ...next[index],
          year: c[0] ?? "",
          player_name: c[1] ?? "",
          set_name: c[2] ?? "",
          parallel_type: c[3] ?? "",
          card_number: (c[4] ?? "").replace(/^#/, ""),
          cost: (c[5] ?? "").replace(/[$,]/g, ""),
          estimates,
        };
        index += 1;
      }
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    if (filled.length === 0) {
      setError("Add at least one card.");
      return;
    }
    const missing = filled.findIndex((r) => !r.player_name.trim());
    if (missing >= 0) {
      setError(`Card ${missing + 1} needs a player name.`);
      return;
    }

    const feeCents = toCents(fee);
    const shippingCents = toCents(shipping);
    const turnaroundDays = Number.parseInt(turnaround, 10);

    const payload = filled.map((row, index) => {
      const card = {
        year: row.year.trim() || null,
        player_name: row.player_name.trim(),
        set_name: row.set_name.trim() || null,
        parallel_type: row.parallel_type.trim() || null,
      };
      return {
        ...card,
        title: buildInventoryTitle(card),
        card_number: row.card_number.trim() || null,
        quantity: 1,
        acquisition_type: "buy",
        acquisition_date: acquisitionDate || null,
        // Grading fee is part of what the card cost (matches the single add form).
        cost_basis_total_cents: toCents(row.cost) + feeCents,
        tax_cents: 0,
        shipping_cents: splitEvenly(shippingCents, filled.length, index),
        fees_paid_cents: 0,
        condition_status: "raw",
        status: "at_grading",
        grading_submitted_company: company,
        grading_service: service.trim() || null,
        grading_fee_cents: feeCents,
        grading_sent_date: sentDate || null,
        grading_turnaround_days:
          Number.isFinite(turnaroundDays) && turnaroundDays >= 0 ? turnaroundDays : null,
        grading_value_estimates: Object.fromEntries(
          tiers
            .filter((g) => (row.estimates[g] ?? "").trim() !== "")
            .map((g) => [g, toCents(row.estimates[g])])
        ),
      };
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/business/inventory/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to create submission");

      const failed = (data?.results ?? []).filter(
        (r: { status: string }) => r.status === "failed"
      ) as Array<{ index: number; error: string }>;
      if (failed.length > 0) {
        // Keep only the rows that didn't make it so they can be fixed and retried.
        const failedRows = failed.map((f) => filled[f.index]).filter(Boolean);
        setRows(failedRows.length > 0 ? failedRows : [emptyRow()]);
        setError(
          `${data.added} added, ${failed.length} failed: ${failed[0].error}. The failed cards are still below.`
        );
        if (data.added > 0) onCreated(data.added);
        return;
      }
      onCreated(data?.added ?? filled.length);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create submission");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const labelClass =
    "mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]";
  const inputClass =
    "w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#5FA8FF] focus:outline-none";
  const cellClass =
    "w-full border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-[#E6E8EB] placeholder-[#4F5863] hover:border-[#24282D] focus:border-[#5FA8FF] focus:bg-[#0F1317] focus:outline-none";

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
            <h2 className="text-sm font-semibold">Create submission</h2>
            <p className="mt-1 text-xs text-[#77808C]">
              Every card is added to inventory as raw and marked at grading. The fee per card
              goes into each card&apos;s cost; shipping is split evenly.
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <label className="block">
              <span className={labelClass}>Grading Co.</span>
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass}>
                {COMPANY_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Service Level</span>
              <input
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="e.g. Value"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Fee / Card ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Turnaround (Bus. Days)</span>
              <input
                type="number"
                step="1"
                min="0"
                value={turnaround}
                onChange={(e) => setTurnaround(e.target.value)}
                placeholder="e.g. 65"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Date Sent</span>
              <input
                type="date"
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Shipping / Ins. Total ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Purchase Date</span>
              <input
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#77808C]">
                Cards
              </div>
              <div className="text-[11px] text-[#5A626E]">
                Tip: paste rows from a spreadsheet: year, player, set, parallel, #, cost,
                then {tiers.map((g) => `${company === "Other" ? "" : `${company} `}${g}`).join(", ")} values.
              </div>
            </div>
            <div className="overflow-x-auto border border-[#24282D]">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                    <th className="w-8 px-2 py-2 text-right">#</th>
                    <th className="w-[70px] px-2 py-2">Year</th>
                    <th className="px-2 py-2">Player *</th>
                    <th className="px-2 py-2">Set</th>
                    <th className="px-2 py-2">Parallel</th>
                    <th className="w-[70px] px-2 py-2">Card #</th>
                    <th className="w-[90px] px-2 py-2 text-right">Cost ($)</th>
                    {tiers.map((g) => (
                      <th key={g} className="w-[84px] px-2 py-2 text-right">
                        If {g} ($)
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2227]">
                  {rows.map((row, i) => (
                    <tr key={row.key}>
                      <td className="px-2 text-right font-data text-[11px] text-[#5A626E]">{i + 1}</td>
                      <td>
                        <input
                          value={row.year}
                          onChange={(e) => updateRow(row.key, { year: e.target.value })}
                          onPaste={(e) => handlePaste(row.key, e)}
                          placeholder="2024"
                          className={cellClass}
                        />
                      </td>
                      <td>
                        <input
                          value={row.player_name}
                          onChange={(e) => updateRow(row.key, { player_name: e.target.value })}
                          onPaste={(e) => handlePaste(row.key, e)}
                          placeholder="Player"
                          className={cellClass}
                        />
                      </td>
                      <td>
                        <input
                          value={row.set_name}
                          onChange={(e) => updateRow(row.key, { set_name: e.target.value })}
                          placeholder="Panini Prizm"
                          className={cellClass}
                        />
                      </td>
                      <td>
                        <input
                          value={row.parallel_type}
                          onChange={(e) => updateRow(row.key, { parallel_type: e.target.value })}
                          placeholder="Silver"
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
                      {tiers.map((g) => (
                        <td key={g}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.estimates[g] ?? ""}
                            onChange={(e) =>
                              updateRow(row.key, {
                                estimates: { ...row.estimates, [g]: e.target.value },
                              })
                            }
                            className={`${cellClass} text-right font-data tabular-nums`}
                          />
                        </td>
                      ))}
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.length > 1 ? prev.filter((r) => r.key !== row.key) : [emptyRow()]
                            )
                          }
                          className="px-1 text-[#5A626E] hover:text-[#E05C5C]"
                          aria-label={`Remove card ${i + 1}`}
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
              >
                + Add row
              </button>
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, ...Array.from({ length: 10 }, emptyRow)])}
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
              >
                + 10 rows
              </button>
            </div>
          </div>

          {error && (
            <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#24282D] pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#77808C]">
              <span>
                <span className="font-semibold text-[#E6E8EB]">{filled.length}</span> card
                {filled.length === 1 ? "" : "s"}
              </span>
              <span>
                Cards <span className="font-data text-[#E6E8EB]">{fmt(totals.cardCents)}</span>
              </span>
              <span>
                Grading <span className="font-data text-[#E6E8EB]">{fmt(totals.feeCents)}</span>
              </span>
              <span>
                Shipping <span className="font-data text-[#E6E8EB]">{fmt(totals.shippingCents)}</span>
              </span>
              <span>
                All-in <span className="font-data font-semibold text-[#E6E8EB]">{fmt(totals.allIn)}</span>
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
                {submitting
                  ? "Creating…"
                  : `Create submission${filled.length > 0 ? ` (${filled.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
