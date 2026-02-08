"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CollectionItem, CONDITION_OPTIONS } from "@/types";
import { formatCurrency, formatPct, computeGainLoss } from "@/lib/formatters";
import { getEstCmv } from "@/lib/values";

interface CardDetailsFormProps {
  card: CollectionItem;
  onUpdate: (updates: Partial<CollectionItem>) => void;
  onSave: () => void;
  saving?: boolean;
}

export default function CardDetailsForm({
  card,
  onUpdate,
  onSave,
  saving = false,
}: CardDetailsFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const router = useRouter();

  const cmv = getEstCmv(card);
  const gainLoss = computeGainLoss(cmv, card.purchase_price);

  const handleSave = async () => {
    await onSave();
    setIsEditing(false);
  };

  if (!isEditing) {
    const handleRunComps = () => {
      const params = new URLSearchParams();
      params.set("player", card.player_name);
      if (card.year) params.set("year", card.year);
      if (card.set_name) params.set("set", card.set_name);
      if (card.grade) params.set("grade", card.grade);
      params.set("card_id", card.id);
      router.push(`/comps?${params.toString()}`);
    };

    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Card Details
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunComps}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
            >
              Run Comps
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailRow label="Player" value={card.player_name || "—"} />
          <DetailRow label="Year" value={card.year || "—"} />
          <DetailRow label="Set" value={card.set_name || "—"} />
          <DetailRow label="Insert/Variant" value={card.insert || "—"} />
          <DetailRow label="Grade" value={card.grade || "—"} />
          <DetailRow
            label="Grading Company"
            value={card.grading_company || "—"}
          />
          <DetailRow label="Cert #" value={card.cert_number || "—"} />
          <DetailRow
            label="Purchase Price"
            value={formatCurrency(card.purchase_price)}
          />
          <DetailRow
            label="Purchase Date"
            value={
              card.purchase_date
                ? new Date(card.purchase_date).toLocaleDateString()
                : "—"
            }
          />
          <DetailRow
            label="Current Market Value"
            value={formatCurrency(cmv)}
            className={cmv ? "font-semibold" : ""}
          />
          {gainLoss && (
            <>
              <DetailRow
                label="Gain/Loss"
                value={formatCurrency(gainLoss.amount)}
                className={
                  gainLoss.amount >= 0 ? "text-green-600" : "text-red-600"
                }
              />
              <DetailRow
                label="Gain/Loss %"
                value={formatPct(gainLoss.pct)}
                className={
                  gainLoss.pct >= 0 ? "text-green-600" : "text-red-600"
                }
              />
            </>
          )}
        </div>

        {card.notes && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {card.notes}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Edit Card Details
        </h2>
      </div>

      <div className="space-y-4">
        <FormField
          label="Player Name"
          value={card.player_name || ""}
          onChange={(player_name) => onUpdate({ player_name })}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Year"
            value={card.year || ""}
            onChange={(year) => onUpdate({ year })}
          />
          <FormField
            label="Set Name"
            value={card.set_name || ""}
            onChange={(set_name) => onUpdate({ set_name })}
          />
        </div>

        <FormField
          label="Insert/Variant"
          value={card.insert || ""}
          onChange={(insert) => onUpdate({ insert })}
          placeholder="e.g., Downtown, Prizm Silver"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormSelect
            label="Grade/Condition"
            value={card.grade || ""}
            onChange={(grade) => {
              // Extract grading company from the grade value
              const grading_company = grade.split(" ")[0];
              onUpdate({
                grade,
                grading_company:
                  grading_company !== "Raw" ? grading_company : null,
              });
            }}
            options={CONDITION_OPTIONS.map((opt) => ({
              label: opt.label,
              value: opt.value,
            }))}
          />
          <FormField
            label="Cert Number"
            value={card.cert_number || ""}
            onChange={(cert_number) => onUpdate({ cert_number })}
            placeholder="Certification number"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Purchase Price"
            type="number"
            value={card.purchase_price?.toString() || ""}
            onChange={(value) =>
              onUpdate({ purchase_price: value ? parseFloat(value) : null })
            }
            placeholder="0.00"
          />
          <FormField
            label="Purchase Date"
            type="date"
            value={card.purchase_date || ""}
            onChange={(purchase_date) => onUpdate({ purchase_date })}
          />
        </div>

        <FormTextArea
          label="Notes"
          value={card.notes || ""}
          onChange={(notes) => onUpdate({ notes })}
          placeholder="Additional notes about this card..."
          rows={4}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !card.player_name}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          disabled={saving}
          className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </p>
      <p
        className={`text-sm text-gray-900 dark:text-white ${className}`}
      >
        {value}
      </p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormTextArea({
  label,
  value,
  onChange,
  placeholder = "",
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}
