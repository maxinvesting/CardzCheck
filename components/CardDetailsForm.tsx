"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MicButton } from "@/components/ui/MicButton";
import { CollectionItem, CONDITION_OPTIONS, type AcquisitionType } from "@/types";
import { formatCurrency, formatPct, computeGainLoss } from "@/lib/formatters";
import { getEstCmv } from "@/lib/values";
import { usePsaLookup, type PsaLookupResult } from "@/hooks/usePsaLookup";

interface CardDetailsFormProps {
  card: CollectionItem;
  onUpdate: (updates: Partial<CollectionItem>) => void;
  onSave: () => void;
  saving?: boolean;
  defaultEditing?: boolean;
  onExitEdit?: () => void;
}

export default function CardDetailsForm({
  card,
  onUpdate,
  onSave,
  saving = false,
  defaultEditing = false,
  onExitEdit,
}: CardDetailsFormProps) {
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const [pendingPsaResult, setPendingPsaResult] = useState<PsaLookupResult | null>(null);
  const { lookup, lookupImmediate, isLoading: psaLoading, result: psaResult, error: psaError, clearResult: clearPsa } = usePsaLookup();
  const router = useRouter();

  useEffect(() => {
    if (psaResult) setPendingPsaResult(psaResult);
  }, [psaResult]);

  const cmv = getEstCmv(card);
  const gainLoss = computeGainLoss(cmv, card.purchase_price);
  const acquisitionType = card.acquisition_type || "unknown";

  const handleSave = async () => {
    await onSave();
    setIsEditing(false);
    onExitEdit?.();
  };

  if (!isEditing) {
    const handleRunSearch = () => {
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
              onClick={handleRunSearch}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
            >
              Run Search
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
            label="Acquisition"
            value={acquisitionType.charAt(0).toUpperCase() + acquisitionType.slice(1)}
          />
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
            label="Est. Market Value"
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cert Number
              </label>
              {card.cert_number && (
                <button
                  type="button"
                  onClick={() => lookupImmediate(card.cert_number!)}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Lookup ↗
                </button>
              )}
            </div>
            <input
              type="text"
              value={card.cert_number || ""}
              onChange={(e) => {
                onUpdate({ cert_number: e.target.value });
                if (pendingPsaResult || psaError) {
                  setPendingPsaResult(null);
                  clearPsa();
                }
                lookup(e.target.value);
              }}
              onBlur={(e) => lookup(e.target.value)}
              placeholder="Certification number"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {psaLoading && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                <span className="inline-block h-3 w-3 rounded-full border border-gray-400 border-t-transparent animate-spin" />
                Looking up cert...
              </p>
            )}
            {psaError && (
              <p className="mt-1 text-[11px] text-[#E24B4A]">
                Cert not found. Check the number and try again.
              </p>
            )}
            {pendingPsaResult && (
              <div className="mt-2 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 space-y-2">
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                  PSA lookup found: {pendingPsaResult.player_name}
                  {pendingPsaResult.grade ? `, ${pendingPsaResult.grade}` : ""}
                </p>
                <p className="text-[11px] text-green-600 dark:text-green-500">Update these fields?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const updates: Partial<CollectionItem> = { grading_company: "PSA" };
                      if (pendingPsaResult.player_name) updates.player_name = pendingPsaResult.player_name;
                      if (pendingPsaResult.year) updates.year = pendingPsaResult.year;
                      if (pendingPsaResult.set_name) updates.set_name = pendingPsaResult.set_name;
                      if (pendingPsaResult.card_number) updates.card_number = pendingPsaResult.card_number;
                      if (pendingPsaResult.grade) updates.grade = pendingPsaResult.grade;
                      if (pendingPsaResult.parallel_type) updates.parallel_type = pendingPsaResult.parallel_type;
                      onUpdate(updates);
                      setPendingPsaResult(null);
                      clearPsa();
                    }}
                    className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingPsaResult(null); clearPsa(); }}
                    className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-md"
                  >
                    Keep existing
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormSelect
            label="Acquisition Type"
            value={acquisitionType}
            onChange={(value) =>
              onUpdate({
                acquisition_type: value as AcquisitionType,
                purchase_price: value === "pulled" ? null : card.purchase_price,
              })
            }
            options={[
              { label: "Pulled", value: "pulled" },
              { label: "Bought", value: "bought" },
              { label: "Trade", value: "trade" },
              { label: "Gift", value: "gift" },
              { label: "Unknown", value: "unknown" },
            ]}
          />
          <FormField
            label="Purchase Date"
            type="date"
            value={card.purchase_date || ""}
            onChange={(purchase_date) => onUpdate({ purchase_date })}
          />
        </div>

        {acquisitionType !== "pulled" && (
          <FormField
            label="Purchase Price"
            type="number"
            value={card.purchase_price?.toString() || ""}
            onChange={(value) =>
              onUpdate({ purchase_price: value ? parseFloat(value) : null })
            }
            placeholder="0.00"
          />
        )}

        <FormTextArea
          label="Notes"
          value={card.notes || ""}
          onChange={(notes) => onUpdate({ notes })}
          placeholder="Additional notes about this card..."
          rows={4}
          onVoiceInput={(text) => onUpdate({ notes: text })}
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
          onClick={() => { setIsEditing(false); onExitEdit?.(); }}
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
  onVoiceInput,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  onVoiceInput?: (text: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        {onVoiceInput && <MicButton onResult={onVoiceInput} size="sm" />}
      </div>
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
