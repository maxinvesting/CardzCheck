"use client";

import { useCallback, useMemo, useState } from "react";
import CertBarcodeScanner from "@/components/business/CertBarcodeScanner";

interface PsaMapped {
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: "PSA";
  parallel_type: string | null;
}

type RowStatus = "pending" | "found" | "not_found" | "invalid" | "error";

interface BulkRow {
  cert: string;
  status: RowStatus;
  reason?: string;
  mapped?: PsaMapped;
  quantity: number;
  cost_basis_dollars: string;
  channel: string;
  inv_status: string;
}

interface BulkCertImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (addedCount: number) => void;
}

const CHANNEL_OPTIONS = ["", "ebay", "whatnot", "instagram", "show", "local", "other"];
const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold"];

function parseCerts(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of input.split(/[\s,;\n\r]+/)) {
    const digits = token.trim().replace(/\D/g, "");
    if (!digits) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(digits);
  }
  return out;
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export default function BulkCertImportModal({ isOpen, onClose, onSuccess }: BulkCertImportModalProps) {
  const [pasted, setPasted] = useState("");
  const [defaultCostBasis, setDefaultCostBasis] = useState("");
  const [defaultChannel, setDefaultChannel] = useState("");
  const [defaultAcquisitionType, setDefaultAcquisitionType] = useState("bought");
  const [defaultAcquisitionDate, setDefaultAcquisitionDate] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; failed: number } | null>(null);

  const foundCount = useMemo(() => rows.filter((r) => r.status === "found").length, [rows]);

  const appendCertFromScan = useCallback((cert: string) => {
    setPasted((prev) => {
      const certs = parseCerts(prev);
      if (certs.includes(cert)) return prev;
      const sep = prev.length === 0 || prev.endsWith("\n") ? "" : "\n";
      return `${prev}${sep}${cert}\n`;
    });
  }, []);

  if (!isOpen) return null;

  function resetAll() {
    setPasted("");
    setRows([]);
    setSummary(null);
    setErrorMessage(null);
  }

  function handleClose() {
    if (isLookingUp || isSubmitting) return;
    resetAll();
    onClose();
  }

  async function runLookup() {
    setErrorMessage(null);
    setSummary(null);
    const certs = parseCerts(pasted);
    if (certs.length === 0) {
      setErrorMessage("Paste at least one cert number.");
      return;
    }
    setIsLookingUp(true);
    try {
      const res = await fetch("/api/business/inventory/bulk-cert/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certs }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error ?? "Lookup failed");
        return;
      }
      const newRows: BulkRow[] = (json.results ?? []).map((r: any) => ({
        cert: r.cert,
        status: r.status,
        reason: r.reason,
        mapped: r.mapped,
        quantity: 1,
        cost_basis_dollars: defaultCostBasis,
        channel: defaultChannel,
        inv_status: "unlisted",
      }));
      setRows(newRows);
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Lookup failed");
    } finally {
      setIsLookingUp(false);
    }
  }

  function updateRow(index: number, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function retryRow(index: number) {
    const row = rows[index];
    if (!row) return;
    updateRow(index, { status: "pending", reason: undefined });
    try {
      const res = await fetch("/api/business/inventory/bulk-cert/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certs: [row.cert] }),
      });
      const json = await res.json();
      const result = (json.results ?? [])[0];
      if (!res.ok || !result) {
        updateRow(index, { status: "error", reason: json.error ?? "Lookup failed" });
        return;
      }
      updateRow(index, {
        status: result.status,
        reason: result.reason,
        mapped: result.mapped,
      });
    } catch (err: any) {
      updateRow(index, { status: "error", reason: err?.message ?? "Lookup failed" });
    }
  }

  async function submit() {
    setErrorMessage(null);
    setSummary(null);
    const payloadRows = rows
      .filter((r) => r.status === "found" && r.mapped)
      .map((r) => ({
        cert: r.cert,
        player_name: r.mapped?.player_name ?? null,
        year: r.mapped?.year ?? null,
        set_name: r.mapped?.set_name ?? null,
        card_number: r.mapped?.card_number ?? null,
        parallel_type: r.mapped?.parallel_type ?? null,
        grade: r.mapped?.grade ?? null,
        grading_company: r.mapped?.grading_company ?? "PSA",
        quantity: r.quantity || 1,
        cost_basis_total_cents: dollarsToCents(r.cost_basis_dollars),
        channel: r.channel || null,
        status: r.inv_status || "unlisted",
        acquisition_type: defaultAcquisitionType || null,
        acquisition_date: defaultAcquisitionDate || null,
      }));

    if (payloadRows.length === 0) {
      setErrorMessage("No rows ready to add.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/business/inventory/bulk-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMessage(json.error ?? "Bulk add failed");
        return;
      }
      setSummary({ added: json.added ?? 0, failed: json.failed ?? 0 });
      onSuccess?.(json.added ?? 0);
      const addedCerts = new Set(
        (json.results ?? []).filter((r: any) => r.status === "added").map((r: any) => r.cert)
      );
      setRows((prev) => prev.filter((r) => !addedCerts.has(r.cert)));
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Bulk add failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className={`flex max-h-[calc(100vh-1rem)] w-full ${rows.length === 0 ? "max-w-lg" : "max-w-4xl"} flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-black shadow-2xl sm:max-h-[90vh]`}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-bold text-white">Bulk add by PSA cert</h2>
            <p className="text-xs text-gray-400">
              Paste cert numbers (one per line). We look them up against PSA and let you review before adding to the ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-gray-300">
                    PSA cert numbers
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-neutral-900 px-2 py-1 text-[11px] font-medium text-gray-200 hover:bg-gray-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7V5a2 2 0 012-2h2M4 17v2a2 2 0 002 2h2m8-18h2a2 2 0 012 2v2m-4 14h2a2 2 0 002-2v-2M7 7h2v10H7zM12 7h1v10h-1zM15 7h2v10h-2z" />
                    </svg>
                    Scan barcode
                  </button>
                </div>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={8}
                  placeholder="12345678&#10;87654321&#10;..."
                  className="w-full rounded-md border border-white/15 bg-neutral-950 px-3 py-2 font-mono text-sm text-gray-100 placeholder-gray-600 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  One per line. Commas/spaces also accepted. Up to 100 per batch.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">
                    Default cost basis ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultCostBasis}
                    onChange={(e) => setDefaultCostBasis(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm text-gray-100 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">
                    Default channel
                  </label>
                  <select
                    value={defaultChannel}
                    onChange={(e) => setDefaultChannel(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm text-gray-100 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                  >
                    {CHANNEL_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c || "—"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">
                    Acquisition type
                  </label>
                  <select
                    value={defaultAcquisitionType}
                    onChange={(e) => setDefaultAcquisitionType(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm text-gray-100 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                  >
                    <option value="bought">bought</option>
                    <option value="pulled">pulled</option>
                    <option value="trade">trade</option>
                    <option value="gift">gift</option>
                    <option value="unknown">unknown</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-300">
                    Acquisition date
                  </label>
                  <input
                    type="date"
                    value={defaultAcquisitionDate}
                    onChange={(e) => setDefaultAcquisitionDate(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-neutral-950 px-2 py-1.5 text-sm text-gray-100 focus:border-white focus:outline-none focus:ring-1 focus:ring-white"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-950 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-2 py-2">Cert</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Card</th>
                    <th className="px-2 py-2">Grade</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Cost ($)</th>
                    <th className="px-2 py-2">Channel</th>
                    <th className="px-2 py-2">Inv. status</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {rows.map((row, idx) => (
                    <tr key={`${row.cert}-${idx}`} className="align-top">
                      <td className="px-2 py-2 font-mono text-xs text-gray-200">{row.cert}</td>
                      <td className="px-2 py-2">
                        <StatusChip status={row.status} reason={row.reason} />
                      </td>
                      <td className="px-2 py-2 text-gray-200">
                        {row.mapped ? (
                          <div className="leading-tight">
                            <div className="font-medium text-white">
                              {row.mapped.player_name ?? "—"}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {[row.mapped.year, row.mapped.set_name, row.mapped.card_number ? `#${row.mapped.card_number}` : null, row.mapped.parallel_type]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-200">{row.mapped?.grade ?? "—"}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-16 rounded border border-white/15 bg-neutral-950 px-1.5 py-1 text-xs text-gray-100 disabled:opacity-50"
                          disabled={row.status !== "found"}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.cost_basis_dollars}
                          onChange={(e) => updateRow(idx, { cost_basis_dollars: e.target.value })}
                          className="w-20 rounded border border-white/15 bg-neutral-950 px-1.5 py-1 text-xs text-gray-100 disabled:opacity-50"
                          disabled={row.status !== "found"}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.channel}
                          onChange={(e) => updateRow(idx, { channel: e.target.value })}
                          className="rounded border border-white/15 bg-neutral-950 px-1.5 py-1 text-xs text-gray-100 disabled:opacity-50"
                          disabled={row.status !== "found"}
                        >
                          {CHANNEL_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c || "—"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.inv_status}
                          onChange={(e) => updateRow(idx, { inv_status: e.target.value })}
                          className="rounded border border-white/15 bg-neutral-950 px-1.5 py-1 text-xs text-gray-100 disabled:opacity-50"
                          disabled={row.status !== "found"}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          {row.status !== "found" ? (
                            <button
                              type="button"
                              onClick={() => retryRow(idx)}
                              className="rounded border border-white/15 bg-neutral-900 px-2 py-0.5 text-[11px] text-gray-200 hover:bg-gray-700"
                            >
                              Retry
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="rounded border border-white/15 bg-neutral-900 px-2 py-0.5 text-[11px] text-gray-200 hover:bg-gray-700"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errorMessage ? (
            <div className="mt-3 rounded-md border border-red-700/60 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              {errorMessage}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 rounded-md border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
              Added {summary.added} card{summary.added === 1 ? "" : "s"} to the ledger
              {summary.failed > 0 ? `, ${summary.failed} failed` : ""}.
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-white/10 bg-neutral-950 px-5 py-3">
          <div className="text-xs text-gray-400">
            {rows.length > 0 ? `${foundCount} of ${rows.length} ready` : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLookingUp || isSubmitting}
              className="rounded-md border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              Close
            </button>
            {rows.length === 0 ? (
              <button
                type="button"
                onClick={runLookup}
                disabled={isLookingUp || pasted.trim().length === 0}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
              >
                {isLookingUp ? "Looking up…" : "Look up"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={isLookingUp || isSubmitting}
                  className="rounded-md border border-white/15 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                >
                  Start over
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting || foundCount === 0}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Adding…"
                    : `Add ${foundCount} card${foundCount === 1 ? "" : "s"} to ledger`}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>

      <CertBarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onCertDetected={appendCertFromScan}
      />
    </div>
  );
}

function StatusChip({ status, reason }: { status: RowStatus; reason?: string }) {
  const styles: Record<RowStatus, string> = {
    pending: "bg-gray-800 text-gray-300",
    found: "bg-white text-black border border-white",
    not_found: "bg-amber-900/30 text-amber-300 border border-amber-700/50",
    invalid: "bg-amber-900/30 text-amber-300 border border-amber-700/50",
    error: "bg-red-900/30 text-red-300 border border-red-700/50",
  };
  const label: Record<RowStatus, string> = {
    pending: "Pending",
    found: "Found",
    not_found: "Not found",
    invalid: "Invalid",
    error: "Error",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}
      title={reason}
    >
      {label[status]}
    </span>
  );
}
