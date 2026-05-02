"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { BusinessInventoryItem } from "@/types";

export type TradeFormPayload = {
  inventory_item_id: string;
  traded_at: string;
  partner_name: string | null;
  fair_value_cents: number;
  cash_paid_cents: number;
  cash_received_cents: number;
  notes: string | null;
};

interface TradeFormModalProps {
  item: BusinessInventoryItem | null;
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

export default function TradeFormModal({
  item,
  isOpen,
  onClose,
  onSubmit,
}: TradeFormModalProps) {
  const defaultFairValue =
    item?.current_market_value_cents ?? item?.list_price_cents ?? item?.cost_basis_total_cents ?? null;
  const [tradedAt, setTradedAt] = useState(new Date().toISOString().slice(0, 10));
  const [partnerName, setPartnerName] = useState("");
  const [fairValue, setFairValue] = useState(centsToInput(defaultFairValue));
  const [cashPaid, setCashPaid] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    const nextDefault =
      item.current_market_value_cents ?? item.list_price_cents ?? item.cost_basis_total_cents ?? null;
    setTradedAt(new Date().toISOString().slice(0, 10));
    setPartnerName("");
    setFairValue(centsToInput(nextDefault));
    setCashPaid("");
    setCashReceived("");
    setNotes("");
  }, [isOpen, item]);

  const basisCents = item?.cost_basis_total_cents ?? 0;
  const fairValueCents = inputToCents(fairValue);
  const cashPaidCents = inputToCents(cashPaid);
  const cashReceivedCents = inputToCents(cashReceived);
  const realizedGainCents = useMemo(
    () => fairValueCents + cashReceivedCents - cashPaidCents - basisCents,
    [basisCents, cashPaidCents, cashReceivedCents, fairValueCents]
  );

  if (!isOpen || !item) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!item || fairValueCents <= 0) return;

    setSubmitting(true);
    try {
      await onSubmit({
        inventory_item_id: item.id,
        traded_at: tradedAt,
        partner_name: partnerName.trim() ? partnerName.trim() : null,
        fair_value_cents: fairValueCents,
        cash_paid_cents: cashPaidCents,
        cash_received_cents: cashReceivedCents,
        notes: notes.trim() ? notes.trim() : null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden border border-[#24282D] bg-[#0F1317] text-[#E6E8EB] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Record trade</h2>
            <p className="mt-1 truncate text-xs text-[#77808C]">{item.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]"
          >
            x
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="block text-xs font-medium text-[#77808C]">Trade date</span>
              <input
                type="date"
                value={tradedAt}
                onChange={(event) => setTradedAt(event.target.value)}
                className="mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]"
              />
            </label>
            <label>
              <span className="block text-xs font-medium text-[#77808C]">Trade partner</span>
              <input
                type="text"
                value={partnerName}
                onChange={(event) => setPartnerName(event.target.value)}
                placeholder="Optional"
                className="mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none placeholder:text-[#4F5863] focus:border-[#20B26B]"
              />
            </label>
          </div>

          <label>
            <span className="block text-xs font-medium text-[#77808C]">
              Incoming trade value ($)
            </span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={fairValue}
              onChange={(event) => setFairValue(event.target.value)}
              className="mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="block text-xs font-medium text-[#77808C]">Cash paid ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashPaid}
                onChange={(event) => setCashPaid(event.target.value)}
                className="mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]"
              />
            </label>
            <label>
              <span className="block text-xs font-medium text-[#77808C]">
                Cash received ($)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashReceived}
                onChange={(event) => setCashReceived(event.target.value)}
                className="mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]"
              />
            </label>
          </div>

          <div className="border border-[#24282D] bg-[#090B0D] p-3 text-xs">
            <div className="flex justify-between text-[#77808C]">
              <span>Outgoing basis</span>
              <span className="font-data tabular-nums">{formatMoney(basisCents)}</span>
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
            <span className="block text-xs font-medium text-[#77808C]">Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 w-full resize-none border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] outline-none focus:border-[#20B26B]"
            />
          </label>

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
              disabled={submitting || fairValueCents <= 0}
              className="flex-1 border border-[#20B26B] bg-[#20B26B] px-3 py-2 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
            >
              {submitting ? "Recording..." : "Record trade"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
