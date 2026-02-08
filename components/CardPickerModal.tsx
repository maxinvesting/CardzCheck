"use client";

import CardPicker, { type CardPickerMode, type CardPickerSelection } from "@/components/CardPicker";

interface CardPickerModalProps {
  isOpen: boolean;
  title: string;
  mode: CardPickerMode;
  onClose: () => void;
  onSelect: (card: CardPickerSelection) => void;
  error?: string | null;
  busy?: boolean;
}

export default function CardPickerModal({
  isOpen,
  title,
  mode,
  onClose,
  onSelect,
  error,
  busy = false,
}: CardPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <CardPicker mode={mode} onSelect={onSelect} disabled={busy} />
        </div>
      </div>
    </div>
  );
}
