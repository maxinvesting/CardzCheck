"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveGradeFields, buildInventoryTitle } from "@/lib/business/grade";

interface BulkAddInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful add with the number of cards created. */
  onSuccess?: (addedCount: number) => void;
}

const CHANNEL_OPTIONS = [
  "ebay",
  "whatnot",
  "alt",
  "fanatics",
  "instagram",
  "show",
  "local",
  "other",
  "veriswap",
] as const;
const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"] as const;

interface DraftRow {
  id: string;
  player_name: string;
  year: string;
  set_name: string;
  parallel_type: string;
  card_number: string;
  grade: string;
  quantity: string;
  acquisition_type: string;
  acquisition_date: string;
  cost_basis: string;
  tax: string;
  shipping: string;
  fees_paid: string;
  channel: string;
  status: string;
  list_price: string;
  current_market_value: string;
  location: string;
  notes: string;
}

interface Defaults {
  acquisition_type: string;
  acquisition_date: string;
  channel: string;
  status: string;
}

let rowSeq = 0;
function nextId(): string {
  rowSeq += 1;
  return `r${rowSeq}_${Date.now().toString(36)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeDefaults(): Defaults {
  return {
    acquisition_type: "buy",
    acquisition_date: todayISO(),
    channel: "ebay",
    status: "unlisted",
  };
}

function emptyRow(defaults: Defaults): DraftRow {
  return {
    id: nextId(),
    player_name: "",
    year: "",
    set_name: "",
    parallel_type: "",
    card_number: "",
    grade: "",
    quantity: "1",
    acquisition_type: defaults.acquisition_type,
    acquisition_date: defaults.acquisition_date,
    cost_basis: "",
    tax: "",
    shipping: "",
    fees_paid: "",
    channel: defaults.channel,
    status: defaults.status,
    list_price: "",
    current_market_value: "",
    location: "",
    notes: "",
  };
}

const STARTING_ROWS = 3;

function toCents(val: string): number {
  const n = parseFloat(val);
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
}

function rowHasPlayer(row: DraftRow): boolean {
  return row.player_name.trim().length > 0;
}

export default function BulkAddInventoryModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkAddInventoryModalProps) {
  const [mounted, setMounted] = useState(false);
  const [defaults, setDefaults] = useState<Defaults>(makeDefaults);
  const [rows, setRows] = useState<DraftRow[]>(() =>
    Array.from({ length: STARTING_ROWS }, () => emptyRow(makeDefaults()))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    const d = makeDefaults();
    setDefaults(d);
    setRows(Array.from({ length: STARTING_ROWS }, () => emptyRow(d)));
    setError(null);
    setRowErrors({});
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const filledCount = useMemo(() => rows.filter(rowHasPlayer).length, [rows]);

  const updateRow = useCallback((id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      // Auto-append a fresh blank row once the last row gains a player name, so
      // the user can keep typing down the stack without clicking "Add row".
      const last = next[next.length - 1];
      if (last && rowHasPlayer(last)) {
        next.push(emptyRow(defaultsRef.current));
      }
      return next;
    });
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length > 0 ? next : [emptyRow(defaultsRef.current)];
    });
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow(defaultsRef.current)]);
  }, []);

  const applyDefaultsToAll = useCallback(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        acquisition_type: defaultsRef.current.acquisition_type,
        acquisition_date: defaultsRef.current.acquisition_date,
        channel: defaultsRef.current.channel,
        status: defaultsRef.current.status,
      }))
    );
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const submit = useCallback(async () => {
    setError(null);
    setRowErrors({});

    const toSend = rows.filter(rowHasPlayer);
    if (toSend.length === 0) {
      setError("Enter at least one card (player name required).");
      return;
    }

    // Expand quantity into individual single-card payloads so cost/cash-on-hand
    // apply per card, matching the single-add modal. Track each payload's source
    // grid row so failures can be mapped back and kept for retry.
    const payload: Record<string, unknown>[] = [];
    const sourceRowId: string[] = [];

    for (const row of toSend) {
      const grade = resolveGradeFields({ grade: row.grade });
      const title = buildInventoryTitle({
        year: row.year,
        player_name: row.player_name,
        set_name: row.set_name,
        parallel_type: row.parallel_type,
        grade: row.grade,
      });
      const qty = Math.max(1, Number.parseInt(row.quantity, 10) || 1);
      const base = {
        title,
        player_name: row.player_name.trim(),
        year: row.year.trim() || null,
        set_name: row.set_name.trim() || null,
        parallel_type: row.parallel_type.trim() || null,
        card_number: row.card_number.trim() || null,
        quantity: 1,
        acquisition_type: row.acquisition_type,
        acquisition_date: row.acquisition_date || null,
        cost_basis_total_cents: toCents(row.cost_basis),
        tax_cents: toCents(row.tax),
        shipping_cents: toCents(row.shipping),
        fees_paid_cents: toCents(row.fees_paid),
        condition_status: grade.conditionStatus,
        grading_company: grade.gradingCompany,
        grade: grade.gradeValue,
        channel: row.channel,
        status: row.status,
        list_price_cents: row.list_price ? toCents(row.list_price) : null,
        current_market_value_cents: row.current_market_value
          ? toCents(row.current_market_value)
          : null,
        location: row.location.trim() || null,
        notes: row.notes.trim() || null,
      };
      for (let i = 0; i < qty; i += 1) {
        payload.push(base);
        sourceRowId.push(row.id);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/business/inventory/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Bulk add failed");
        return;
      }

      const added: number = data?.added ?? 0;
      const failures: Array<{ index: number; error: string }> = Array.isArray(data?.results)
        ? data.results.filter((r: any) => r.status === "failed")
        : [];

      // Grid rows with at least one failed card stay; fully-added rows are cleared.
      const failedRowIds = new Set<string>();
      const failedRowMsg: Record<string, string> = {};
      for (const f of failures) {
        const rid = sourceRowId[f.index];
        if (!rid) continue;
        failedRowIds.add(rid);
        if (!failedRowMsg[rid]) failedRowMsg[rid] = f.error;
      }

      if (added > 0) onSuccess?.(added);

      if (failedRowIds.size === 0) {
        onClose();
        return;
      }

      setRows((prev) => {
        const kept = prev.filter((r) => failedRowIds.has(r.id) || !rowHasPlayer(r));
        const last = kept[kept.length - 1];
        if (!last || rowHasPlayer(last)) kept.push(emptyRow(defaultsRef.current));
        return kept;
      });
      setRowErrors(failedRowMsg);
      setError(
        `Added ${added} card${added === 1 ? "" : "s"}. ${failedRowIds.size} row${
          failedRowIds.size === 1 ? "" : "s"
        } failed — see highlighted rows below.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk add failed");
    } finally {
      setSubmitting(false);
    }
  }, [rows, onSuccess, onClose]);

  if (!isOpen || !mounted) return null;

  const cellInput =
    "w-full border border-[#343941] bg-[#0F1317] px-2 py-1.5 text-[12px] text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none";
  const headCell =
    "sticky top-0 z-10 whitespace-nowrap border-b border-[#24282D] bg-[#0B0D0F] px-2 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#77808C]";

  const textCell = (
    row: DraftRow,
    key: keyof DraftRow,
    opts?: { width?: string; placeholder?: string; type?: "text" | "number" | "date"; step?: string }
  ) => (
    <input
      type={opts?.type ?? "text"}
      step={opts?.type === "number" ? opts?.step ?? "0.01" : undefined}
      min={opts?.type === "number" ? "0" : undefined}
      value={row[key]}
      onChange={(e) => updateRow(row.id, { [key]: e.target.value } as Partial<DraftRow>)}
      placeholder={opts?.placeholder}
      className={cellInput}
      style={opts?.width ? { minWidth: opts.width } : undefined}
    />
  );

  const selectCell = (row: DraftRow, key: keyof DraftRow, options: readonly string[]) => (
    <select
      value={row[key]}
      onChange={(e) => updateRow(row.id, { [key]: e.target.value } as Partial<DraftRow>)}
      className={cellInput}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  const defaultLabel = "mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]";
  const defaultInput =
    "border border-[#343941] bg-[#0F1317] px-2 py-1.5 text-[12px] text-[#E6E8EB] focus:border-[#20B26B] focus:outline-none";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk add cards to inventory"
        className="flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-[#24282D] px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Inventory
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-[#E6E8EB]">
              Bulk add cards
            </h2>
            <p className="mt-0.5 text-[11px] text-[#5A626E]">
              One row per card. A new row appears as you fill the last one. Cost, tax,
              shipping &amp; fees are per card. Add photos later from the card.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="px-1 text-lg leading-none text-[#77808C] hover:text-[#E6E8EB]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {/* Shared defaults */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[#24282D] bg-[#0D0F12] px-5 py-3">
          <div>
            <span className={defaultLabel}>Default acq. type</span>
            <select
              value={defaults.acquisition_type}
              onChange={(e) => setDefaults((d) => ({ ...d, acquisition_type: e.target.value }))}
              className={defaultInput}
            >
              {ACQ_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={defaultLabel}>Default acq. date</span>
            <input
              type="date"
              value={defaults.acquisition_date}
              onChange={(e) => setDefaults((d) => ({ ...d, acquisition_date: e.target.value }))}
              className={defaultInput}
            />
          </div>
          <div>
            <span className={defaultLabel}>Default channel</span>
            <select
              value={defaults.channel}
              onChange={(e) => setDefaults((d) => ({ ...d, channel: e.target.value }))}
              className={defaultInput}
            >
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={defaultLabel}>Default status</span>
            <select
              value={defaults.status}
              onChange={(e) => setDefaults((d) => ({ ...d, status: e.target.value }))}
              className={defaultInput}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={applyDefaultsToAll}
            className="border border-[#343941] px-3 py-1.5 text-[11px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            title="Apply the four defaults above to every row"
          >
            Apply to all rows
          </button>
        </div>

        {/* Grid */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className={`${headCell} left-0 z-20`} style={{ minWidth: 40 }}>
                  #
                </th>
                <th className={`${headCell} left-[40px] z-20`} style={{ minWidth: 150 }}>
                  Player *
                </th>
                <th className={headCell} style={{ minWidth: 70 }}>Year</th>
                <th className={headCell} style={{ minWidth: 150 }}>Set</th>
                <th className={headCell} style={{ minWidth: 120 }}>Parallel / Insert</th>
                <th className={headCell} style={{ minWidth: 80 }}>Card #</th>
                <th className={headCell} style={{ minWidth: 90 }}>Grade</th>
                <th className={headCell} style={{ minWidth: 55 }}>Qty</th>
                <th className={headCell} style={{ minWidth: 100 }}>Acq. type</th>
                <th className={headCell} style={{ minWidth: 130 }}>Acq. date</th>
                <th className={headCell} style={{ minWidth: 85 }}>Cost $</th>
                <th className={headCell} style={{ minWidth: 70 }}>Tax $</th>
                <th className={headCell} style={{ minWidth: 75 }}>Ship $</th>
                <th className={headCell} style={{ minWidth: 70 }}>Fees $</th>
                <th className={headCell} style={{ minWidth: 100 }}>Channel</th>
                <th className={headCell} style={{ minWidth: 110 }}>Status</th>
                <th className={headCell} style={{ minWidth: 85 }}>List $</th>
                <th className={headCell} style={{ minWidth: 90 }}>Market $</th>
                <th className={headCell} style={{ minWidth: 120 }}>Storage</th>
                <th className={headCell} style={{ minWidth: 160 }}>Notes</th>
                <th className={headCell} style={{ minWidth: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowErr = rowErrors[row.id];
                return (
                  <tr
                    key={row.id}
                    className={rowErr ? "bg-[#2A1111]/40" : idx % 2 ? "bg-[#0D0F12]" : ""}
                  >
                    <td
                      className={`sticky left-0 z-10 border-b border-[#1A1D21] px-2 py-1 text-center text-[11px] text-[#5A626E] ${
                        rowErr ? "bg-[#2A1111]" : idx % 2 ? "bg-[#0D0F12]" : "bg-[#0B0D0F]"
                      }`}
                      title={rowErr}
                    >
                      {rowErr ? <span className="text-[#E05C5C]">!</span> : idx + 1}
                    </td>
                    <td
                      className={`sticky left-[40px] z-10 border-b border-[#1A1D21] px-1 py-1 ${
                        rowErr ? "bg-[#2A1111]" : idx % 2 ? "bg-[#0D0F12]" : "bg-[#0B0D0F]"
                      }`}
                    >
                      {textCell(row, "player_name", { placeholder: "Player", width: "150px" })}
                    </td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "year", { placeholder: "2023" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "set_name", { placeholder: "Prizm" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "parallel_type", { placeholder: "Silver" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "card_number", { placeholder: "#" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "grade", { placeholder: "PSA 10 / raw" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "quantity", { type: "number", step: "1" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{selectCell(row, "acquisition_type", ACQ_OPTIONS)}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "acquisition_date", { type: "date" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "cost_basis", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "tax", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "shipping", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "fees_paid", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{selectCell(row, "channel", CHANNEL_OPTIONS)}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{selectCell(row, "status", STATUS_OPTIONS)}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "list_price", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "current_market_value", { type: "number", placeholder: "0.00" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "location", { placeholder: "Box A" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1">{textCell(row, "notes", { placeholder: "Serial, notes" })}</td>
                    <td className="border-b border-[#1A1D21] px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="px-1 text-[#5A626E] hover:text-[#E05C5C]"
                        aria-label={`Remove row ${idx + 1}`}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <footer className="border-t border-[#24282D] px-5 py-3">
          {error && (
            <div className="mb-2 border border-[#723030] bg-[#2A1111] px-3 py-2 text-[12px] text-[#E05C5C]">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={addRow}
                className="border border-[#343941] px-3 py-2 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
              >
                + Add row
              </button>
              <span className="text-[12px] text-[#77808C]">
                {filledCount} card{filledCount === 1 ? "" : "s"} ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="border border-[#343941] px-4 py-2 text-xs font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || filledCount === 0}
                className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-xs font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Adding…"
                  : `Add ${filledCount} card${filledCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
