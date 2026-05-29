"use client";

import { useState } from "react";

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned", "traded"];
const CHANNEL_OPTIONS = ["", "ebay", "whatnot", "instagram", "show", "local", "other", "veriswap"];

export type LedgerBulkAction =
  | { type: "status"; value: string }
  | { type: "channel"; value: string | null }
  | { type: "list_price_cents"; value: number | null }
  | { type: "delete" };

interface Props {
  selectedCount: number;
  isWorking: boolean;
  onClear: () => void;
  onApply: (action: LedgerBulkAction) => Promise<void> | void;
}

export default function LedgerBulkActionsBar({
  selectedCount,
  isWorking,
  onClear,
  onApply,
}: Props) {
  const [statusValue, setStatusValue] = useState("");
  const [channelValue, setChannelValue] = useState("");
  const [priceValue, setPriceValue] = useState("");

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border border-[#343941] bg-[#0F1216] px-3 py-2 text-[12px] text-[#B8C0CC]">
      <div className="font-semibold text-[#E6E8EB]">
        {selectedCount} selected
      </div>

      <div className="flex items-center gap-1">
        <label className="text-[10px] uppercase tracking-wide text-[#77808C]">Status</label>
        <select
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value)}
          className="bg-[#0B0D0F] border border-[#343941] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
          disabled={isWorking}
        >
          <option value="">—</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isWorking || !statusValue}
          onClick={() => onApply({ type: "status", value: statusValue })}
          className="border border-[#343941] px-2 py-1 text-[11px] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="flex items-center gap-1">
        <label className="text-[10px] uppercase tracking-wide text-[#77808C]">Channel</label>
        <select
          value={channelValue}
          onChange={(e) => setChannelValue(e.target.value)}
          className="bg-[#0B0D0F] border border-[#343941] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
          disabled={isWorking}
        >
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c || "_blank"} value={c}>
              {c === "" ? "(clear)" : c}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isWorking}
          onClick={() =>
            onApply({ type: "channel", value: channelValue === "" ? null : channelValue })
          }
          className="border border-[#343941] px-2 py-1 text-[11px] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="flex items-center gap-1">
        <label className="text-[10px] uppercase tracking-wide text-[#77808C]">Price ($)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={priceValue}
          onChange={(e) => setPriceValue(e.target.value)}
          placeholder="empty = clear"
          className="w-24 bg-[#0B0D0F] border border-[#343941] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
          disabled={isWorking}
        />
        <button
          type="button"
          disabled={isWorking}
          onClick={() => {
            const trimmed = priceValue.trim();
            if (trimmed === "") {
              void onApply({ type: "list_price_cents", value: null });
              return;
            }
            const num = Number(trimmed);
            if (!Number.isFinite(num) || num < 0) return;
            void onApply({ type: "list_price_cents", value: Math.round(num * 100) });
          }}
          className="border border-[#343941] px-2 py-1 text-[11px] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${selectedCount} item${selectedCount === 1 ? "" : "s"}?`)) {
              void onApply({ type: "delete" });
            }
          }}
          disabled={isWorking}
          className="border border-[#5C2228] bg-[#1A0F11] px-2 py-1 text-[11px] text-[#E05C5C] hover:bg-[#2A1518] disabled:opacity-40"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={isWorking}
          className="border border-[#343941] px-2 py-1 text-[11px] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-40"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
