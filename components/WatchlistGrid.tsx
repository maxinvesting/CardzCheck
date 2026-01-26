"use client";

import { useState } from "react";
import type { WatchlistItem } from "@/types";

interface WatchlistGridProps {
  items: WatchlistItem[];
  onDelete: (id: string) => void;
  onUpdateTargetPrice: (id: string, targetPrice: number | null) => void;
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getPriceTrend(
  item: WatchlistItem
): "up" | "down" | "neutral" | "none" {
  if (!item.price_history || item.price_history.length < 2) return "none";

  const current = item.last_price || 0;
  const previous = item.price_history[item.price_history.length - 2]?.price || 0;

  if (current > previous) return "up";
  if (current < previous) return "down";
  return "neutral";
}

function WatchlistCard({
  item,
  onDelete,
  onUpdateTargetPrice,
}: {
  item: WatchlistItem;
  onDelete: () => void;
  onUpdateTargetPrice: (targetPrice: number | null) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(
    item.target_price?.toString() || ""
  );

  const priceTrend = getPriceTrend(item);
  const isBelowTarget =
    item.target_price !== null &&
    item.last_price !== null &&
    item.last_price <= item.target_price;

  const handleSaveTarget = () => {
    const newTarget = targetInput ? parseFloat(targetInput) : null;
    onUpdateTargetPrice(isNaN(newTarget as number) ? null : newTarget);
    setEditingTarget(false);
  };

  return (
    <div
      className={`bg-white dark:bg-gray-900 border rounded-xl overflow-hidden transition-all ${
        isBelowTarget
          ? "border-green-500 ring-2 ring-green-500/20"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      {/* Card Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {item.player_name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {[item.year, item.set_brand].filter(Boolean).join(" ")}
            </p>
            {item.parallel_variant && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {item.parallel_variant}
              </p>
            )}
            {item.condition && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 rounded">
                {item.condition}
              </span>
            )}
          </div>

          {/* Delete button */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            title="Remove from watchlist"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        {/* Price Section */}
        <div className="space-y-3">
          {/* Current Price */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Current Price
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-gray-900 dark:text-white">
                {formatPrice(item.last_price)}
              </span>
              {/* Trend indicator */}
              {priceTrend === "up" && (
                <svg
                  className="w-4 h-4 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              )}
              {priceTrend === "down" && (
                <svg
                  className="w-4 h-4 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Target Price */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Target Price
            </span>
            {editingTarget ? (
              <div className="flex items-center gap-1">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-20 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-right"
                  placeholder="0.00"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTarget();
                    if (e.key === "Escape") setEditingTarget(false);
                  }}
                />
                <button
                  onClick={handleSaveTarget}
                  className="p-1 text-green-500 hover:text-green-600"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTargetInput(item.target_price?.toString() || "");
                  setEditingTarget(true);
                }}
                className={`font-medium ${
                  isBelowTarget
                    ? "text-green-500"
                    : item.target_price
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400"
                } hover:underline`}
              >
                {item.target_price ? formatPrice(item.target_price) : "Set target"}
              </button>
            )}
          </div>

          {/* Below target indicator */}
          {isBelowTarget && (
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <svg
                className="w-4 h-4 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Below target price!
              </span>
            </div>
          )}

          {/* Last checked */}
          {item.last_checked && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Last updated: {formatDate(item.last_checked)}
            </p>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">
            Remove from watchlist?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
              className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              Remove
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WatchlistGrid({
  items,
  onDelete,
  onUpdateTargetPrice,
}: WatchlistGridProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full inline-flex mb-4">
          <svg
            className="w-8 h-8 text-gray-400"
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
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No cards on watchlist
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Search for a card and click the eye icon to add it to your watchlist.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <WatchlistCard
          key={item.id}
          item={item}
          onDelete={() => onDelete(item.id)}
          onUpdateTargetPrice={(price) => onUpdateTargetPrice(item.id, price)}
        />
      ))}
    </div>
  );
}
