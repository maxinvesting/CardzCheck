"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CashSummary, CashTransaction } from "@/lib/business/cash";

interface CashManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after any successful balance change so parents can re-sync. */
  onChanged?: (balanceCents: number) => void;
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function fmt(cents: number): string {
  return MONEY.format((Number.isFinite(cents) ? cents : 0) / 100);
}

function inputToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

const KIND_LABELS: Record<CashTransaction["kind"], string> = {
  opening_balance: "Opening balance",
  adjustment: "Adjustment",
  sale: "Sale",
  trade: "Trade",
  purchase: "Purchase",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Mode = "set" | "add" | "remove";

export default function CashManagerModal({
  isOpen,
  onClose,
  onChanged,
}: CashManagerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [mode, setMode] = useState<Mode>("set");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/business/cash", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load cash balance");
      setSummary(data as CashSummary);
      setNeedsMigration(Boolean(data?.needs_migration));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cash balance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMode("set");
    setAmount("");
    setNote("");
    setError(null);
    void load();
  }, [isOpen, load]);

  // Prefill the "set" field with the current balance for quick correction.
  useEffect(() => {
    if (mode === "set" && summary && !amount) {
      setAmount((summary.balance_cents / 100).toFixed(2));
    }
    // Only when switching into set mode or after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, summary]);

  const submit = useCallback(async () => {
    const cents = inputToCents(amount);
    if (cents == null || cents < 0) {
      setError("Enter a valid dollar amount.");
      return;
    }
    if (mode !== "set" && cents === 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body =
        mode === "set"
          ? { mode: "set" as const, amount_cents: cents, note: note.trim() || null }
          : {
              mode: "adjust" as const,
              amount_cents: mode === "add" ? cents : -cents,
              note: note.trim() || null,
            };
      const res = await fetch("/api/business/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update cash balance");
      setSummary(data as CashSummary);
      setNote("");
      if (mode !== "set") setAmount("");
      onChanged?.((data as CashSummary).balance_cents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cash balance");
    } finally {
      setSubmitting(false);
    }
  }, [amount, mode, note, onChanged]);

  const handleDelete = useCallback(
    async (tx: CashTransaction) => {
      if (tx.source_type) return; // sale/trade rows are managed by their source
      if (!window.confirm("Remove this cash entry?")) return;
      try {
        const res = await fetch(`/api/business/cash/${tx.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to delete entry");
        await load();
        onChanged?.(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete entry");
      }
    },
    [load, onChanged]
  );

  if (!isOpen || !mounted) return null;

  const labelClass = "block text-xs font-medium text-[#77808C]";
  const inputClass =
    "w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]";

  const modeTabs: Array<{ key: Mode; label: string }> = [
    { key: "set", label: "Set balance" },
    { key: "add", label: "Add cash" },
    { key: "remove", label: "Remove cash" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 lg:pl-[17rem]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-6 w-full max-w-lg border border-[#24282D] bg-[#0F1317] text-[#E6E8EB] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Cash on hand</h2>
            <p className="mt-1 text-xs text-[#77808C]">
              The liquid cash your business holds. Sales and trades update it
              automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]"
            aria-label="Close cash manager"
          >
            x
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Current balance */}
          <div className="border border-[#1F5F45] bg-[#0E251B] px-4 py-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#20B26B]/70">
              Current balance
            </div>
            <div className="mt-0.5 font-data text-3xl font-bold tabular-nums text-[#20B26B]">
              {loading ? "—" : fmt(summary?.balance_cents ?? 0)}
            </div>
          </div>

          {needsMigration ? (
            <div className="border border-[#5A4A1F] bg-[#251E0E] px-3 py-2 text-xs text-[#F0B429]">
              The cash ledger needs a database migration before you can track cash.
            </div>
          ) : (
            <>
              {/* Mode tabs */}
              <div className="inline-flex w-full border border-[#24282D]">
                {modeTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setMode(tab.key);
                      setAmount(tab.key === "set" && summary
                        ? (summary.balance_cents / 100).toFixed(2)
                        : "");
                      setError(null);
                    }}
                    className={`flex-1 px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      mode === tab.key
                        ? "bg-[#20B26B] text-[#07100B]"
                        : "text-[#B8C0CC] hover:text-[#E6E8EB]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClass}>
                    {mode === "set" ? "New balance ($)" : "Amount ($)"}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <span className={labelClass}>Note (optional)</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={`mt-1 ${inputClass} placeholder:text-[#4F5863]`}
                    placeholder={
                      mode === "set"
                        ? "e.g. reconciled with bank"
                        : mode === "add"
                          ? "e.g. deposit, cash sale"
                          : "e.g. bought inventory, withdrawal"
                    }
                  />
                </label>
              </div>

              {error && (
                <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="w-full border border-[#20B26B] bg-[#20B26B] px-3 py-2 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
              >
                {submitting
                  ? "Saving…"
                  : mode === "set"
                    ? "Set balance"
                    : mode === "add"
                      ? "Add cash"
                      : "Remove cash"}
              </button>

              {/* Transaction history */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#77808C]">
                  Recent activity
                </div>
                {loading ? (
                  <div className="py-4 text-center text-xs text-[#77808C]">Loading…</div>
                ) : summary && summary.recent.length > 0 ? (
                  <ul className="max-h-64 divide-y divide-[#1E2227] overflow-y-auto border border-[#24282D]">
                    {summary.recent.map((tx) => {
                      const positive = tx.amount_cents >= 0;
                      return (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[12px] text-[#E6E8EB]">
                              {tx.note || KIND_LABELS[tx.kind]}
                            </div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-[#77808C]">
                              {KIND_LABELS[tx.kind]} · {formatDate(tx.occurred_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-data text-[13px] font-semibold tabular-nums ${
                                positive ? "text-[#20B26B]" : "text-[#E05C5C]"
                              }`}
                            >
                              {positive ? "+" : "−"}
                              {fmt(Math.abs(tx.amount_cents))}
                            </span>
                            {!tx.source_type ? (
                              <button
                                type="button"
                                onClick={() => void handleDelete(tx)}
                                className="px-1 text-[#5A626E] hover:text-[#E05C5C]"
                                aria-label="Remove entry"
                                title="Remove entry"
                              >
                                x
                              </button>
                            ) : (
                              <span className="w-[14px]" aria-hidden="true" />
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="border border-[#24282D] py-4 text-center text-xs text-[#77808C]">
                    No cash activity yet. Set your starting balance above.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
