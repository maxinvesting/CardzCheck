"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { VirtuosoGrid } from "react-virtuoso";
import type { BusinessInventoryItem } from "@/types";
import { uniqueHttpUrls } from "@/lib/collection-images";
import {
  fmtCents,
  getDaysHeld,
  getDaysHeldColor,
  buildDisplayTitle,
  statusColor,
  statusLabel,
  gradeBadgeLabel,
  gradeBadgeColor,
  getCompsUrl,
  isUnderwater,
} from "@/lib/business/inventory-display";

const VIRTUALIZE_THRESHOLD = 200;

export interface InventoryCardGridProps {
  items: BusinessInventoryItem[];
  selectedItemId?: string | null;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
}

function CardImageArea({ item }: { item: BusinessInventoryItem }) {
  const imageCandidates = useMemo(
    () => uniqueHttpUrls([item.user_image_url]),
    [item.user_image_url]
  );
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex] || null;
  const gradeLabel = gradeBadgeLabel(item);
  const gradeColor = gradeBadgeColor(item);

  return (
    <div className="relative aspect-[3/4] bg-[#F3F4F6] overflow-hidden">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={buildDisplayTitle(item)}
          className="w-full h-full object-cover"
          onError={() => {
            setImageIndex((prev) => {
              const next = prev + 1;
              return next < imageCandidates.length ? next : imageCandidates.length;
            });
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-[#D1D5DB]"
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
      {gradeLabel && (
        <span
          className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold leading-tight ${gradeColor}`}
        >
          {gradeLabel}
        </span>
      )}
      {item.quantity > 1 && (
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold">
          ×{item.quantity}
        </span>
      )}
    </div>
  );
}

function InventoryCardCell({
  item,
  selected,
  onItemClick,
  onMarkSold,
  ebayConnected,
  onEbayList,
}: {
  item: BusinessInventoryItem;
  selected: boolean;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
}) {
  const titleStr = buildDisplayTitle(item);
  const days = getDaysHeld(item.acquisition_date);
  const daysColor = getDaysHeldColor(days);
  const cost = fmtCents(item.cost_basis_total_cents);
  const listPrice = fmtCents(item.list_price_cents);
  const underwater = isUnderwater(item);
  const hasEbayListing = !!(item as any).ebay_item_id;
  const canListOnEbay =
    ebayConnected &&
    !hasEbayListing &&
    item.status !== "sold" &&
    item.status !== "returned" &&
    item.status !== "pending_sale";

  return (
    <div
      onClick={() => onItemClick(item)}
      className={`flex flex-col rounded-xl border bg-white overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        selected
          ? "border-emerald-600 ring-1 ring-emerald-600"
          : "border-[var(--biz-border)] hover:border-emerald-400"
      }`}
    >
      {/* Image */}
      <CardImageArea item={item} />

      {/* Info */}
      <div className="p-2 flex flex-col gap-1 flex-1 min-w-0">
        {/* Title */}
        <p
          className="text-[11px] font-semibold text-[var(--biz-text)] leading-tight line-clamp-2"
          title={titleStr}
        >
          {titleStr || "Untitled"}
        </p>

        {/* Status badge */}
        <div className="flex items-center gap-1 flex-wrap">
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium leading-tight ${statusColor(item.status)}`}
          >
            {statusLabel(item.status)}
          </span>
          {underwater && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium leading-tight border border-red-200 bg-red-50 text-red-700">
              Underwater
            </span>
          )}
        </div>

        {/* Cost / List price row */}
        <div className="flex items-center justify-between text-[10px] tabular-nums text-[var(--biz-muted)]">
          <span>{cost || "—"}</span>
          {listPrice && <span className="font-medium text-[var(--biz-text)]">{listPrice}</span>}
        </div>

        {/* Days held */}
        {days !== null && (
          <div className={`text-[10px] font-medium tabular-nums ${daysColor}`}>
            {days}d held
          </div>
        )}

        {/* Actions */}
        <div
          className="flex items-center gap-1 pt-1 mt-auto border-t border-[var(--biz-border)] flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/card/${item.id}?from=business`}
            className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] whitespace-nowrap"
          >
            View
          </Link>
          {item.status !== "sold" ? (
            <button
              type="button"
              onClick={() => onMarkSold?.(item)}
              className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 hover:bg-emerald-100 whitespace-nowrap"
            >
              Sold
            </button>
          ) : null}
          {canListOnEbay && (
            <button
              type="button"
              onClick={() => onEbayList?.(item)}
              className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] whitespace-nowrap"
            >
              List
            </button>
          )}
          <a
            href={getCompsUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] whitespace-nowrap"
          >
            Comps
          </a>
        </div>
      </div>
    </div>
  );
}

const GRID_CLASS = "grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

export default function InventoryCardGrid({
  items,
  selectedItemId,
  onItemClick,
  onMarkSold,
  ebayConnected,
  onEbayList,
}: InventoryCardGridProps) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--biz-muted)]">
        No inventory items found.
      </div>
    );
  }

  const cellProps = (item: BusinessInventoryItem) => ({
    item,
    selected: selectedItemId === item.id,
    onItemClick,
    onMarkSold,
    ebayConnected,
    onEbayList,
  });

  if (items.length > VIRTUALIZE_THRESHOLD) {
    return (
      <VirtuosoGrid
        data={items}
        listClassName={GRID_CLASS}
        style={{ height: "calc(100vh - 340px)", minHeight: 400 }}
        itemContent={(_index, item) => (
          <InventoryCardCell key={item.id} {...cellProps(item)} />
        )}
        computeItemKey={(_index, item) => item.id}
      />
    );
  }

  return (
    <div className={GRID_CLASS}>
      {items.map((item) => (
        <InventoryCardCell key={item.id} {...cellProps(item)} />
      ))}
    </div>
  );
}
