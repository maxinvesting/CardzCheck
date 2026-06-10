"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { BusinessInventoryItem } from "@/types";

export type TradeOutgoingPayload = {
  inventory_item_id: string;
  fair_value_cents: number;
};

export type TradeIncomingPayload = {
  card_id: string | null;
  title: string;
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  parallel_type: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: string | null;
  fair_value_cents: number;
  allocated_cost_basis_cents: number;
  image_url: string | null;
};

export type TradeFormPayload = {
  /** Legacy single-item shape — kept for callers that still send it. */
  inventory_item_id?: string;
  fair_value_cents?: number;
  /** Multi-card payload (preferred). */
  outgoing?: TradeOutgoingPayload[];
  incoming?: TradeIncomingPayload[];
  traded_at: string;
  partner_name: string | null;
  cash_paid_cents: number;
  cash_received_cents: number;
  notes: string | null;
};

interface TradeFormModalProps {
  /** When provided, modal opens pre-filled with this item on the outgoing side. */
  item?: BusinessInventoryItem | null;
  /** Active inventory available for trade-out selection. */
  availableItems: BusinessInventoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: TradeFormPayload) => Promise<void> | void;
}

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function centsToInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function formatMoney(cents: number): string {
  return MONEY_FORMATTER.format(cents / 100);
}

interface OutgoingRow {
  id: string;
  itemId: string;
  fairValue: string;
}

interface IncomingRow {
  id: string;
  card_id: string | null;
  player_name: string;
  year: string;
  set_name: string;
  parallel_type: string;
  card_number: string;
  grade: string;
  grading_company: string;
  cert_number: string;
  image_url: string | null;
  fairValue: string;
  lookupBusy: boolean;
  lookupError: string | null;
}

function blankIncoming(): IncomingRow {
  return {
    id: `in-${Math.random().toString(36).slice(2, 10)}`,
    card_id: null,
    player_name: "",
    year: "",
    set_name: "",
    parallel_type: "",
    card_number: "",
    grade: "",
    grading_company: "",
    cert_number: "",
    image_url: null,
    fairValue: "",
    lookupBusy: false,
    lookupError: null,
  };
}

function buildIncomingTitle(row: IncomingRow): string {
  const parts = [
    row.year,
    row.set_name,
    row.player_name,
    row.parallel_type,
    row.card_number ? `#${row.card_number}` : null,
  ]
    .map((v) => (v ? String(v).trim() : ""))
    .filter(Boolean);
  return parts.join(" ").trim() || row.player_name.trim() || "Trade-in card";
}

