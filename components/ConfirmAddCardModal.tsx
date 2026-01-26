"use client";

import { useState } from "react";
import {
  CONDITION_OPTIONS,
  type CardIdentificationResult,
  type GradeEstimate,
} from "@/types";
import GradeEstimateDisplay from "./GradeEstimateDisplay";

interface ConfirmAddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string) => void;
  onLimitReached: () => void;
  cardData: CardIdentificationResult | null;
}

export default function ConfirmAddCardModal({
  isOpen,
  onClose,
  onSuccess,
  onLimitReached,
  cardData,
}: ConfirmAddCardModalProps) {
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [condition, setCondition] = useState<string>("Raw");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setPurchasePrice("");
    setCondition("Raw");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleConfirm = async () => {
    if (!cardData?.player_name) {
      setError("Card data is missing");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build notes from card details
      const notesParts: string[] = [];
      if (cardData.parallel_type && cardData.parallel_type !== "Base") {
        notesParts.push(`Parallel: ${cardData.parallel_type}`);
      }
      if (cardData.card_number) {
        notesParts.push(`Card #${cardData.card_number}`);
      }
      if (cardData.serial_number) {
        notesParts.push(`Serial: ${cardData.serial_number}`);
      }
      if (cardData.variation) {
        notesParts.push(`Variation: ${cardData.variation}`);
      }

      const body = {
        player_name: cardData.player_name,
        year: cardData.year || null,
        set_name: cardData.set_name || null,
        grade: condition, // Use the selected condition
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_date: null,
        image_url: cardData.imageUrl || null,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
      };

      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "limit_reached") {
          onLimitReached();
          handleClose();
          return;
        }
        throw new Error(data.error || "Failed to add card");
      }

      onSuccess(cardData.player_name);
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !cardData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Add to Collection
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Card Preview */}
          <div className="flex gap-4">
            {/* Card Image */}
            {cardData.imageUrl && (
              <div className="flex-shrink-0">
                <img
                  src={cardData.imageUrl}
                  alt={cardData.player_name}
                  className="w-32 h-44 object-cover rounded-lg shadow-md bg-gray-200 dark:bg-gray-800"
                />
              </div>
            )}

            {/* Card Details */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {cardData.player_name}
              </h3>

              <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {cardData.year && (
                  <p>
                    <span className="text-gray-500">Year:</span> {cardData.year}
                  </p>
                )}
                {cardData.set_name && (
                  <p>
                    <span className="text-gray-500">Set:</span>{" "}
                    {cardData.set_name}
                  </p>
                )}
                {cardData.parallel_type && cardData.parallel_type !== "Base" && (
                  <p>
                    <span className="text-gray-500">Parallel:</span>{" "}
                    {cardData.parallel_type}
                  </p>
                )}
                {cardData.card_number && (
                  <p>
                    <span className="text-gray-500">Card #:</span>{" "}
                    {cardData.card_number}
                  </p>
                )}
              </div>

              {/* Confidence indicator */}
              <div className="mt-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    cardData.confidence === "high"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : cardData.confidence === "medium"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {cardData.confidence === "high"
                    ? "High confidence"
                    : cardData.confidence === "medium"
                    ? "Medium confidence"
                    : "Low confidence"}
                </span>
              </div>
            </div>
          </div>

          {/* Grade Estimate */}
          {cardData.gradeEstimate && (
            <GradeEstimateDisplay estimate={cardData.gradeEstimate} />
          )}

          {/* Form Fields */}
          <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-800">
            {/* Purchase Price */}
            <div>
              <label
                htmlFor="purchasePrice"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Purchase Price{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  id="purchasePrice"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Condition */}
            <div>
              <label
                htmlFor="condition"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Condition
              </label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Adding...
                </span>
              ) : (
                "Add to Collection"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
