"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { BusinessInventoryItem } from "@/types";
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
  getInventoryCertUrl,
  hasInventoryImage,
  getInventoryImageCandidates,
  isResolvingInventoryCertImage,
  isUnderwater,
} from "@/lib/business/inventory-display";

export interface InventoryScrollViewProps {
  items: BusinessInventoryItem[];
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
}

function ScrollCardImage({ item }: { item: BusinessInventoryItem }) {
  const imageCandidates = useMemo(
    () => getInventoryImageCandidates(item),
    [item]
  );
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [item.id]);

  const imageUrl = imageCandidates[imageIndex] || null;
  const gradeLabel = gradeBadgeLabel(item);
  const gradeColor = gradeBadgeColor(item);
  const isResolving = isResolvingInventoryCertImage(item);

  return (
    <div className="relative aspect-[3/4] w-full bg-[#F3F4F6] rounded-xl overflow-hidden">
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
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-4 text-center">
          <svg
            className="w-20 h-20 text-[#D1D5DB]"
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
          {isResolving ? (
            <p className="text-sm font-medium text-[var(--biz-primary)]">
              Resolving cert image...
            </p>
          ) : null}
        </div>
      )}
      {gradeLabel && (
        <span
          className={`absolute bottom-3 left-3 px-2 py-1 rounded text-xs font-bold ${gradeColor}`}
        >
          {gradeLabel}
        </span>
      )}
      {item.quantity > 1 && (
        <span className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-white text-xs font-semibold">
          ×{item.quantity}
        </span>
      )}
    </div>
  );
}

function MetaRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--biz-border)] last:border-0 text-sm">
      <span className="text-[var(--biz-muted)]">{label}</span>
      <span className={`font-medium text-right ${valueClass ?? "text-[var(--biz-text)]"}`}>{value}</span>
    </div>
  );
}

export default function InventoryScrollView({
  items,
  onItemClick,
  onMarkSold,
  ebayConnected,
  onEbayList,
}: InventoryScrollViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp index when items change
  useEffect(() => {
    setCurrentIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(items.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--biz-muted)]">
        No inventory items found.
      </div>
    );
  }

  const item = items[currentIndex];
  if (!item) return null;

  const titleStr = buildDisplayTitle(item);
  const days = getDaysHeld(item.acquisition_date);
  const daysColor = getDaysHeldColor(days);
  const cost = fmtCents(item.cost_basis_total_cents);
  const listPrice = fmtCents(item.list_price_cents);
  const cmv = fmtCents(item.current_market_value_cents);
  const underwater = isUnderwater(item);
  const hasEbayListing = !!(item as any).ebay_item_id;
  const canListOnEbay =
    ebayConnected &&
    !hasEbayListing &&
    item.status !== "sold" &&
    item.status !== "returned" &&
    item.status !== "pending_sale";
  const hasImage = hasInventoryImage(item);
  const certUrl = getInventoryCertUrl(item);
  const isResolving = isResolvingInventoryCertImage(item);

  const prev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const next = () => setCurrentIndex((i) => Math.min(items.length - 1, i + 1));

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Navigation row */}
      <div className="flex items-center justify-between w-full max-w-sm gap-3">
        <button
          type="button"
          onClick={prev}
          disabled={currentIndex === 0}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--biz-border)] bg-white text-[var(--biz-text)] hover:bg-[#F3F4F6] disabled:opacity-30 transition-colors"
          aria-label="Previous card"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-xs text-[var(--biz-muted)] tabular-nums">
          {currentIndex + 1} of {items.length}
        </span>

        <button
          type="button"
          onClick={next}
          disabled={currentIndex === items.length - 1}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--biz-border)] bg-white text-[var(--biz-text)] hover:bg-[#F3F4F6] disabled:opacity-30 transition-colors"
          aria-label="Next card"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Image */}
        <ScrollCardImage item={item} />

        {/* Title + badges */}
        <div className="mt-3 mb-2">
          <h2 className="text-base font-semibold text-[var(--biz-text)] leading-tight mb-1.5">
            {titleStr || "Untitled"}
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${statusColor(item.status)}`}
            >
              {statusLabel(item.status)}
            </span>
            {underwater && (
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium border border-red-200 bg-red-50 text-red-700">
                Underwater
              </span>
            )}
            {item.channel && (
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium border border-[var(--biz-border)] bg-[#F9FAFB] text-[var(--biz-muted)]">
                {item.channel.charAt(0).toUpperCase() + item.channel.slice(1)}
              </span>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="rounded-lg border border-[var(--biz-border)] bg-white px-3 mb-3">
          <MetaRow label="Cost" value={cost || "—"} />
          <MetaRow label="List Price" value={listPrice || "Not listed"} valueClass={listPrice ? "text-[var(--biz-text)]" : "text-[var(--biz-muted)] italic font-normal"} />
          <MetaRow label="Est. Market Value" value={cmv || "—"} valueClass={cmv ? (underwater ? "text-red-600" : "text-emerald-700") : "text-[var(--biz-muted)]"} />
          <MetaRow
            label="Days Held"
            value={days !== null ? `${days}d` : "—"}
            valueClass={daysColor}
          />
          {item.location && <MetaRow label="Storage" value={item.location} />}
          {item.acquisition_date && (
            <MetaRow
              label="Acquired"
              value={new Date(item.acquisition_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
          )}
          {item.quantity > 1 && <MetaRow label="Quantity" value={item.quantity} />}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/card/${item.id}?from=business`}
            className="flex-1 text-center rounded-lg border border-[var(--biz-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--biz-primary)] hover:bg-[#F9FAFB] transition-colors"
          >
            View Profile
          </Link>
          {item.status !== "sold" && (
            <button
              type="button"
              onClick={() => onMarkSold?.(item)}
              className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Mark Sold
            </button>
          )}
          {canListOnEbay && (
            <button
              type="button"
              onClick={() => onEbayList?.(item)}
              className="flex-1 rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
            >
              List eBay
            </button>
          )}
          <a
            href={getCompsUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
          >
            Get Comps
          </a>
          {!hasImage && !isResolving && certUrl ? (
            <a
              href={certUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
            >
              View Cert
            </a>
          ) : null}
          {!hasImage && !isResolving ? (
            <Link
              href={`/card/${item.id}?from=business`}
              className="flex-1 text-center rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
            >
              Set Image
            </Link>
          ) : null}
          {!hasImage && isResolving ? (
            <span className="flex-1 rounded-lg border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-2 text-center text-xs font-medium text-[var(--biz-primary)]">
              Resolving cert image...
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onItemClick(item)}
            className="flex-1 rounded-lg border border-[var(--biz-border)] bg-[#F9FAFB] px-3 py-2 text-xs font-medium text-[var(--biz-text)] hover:bg-[#F3F4F6] transition-colors"
          >
            Details
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-center text-[10px] text-[var(--biz-muted)]">
          Use ← → arrow keys to navigate
        </p>
      </div>
    </div>
  );
}