export default function TradeFormModal({
  item,
  availableItems,
  isOpen,
  onClose,
  onSubmit,
}: TradeFormModalProps) {
  const [tradedAt, setTradedAt] = useState(new Date().toISOString().slice(0, 10));
  const [partnerName, setPartnerName] = useState("");
  const [cashPaid, setCashPaid] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [tradeFee, setTradeFee] = useState("");
  const [notes, setNotes] = useState("");
  const [outgoing, setOutgoing] = useState<OutgoingRow[]>([]);
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTradedAt(new Date().toISOString().slice(0, 10));
    setPartnerName("");
    setCashPaid("");
    setCashReceived("");
    setTradeFee("");
    setNotes("");
    setError(null);
    if (item) {
      const defaultFair =
        item.current_market_value_cents ?? item.list_price_cents ?? item.cost_basis_total_cents ?? null;
      setOutgoing([
        {
          id: `out-${item.id}`,
          itemId: item.id,
          fairValue: centsToInput(defaultFair),
        },
      ]);
    } else {
      setOutgoing([]);
    }
    setIncoming([]);
  }, [isOpen, item]);

  const itemsById = useMemo(() => {
    const map = new Map<string, BusinessInventoryItem>();
    for (const it of availableItems) map.set(it.id, it);
    return map;
  }, [availableItems]);

  const outgoingBasisCents = useMemo(
    () =>
      outgoing.reduce((acc, row) => {
        const it = itemsById.get(row.itemId);
        return acc + Math.max(0, Number(it?.cost_basis_total_cents ?? 0));
      }, 0),
    [outgoing, itemsById]
  );
  const cashPaidCents = inputToCents(cashPaid);
  const cashReceivedCents = inputToCents(cashReceived);
  const tradeFeeCents = inputToCents(tradeFee);

  // Total cost basis that rolls into the cards received: the basis of what we
  // gave away, plus net cash out, plus any (online) trade fee. We never type a
  // basis for an incoming card — it's derived from the economics of the trade.
  const incomingBasisPoolCents = Math.max(
    0,
    outgoingBasisCents + cashPaidCents - cashReceivedCents + tradeFeeCents
  );

  // Spread the basis pool across incoming cards in proportion to their
  // estimated value (even split if no estimates yet). Rounding remainder lands
  // on the last row so the allocation always sums back to the pool exactly.
  const allocatedBasisById = useMemo(() => {
    const map = new Map<string, number>();
    if (incoming.length === 0) return map;
    const estimates = incoming.map((r) => Math.max(0, inputToCents(r.fairValue)));
    const totalEst = estimates.reduce((a, c) => a + c, 0);
    let allocated = 0;
    incoming.forEach((row, i) => {
      let cents: number;
      if (i === incoming.length - 1) {
        cents = incomingBasisPoolCents - allocated;
      } else if (totalEst > 0) {
        cents = Math.round((incomingBasisPoolCents * estimates[i]) / totalEst);
      } else {
        cents = Math.round(incomingBasisPoolCents / incoming.length);
      }
      cents = Math.max(0, cents);
      map.set(row.id, cents);
      allocated += cents;
    });
    return map;
  }, [incoming, incomingBasisPoolCents]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen) return null;
  if (!mounted) return null;

  function addOutgoingRow() {
    setOutgoing((prev) => [
      ...prev,
      { id: `out-${Math.random().toString(36).slice(2, 10)}`, itemId: "", fairValue: "" },
    ]);
  }

  function updateOutgoing(id: string, patch: Partial<OutgoingRow>) {
    setOutgoing((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function selectOutgoingItem(id: string, itemId: string) {
    const it = itemsById.get(itemId);
    const defaultFair =
      it?.current_market_value_cents ?? it?.list_price_cents ?? it?.cost_basis_total_cents ?? null;
    setOutgoing((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              itemId,
              fairValue: r.fairValue || centsToInput(defaultFair),
            }
          : r
      )
    );
  }

  function removeOutgoing(id: string) {
    setOutgoing((prev) => prev.filter((r) => r.id !== id));
  }

  function updateIncoming(id: string, patch: Partial<IncomingRow>) {
    setIncoming((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeIncoming(id: string) {
    setIncoming((prev) => prev.filter((r) => r.id !== id));
  }

  function addIncomingRow() {
    setIncoming((prev) => [...prev, blankIncoming()]);
  }

  async function lookupIncomingCert(id: string) {
    const row = incoming.find((r) => r.id === id);
    if (!row) return;
    const cert = row.cert_number.trim();
    if (!cert) {
      updateIncoming(id, { lookupError: "Enter a PSA cert number first" });
      return;
    }
    updateIncoming(id, { lookupBusy: true, lookupError: null });
    try {
      const res = await fetch("/api/psa/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certNumber: cert }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.found) {
        const msg = data?.error || "Cert not found";
        updateIncoming(id, { lookupBusy: false, lookupError: msg });
        return;
      }
      setIncoming((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                player_name: data.player_name ?? r.player_name,
                year: data.year ?? r.year,
                set_name: data.set_name ?? r.set_name,
                card_number: data.card_number ?? r.card_number,
                parallel_type: data.parallel_type ?? r.parallel_type,
                grade: data.grade ?? r.grade,
                grading_company: data.grading_company ?? r.grading_company ?? "PSA",
                lookupBusy: false,
                lookupError: null,
              }
            : r
        )
      );
    } catch (err) {
      updateIncoming(id, {
        lookupBusy: false,
        lookupError: err instanceof Error ? err.message : "Lookup failed",
      });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (outgoing.length === 0) {
      setError("Add at least one card you are trading away.");
      return;
    }
    const cleanOutgoing: TradeOutgoingPayload[] = [];
    for (const row of outgoing) {
      if (!row.itemId) {
        setError("Pick an inventory item for every outgoing row.");
        return;
      }
      const fair = inputToCents(row.fairValue);
      if (fair <= 0) {
        setError("Enter a fair value for every outgoing card.");
        return;
      }
      cleanOutgoing.push({ inventory_item_id: row.itemId, fair_value_cents: fair });
    }
    const seenOut = new Set<string>();
    for (const o of cleanOutgoing) {
      if (seenOut.has(o.inventory_item_id)) {
        setError("Each outgoing card can only be added once.");
        return;
      }
      seenOut.add(o.inventory_item_id);
    }

    const cleanIncoming: TradeIncomingPayload[] = [];
    for (const row of incoming) {
      const hasAnyField =
        row.player_name.trim() ||
        row.set_name.trim() ||
        row.year.trim() ||
        row.card_number.trim() ||
        row.fairValue.trim();
      if (!hasAnyField) continue; // skip completely-empty rows
      if (!row.player_name.trim() && !row.set_name.trim()) {
        setError("Each incoming card needs a player name or set.");
        return;
      }
      const fair = inputToCents(row.fairValue);
      if (fair <= 0) {
        setError("Enter an estimated value for every incoming card.");
        return;
      }
      const basis = allocatedBasisById.get(row.id) ?? fair;
      cleanIncoming.push({
        card_id: row.card_id,
        title: buildIncomingTitle(row),
        player_name: row.player_name.trim() || null,
        year: row.year.trim() || null,
        set_name: row.set_name.trim() || null,
        parallel_type: row.parallel_type.trim() || null,
        card_number: row.card_number.trim() || null,
        grade: row.grade.trim() || null,
        grading_company: row.grading_company.trim() || null,
        fair_value_cents: fair,
        allocated_cost_basis_cents: basis,
        image_url: row.image_url,
      });
    }

    setSubmitting(true);
    try {
      await onSubmit({
        outgoing: cleanOutgoing,
        incoming: cleanIncoming,
        traded_at: tradedAt,
        partner_name: partnerName.trim() ? partnerName.trim() : null,
        cash_paid_cents: cashPaidCents,
        cash_received_cents: cashReceivedCents,
        notes: notes.trim() ? notes.trim() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record trade");
    } finally {
      setSubmitting(false);
    }
  }

  const labelClass = "block text-xs font-medium text-[#77808C]";
  const inputClass =
    "w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]";

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 lg:pl-[17rem]"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="my-6 w-full max-w-4xl border border-[#24282D] bg-[#0F1317] text-[#E6E8EB] shadow-2xl">
          <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Record trade</h2>
              <p className="mt-1 text-xs text-[#77808C]">
                Track cards going out, cards coming in, and any cash on either side.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]"
              aria-label="Close trade modal"
            >
              x
            </button>
          </div>

          <form
            onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const target = event.target as HTMLElement | null;
              if (!target) return;
              const tag = target.tagName;
              if (tag === "TEXTAREA") return;
              if (tag === "BUTTON" && (target as HTMLButtonElement).type === "submit") return;
              event.preventDefault();
            }}
            className="space-y-5 px-5 py-5"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Trade date</span>
                <input
                  type="date"
                  value={tradedAt}
                  onChange={(e) => setTradedAt(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label>
                <span className={labelClass}>Trade partner</span>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Optional"
                  className={`mt-1 ${inputClass} placeholder:text-[#4F5863]`}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* ── Cards out ───────────────────────────────────────── */}
              <div className="border border-[#24282D] bg-[#0B0D0F]">
                <div className="flex items-center justify-between border-b border-[#24282D] px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#E6E8EB]">
                    Cards out
                  </div>
                  <button
                    type="button"
                    onClick={addOutgoingRow}
                    className="border border-[#343941] px-2 py-1 text-[11px] text-[#B8C0CC] hover:text-[#E6E8EB] hover:border-[#5A626E]"
                  >
                    + Add card
                  </button>
                </div>
                <div className="divide-y divide-[#24282D]">
                  {outgoing.length === 0 && (
                    <div className="px-3 py-4 text-xs text-[#77808C]">
                      Pick a card from your active inventory to trade away.
                    </div>
                  )}
                  {outgoing.map((row) => {
                    const it = itemsById.get(row.itemId);
                    const basisCents = it?.cost_basis_total_cents ?? 0;
                    return (
                      <div key={row.id} className="space-y-2 px-3 py-3">
                        <div className="flex items-start gap-2">
                          <select
                            value={row.itemId}
                            onChange={(e) => selectOutgoingItem(row.id, e.target.value)}
                            className={`${inputClass} flex-1`}
                          >
                            <option value="">Select inventory card…</option>
                            {availableItems.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.title}
                                {opt.grade ? ` (${opt.grading_company ?? ""} ${opt.grade})` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeOutgoing(row.id)}
                            className="px-2 text-lg leading-none text-[#77808C] hover:text-[#E05C5C]"
                            aria-label="Remove outgoing card"
                          >
                            x
                          </button>
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex-1">
                            <span className={labelClass}>Fair value ($)</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.fairValue}
                              onChange={(e) => updateOutgoing(row.id, { fairValue: e.target.value })}
                              className={`mt-1 ${inputClass}`}
                            />
                          </label>
                          <div className="text-[11px] text-[#77808C]">
                            Basis {formatMoney(basisCents)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Cards in ───────────────────────────────────────── */}
              <div className="border border-[#24282D] bg-[#0B0D0F]">
                <div className="flex items-center justify-between border-b border-[#24282D] px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#E6E8EB]">
                    Cards in
                  </div>
                  <button
                    type="button"
                    onClick={addIncomingRow}
                    className="border border-[#343941] px-2 py-1 text-[11px] text-[#B8C0CC] hover:text-[#E6E8EB] hover:border-[#5A626E]"
                  >
                    + Add card
                  </button>
                </div>
                <div className="divide-y divide-[#24282D]">
                  {incoming.length === 0 && (
                    <div className="px-3 py-4 text-xs text-[#77808C]">
                      Add cards you are receiving — look up by PSA cert # or enter manually. Cash-only trades are fine — leave this empty.
                    </div>
                  )}
                  {incoming.map((row, idx) => (
                    <div key={row.id} className="space-y-3 px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#77808C]">
                          Card {idx + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeIncoming(row.id)}
                          className="px-2 text-lg leading-none text-[#77808C] hover:text-[#E05C5C]"
                          aria-label="Remove incoming card"
                        >
                          x
                        </button>
                      </div>

                      {/* PSA cert lookup */}
                      <div className="flex items-end gap-2">
                        <label className="flex-1">
                          <span className={labelClass}>PSA cert # (optional)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.cert_number}
                            onChange={(e) =>
                              updateIncoming(row.id, { cert_number: e.target.value })
                            }
                            placeholder="e.g. 12345678"
                            className={`mt-1 ${inputClass} placeholder:text-[#4F5863]`}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void lookupIncomingCert(row.id)}
                          disabled={row.lookupBusy || !row.cert_number.trim()}
                          className="border border-[#343941] px-3 py-2 text-[11px] font-semibold text-[#B8C0CC] hover:text-[#E6E8EB] hover:border-[#5A626E] disabled:opacity-50"
                        >
                          {row.lookupBusy ? "Looking up…" : "Look up"}
                        </button>
                      </div>
                      {row.lookupError && (
                        <div className="text-[11px] text-[#E05C5C]">{row.lookupError}</div>
                      )}

                      {/* Manual card fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          <span className={labelClass}>Player</span>
                          <input
                            type="text"
                            value={row.player_name}
                            onChange={(e) =>
                              updateIncoming(row.id, { player_name: e.target.value })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Year</span>
                          <input
                            type="text"
                            value={row.year}
                            onChange={(e) => updateIncoming(row.id, { year: e.target.value })}
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label className="col-span-2">
                          <span className={labelClass}>Set</span>
                          <input
                            type="text"
                            value={row.set_name}
                            onChange={(e) =>
                              updateIncoming(row.id, { set_name: e.target.value })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Card #</span>
                          <input
                            type="text"
                            value={row.card_number}
                            onChange={(e) =>
                              updateIncoming(row.id, { card_number: e.target.value })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Parallel / variant</span>
                          <input
                            type="text"
                            value={row.parallel_type}
                            onChange={(e) =>
                              updateIncoming(row.id, { parallel_type: e.target.value })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Grader</span>
                          <input
                            type="text"
                            value={row.grading_company}
                            onChange={(e) =>
                              updateIncoming(row.id, { grading_company: e.target.value })
                            }
                            placeholder="PSA, BGS, SGC…"
                            className={`mt-1 ${inputClass} placeholder:text-[#4F5863]`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Grade</span>
                          <input
                            type="text"
                            value={row.grade}
                            onChange={(e) => updateIncoming(row.id, { grade: e.target.value })}
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                      </div>

                      {/* Values */}
                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          <span className={labelClass}>Estimated value ($)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.fairValue}
                            onChange={(e) =>
                              updateIncoming(row.id, { fairValue: e.target.value })
                            }
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <div>
                          <span className={labelClass}>Cost basis (auto)</span>
                          <div className="mt-1 flex h-[38px] items-center border border-[#24282D] bg-[#0B0D0F] px-3 text-sm tabular-nums text-[#B8C0CC]">
                            {formatMoney(allocatedBasisById.get(row.id) ?? 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label>
                <span className={labelClass}>Cash paid ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashPaid}
                  onChange={(e) => setCashPaid(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label>
                <span className={labelClass}>Cash received ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label>
                <span className={labelClass}>Trade fee ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tradeFee}
                  onChange={(e) => setTradeFee(e.target.value)}
                  placeholder="Online trades"
                  className={`mt-1 ${inputClass} placeholder:text-[#4F5863]`}
                />
              </label>
            </div>

            <div className="border border-[#24282D] bg-[#090B0D] p-3 text-xs">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#77808C]">
                Cost basis carried into received cards
              </div>
              <div className="flex justify-between text-[#77808C]">
                <span>Basis of cards given away</span>
                <span className="font-data tabular-nums">{formatMoney(outgoingBasisCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>+ Cash paid</span>
                <span className="font-data tabular-nums">{formatMoney(cashPaidCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>− Cash received</span>
                <span className="font-data tabular-nums">{formatMoney(cashReceivedCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>+ Trade fee</span>
                <span className="font-data tabular-nums">{formatMoney(tradeFeeCents)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-[#24282D] pt-2 text-[#E6E8EB]">
                <span className="font-semibold">Total basis to allocate</span>
                <span className="font-data font-semibold tabular-nums text-[#20B26B]">
                  {formatMoney(incomingBasisPoolCents)}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[#5A626E]">
                Split across received cards by estimated value. No gain is realized at
                trade time — it&apos;s recognized when these cards later sell.
              </p>
            </div>

            <label>
              <span className={labelClass}>Notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`mt-1 resize-none ${inputClass}`}
              />
            </label>

            {error && (
              <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
                {error}
              </div>
            )}

            <div className="flex gap-2 border-t border-[#24282D] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-[#343941] px-3 py-2 text-sm font-medium text-[#B8C0CC] hover:text-[#E6E8EB]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || outgoing.length === 0}
                className="flex-1 border border-[#20B26B] bg-[#20B26B] px-3 py-2 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
              >
                {submitting ? "Recording…" : "Record trade"}
              </button>
            </div>
          </form>
        </div>
      </div>

    </>,
    document.body
  );
}
