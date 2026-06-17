"use client";

import { useEffect, useState } from "react";
import CardPicker, { type CardPickerMode, type CardPickerSelection } from "@/components/CardPicker";

interface CardPickerModalProps {
  isOpen: boolean;
  title: string;
  mode: CardPickerMode;
  onClose: () => void;
  onSelect: (card: CardPickerSelection) => void;
  error?: string | null;
  busy?: boolean;
  quantityEnabled?: boolean;
  initialQuantity?: number;
}

export default function CardPickerModal({
  isOpen,
  title,
  mode,
  onClose,
  onSelect,
  error,
  busy = false,
  quantityEnabled = false,
  initialQuantity = 1,
}: CardPickerModalProps) {
  const [quantity, setQuantity] = useState(String(Math.max(1, initialQuantity || 1)));

  useEffect(() => {
    if (!isOpen || !quantityEnabled) return;
    setQuantity(String(Math.max(1, initialQuantity || 1)));
  }, [isOpen, quantityEnabled, initialQuantity]);

  const resolvedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#24282D] px-5 py-4">
          <h2 className="text-base font-semibold text-[#E6E8EB]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="px-1 text-lg leading-none text-[#77808C] transition-colors hover:text-[#E6E8EB]"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
              {error}
            </div>
          )}
          {quantityEnabled && (
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={busy}
                className="w-full max-w-32 border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none disabled:opacity-50"
              />
            </div>
          )}
          <CardPicker
            mode={mode}
            onSelect={(card) => onSelect({ ...card, quantity: quantityEnabled ? resolvedQuantity : undefined })}
            disabled={busy}
          />
        </div>
      </div>
    </div>
  );
}
