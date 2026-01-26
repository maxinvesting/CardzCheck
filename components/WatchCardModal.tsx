"use client";

import { useState } from "react";

interface WatchCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string) => void;
  cardData: {
    player_name: string;
    year?: string;
    set_brand?: string;
    card_number?: string;
    parallel_variant?: string;
    condition?: string;
  };
  isPro: boolean;
  onUpgradeClick: () => void;
}

export default function WatchCardModal({
  isOpen,
  onClose,
  onSuccess,
  cardData,
  isPro,
  onUpgradeClick,
}: WatchCardModalProps) {
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cardData,
          target_price: targetPrice ? parseFloat(targetPrice) : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "upgrade_required") {
          setError("Watchlist is a Pro feature. Upgrade to track card prices.");
          return;
        }
        throw new Error(data.error || "Failed to add to watchlist");
      }

      onSuccess(cardData.player_name);
      onClose();
      setTargetPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to watchlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add to Watchlist
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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

        {/* Content */}
        <div className="p-4">
          {/* Card Preview */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {cardData.player_name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {[cardData.year, cardData.set_brand].filter(Boolean).join(" ")}
            </p>
            {cardData.parallel_variant && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {cardData.parallel_variant}
              </p>
            )}
            {cardData.condition && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded">
                {cardData.condition}
              </span>
            )}
          </div>

          {/* Pro upgrade prompt */}
          {!isPro && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Watchlist is a Pro Feature
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Upgrade to Pro to track card prices and set target alerts.
                  </p>
                  <button
                    onClick={onUpgradeClick}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form for Pro users */}
          {isPro && (
            <form onSubmit={handleSubmit}>
              {/* Target Price Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Target Price (optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Get highlighted when price drops below this amount
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
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
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Add to Watchlist
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Close button for non-Pro users */}
          {!isPro && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
