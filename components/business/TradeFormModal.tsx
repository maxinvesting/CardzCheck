"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { BusinessInventoryItem } from "@/types";
import CardPickerModal from "@/components/CardPickerModal";
import type { CardPickerSelection } from "@/components/CardPicker";

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
  title: string;
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  parallel_type: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: string | null;
  image_url: string | null;
  fairValue: string;
  costBasis: string;
}

function buildIncomingFromSelection(card: CardPickerSelection): IncomingRow {
  const titleParts = [
    card.year,
    card.set_name,
    card.player_name,
    card.variant,
    card.card_number ? `#${card.card_number}` : null,
  ].filter((s): s is string => Boolean(s && String(s).trim()));
  return {
    id: `in-${Math.random().toString(36).slice(2, 10)}`,
    card_id: card.id ?? null,
    title: titleParts.join(" ").trim() || (card.player_name ?? "New card"),
    player_name: card.player_name ?? null,
    year: card.year ?? null,
    set_name: card.set_name ?? null,
    parallel_type: card.variant ?? null,
    card_number: card.card_number ?? null,
    grade: card.grade ?? null,
    grading_company: card.grader ?? null,
    image_url: card.user_image_url ?? card.image_url ?? null,
    fairValue: "",
    costBasis: "",
  };
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
  const [notes, setNotes] = useState("");
  const [outgoing, setOutgoing] = useState<OutgoingRow[]>([]);
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTradedAt(new Date().toISOString().slice(0, 10));
    setPartnerName("");
    setCashPaid("");
    setCashReceived("");
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

  const outgoingFairCents = useMemo(
    () => outgoing.reduce((acc, row) => acc + inputToCents(row.fairValue), 0),
    [outgoing]
  );
  const outgoingBasisCents = useMemo(
    () =>
      outgoing.reduce((acc, row) => {
        const it = itemsById.get(row.itemId);
        return acc + Math.max(0, Number(it?.cost_basis_total_cents ?? 0));
      }, 0),
    [outgoing, itemsById]
  );
  const incomingBasisCents = useMemo(
    () => incoming.reduce((acc, row) => acc + inputToCents(row.costBasis), 0),
    [incoming]
  );
  const cashPaidCents = inputToCents(cashPaid);
  const cashReceivedCents = inputToCents(cashReceived);
  const realizedGainCents =
    outgoingFairCents + cashReceivedCents - cashPaidCents - outgoingBasisCents;

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
    setIncoming((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // If user updates fair value and basis is empty, mirror it
        if (patch.fairValue !== undefined && !r.costBasis) {
          next.costBasis = patch.fairValue ?? "";
        }
        return next;
      })
    );
  }

  function removeIncoming(id: string) {
    setIncoming((prev) => prev.filter((r) => r.id !== id));
  }

  function handleCardPicked(card: CardPickerSelection) {
    setIncoming((prev) => [...prev, buildIncomingFromSelection(card)]);
    setShowPicker(false);
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

    const cleanIncoming: TradeIncomingPayload[] = incoming.map((row) => {
      const fair = inputToCents(row.fairValue);
      const basis = inputToCents(row.costBasis) || fair;
      return {
        card_id: row.card_id,
        title: row.title.trim() || row.player_name || "Trade-in card",
        player_name: row.player_name,
        year: row.year,
        set_name: row.set_name,
        parallel_type: row.parallel_type,
        card_number: row.card_number,
        grade: row.grade,
        grading_company: row.grading_company,
        fair_value_cents: fair,
        allocated_cost_basis_cents: basis,
        image_url: row.image_url,
      };
    });

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
                    onClick={() => setShowPicker(true)}
                    className="border border-[#343941] px-2 py-1 text-[11px] text-[#B8C0CC] hover:text-[#E6E8EB] hover:border-[#5A626E]"
                  >
                    + Add card
                  </button>
                </div>
                <div className="divide-y divide-[#24282D]">
                  {incoming.length === 0 && (
                    <div className="px-3 py-4 text-xs text-[#77808C]">
                      Use the picker to identify cards you are receiving. Cash-only trades are fine — leave this empty.
                    </div>
                  )}
                  {incoming.map((row) => (
                    <div key={row.id} className="space-y-2 px-3 py-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) => updateIncoming(row.id, { title: e.target.value })}
                          className={`${inputClass} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeIncoming(row.id)}
                          className="px-2 text-lg leading-none text-[#77808C] hover:text-[#E05C5C]"
                          aria-label="Remove incoming card"
                        >
                          x
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          <span className={labelClass}>Fair value ($)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.fairValue}
                            onChange={(e) => updateIncoming(row.id, { fairValue: e.target.value })}
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>Cost basis ($)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.costBasis}
                            onChange={(e) => updateIncoming(row.id, { costBasis: e.target.value })}
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>

            <div className="border border-[#24282D] bg-[#090B0D] p-3 text-xs">
              <div className="flex justify-between text-[#77808C]">
                <span>Outgoing fair value</span>
                <span className="font-data tabular-nums">{formatMoney(outgoingFairCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>Outgoing basis</span>
                <span className="font-data tabular-nums">{formatMoney(outgoingBasisCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>Incoming basis</span>
                <span className="font-data tabular-nums">{formatMoney(incomingBasisCents)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[#77808C]">
                <span>Estimated realized gain</span>
                <span
                  className={`font-data font-semibold tabular-nums ${
                    realizedGainCents >= 0 ? "text-[#20B26B]" : "text-[#E05C5C]"
                  }`}
                >
                  {formatMoney(realizedGainCents)}
                </span>
              </div>
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

      <CardPickerModal
        isOpen={showPicker}
        title="Add card from trade-in"
        mode="collection"
        onClose={() => setShowPicker(false)}
        onSelect={handleCardPicked}
      />
    </>,
    document.body
  );
}
