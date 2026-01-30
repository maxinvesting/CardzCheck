"use client";

import { useState } from "react";
import type { CollectionItem } from "@/types";

interface CollectionGridProps {
  items: CollectionItem[];
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

function formatPrice(price: number | null): string {
  if (price === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface CardItemProps {
  item: CollectionItem;
  onDelete: () => void;
}

function CardItem({ item, onDelete }: CardItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const gainLoss =
    item.estimated_cmv !== null && item.purchase_price !== null
      ? item.estimated_cmv - item.purchase_price
      : null;

  const gainLossPercent =
    gainLoss !== null && item.purchase_price !== null && item.purchase_price > 0
      ? (gainLoss / item.purchase_price) * 100
      : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Image */}
      <div className="aspect-[3/4] bg-gray-100 dark:bg-gray-800 relative">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.player_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-16 h-16 text-gray-300 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="absolute top-2 right-2 p-1.5 bg-white/90 dark:bg-gray-900/90 rounded-full text-gray-400 hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
          {item.player_name}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {[item.year, item.set_name, item.grade].filter(Boolean).join(" • ") ||
            "No details"}
        </p>

        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Paid</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {formatPrice(item.purchase_price)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">CMV</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {item.estimated_cmv !== null ? formatPrice(item.estimated_cmv) : "CMV unavailable"}
            </span>
          </div>
          {item.estimated_cmv === null && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Add comps to calculate value
            </p>
          )}
          {gainLoss !== null && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Gain/Loss</span>
              <span
                className={`font-medium ${
                  gainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {gainLoss >= 0 ? "+" : ""}
                {formatPrice(gainLoss)}
                {gainLossPercent !== null && (
                  <span className="text-xs ml-1">
                    ({gainLossPercent >= 0 ? "+" : ""}
                    {gainLossPercent.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Added {formatDate(item.created_at)}
        </p>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Remove from collection?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              This will remove {item.player_name} from your collection.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CollectionGrid({ items, onDelete, onRefresh }: CollectionGridProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
          Your collection is empty
        </p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
          Search for a card and click &apos;Add to Collection&apos; to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <CardItem
            key={item.id}
            item={item}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
