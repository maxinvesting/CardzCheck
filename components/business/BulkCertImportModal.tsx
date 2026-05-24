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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[90vh]">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk add by PSA cert</h2>
            <p className="text-xs text-gray-500">
              Paste cert numbers (one per line). We look them up against PSA and let you review before adding to the ledger.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {rows.length === 0 ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-gray-700">
                    PSA cert numbers
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  One per line. Commas/spaces also accepted. Up to 100 per batch.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Default cost basis ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={defaultCostBasis}
                    onChange={(e) => setDefaultCostBasis(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Default channel
                  </label>
                  <select
                    value={defaultChannel}
                    onChange={(e) => setDefaultChannel(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {CHANNEL_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c || "—"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Acquisition type
                  </label>
                  <select
                    value={defaultAcquisitionType}
                    onChange={(e) => setDefaultAcquisitionType(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="bought">bought</option>
                    <option value="pulled">pulled</option>
                    <option value="trade">trade</option>
                    <option value="gift">gift</option>
                    <option value="unknown">unknown</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">
                    Acquisition date
                  </label>
                  <input
                    type="date"
                    value={defaultAcquisitionDate}
                    onChange={(e) => setDefaultAcquisitionDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
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
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, idx) => (
                    <tr key={`${row.cert}-${idx}`} className="align-top">
                      <td className="px-2 py-2 font-mono text-xs text-gray-700">{row.cert}</td>
                      <td className="px-2 py-2">
                        <StatusChip status={row.status} reason={row.reason} />
                      </td>
                      <td className="px-2 py-2 text-gray-700">
                        {row.mapped ? (
                          <div className="leading-tight">
                            <div className="font-medium text-gray-900">
                              {row.mapped.player_name ?? "—"}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {[row.mapped.year, row.mapped.set_name, row.mapped.card_number ? `#${row.mapped.card_number}` : null, row.mapped.parallel_type]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-700">{row.mapped?.grade ?? "—"}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs"
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
                          className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs"
                          disabled={row.status !== "found"}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.channel}
                          onChange={(e) => updateRow(idx, { channel: e.target.value })}
                          className="rounded border border-gray-300 px-1.5 py-1 text-xs"
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
                          className="rounded border border-gray-300 px-1.5 py-1 text-xs"
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
                              className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                            >
                              Retry
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
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
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Added {summary.added} card{summary.added === 1 ? "" : "s"} to the ledger
              {summary.failed > 0 ? `, ${summary.failed} failed` : ""}.
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-gray-50 px-5 py-3">
          <div className="text-xs text-gray-500">
            {rows.length > 0 ? `${foundCount} of ${rows.length} ready` : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLookingUp || isSubmitting}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Close
            </button>
            {rows.length === 0 ? (
              <button
                type="button"
                onClick={runLookup}
                disabled={isLookingUp || pasted.trim().length === 0}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isLookingUp ? "Looking up…" : "Look up"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={isLookingUp || isSubmitting}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Start over
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting || foundCount === 0}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
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
    pending: "bg-gray-100 text-gray-700",
    found: "bg-emerald-100 text-emerald-800",
    not_found: "bg-amber-100 text-amber-800",
    invalid: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-800",
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
