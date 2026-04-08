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

type ConsultantAction = {
  label: string;
  style: { background: string; color: string; border: string };
  prompt: string;
};

function getConsultantAction(item: BusinessInventoryItem): ConsultantAction {
  const mv = item.current_market_value_cents;
  const cost = item.cost_basis_total_cents;
  const days = getDaysHeld(item.acquisition_date);
  const listPrice = item.list_price_cents;
  const underwater = mv != null && mv < cost;
  const isUnlisted = item.status === "unlisted";
  const isListed = item.status === "listed";
  const listedTooLong = isListed && days != null && days > 21;
  const hasGoodMargin = mv != null && cost > 0 && mv > cost * 1.1;
  const title = buildDisplayTitle(item) || item.title || "this card";

  if (underwater) {
    return {
      label: "Underwater ↗",
      style: { background: "#FEF0F0", color: "#CC4444", border: "1px solid #F0C0C0" },
      prompt: `${title} is underwater — cost ${fmtCents(cost)}, MV ${fmtCents(mv)}. Cut losses or hold?`,
    };
  }
  if (isUnlisted && hasGoodMargin) {
    return {
      label: "List now ↗",
      style: { background: "#F0F8F4", color: "#2D7A4F", border: "1px solid #C8E6D6" },
      prompt: `Should I list ${title} now? Cost ${fmtCents(cost)}, est MV ${fmtCents(mv!)}.`,
    };
  }
  if (listedTooLong) {
    return {
      label: "Reprice ↗",
      style: { background: "#FBF5E8", color: "#8A5C0A", border: "1px solid #E8D5A0" },
      prompt: `${title} has been listed ${days}d at ${listPrice != null ? fmtCents(listPrice) : "unknown price"}. Should I reprice?`,
    };
  }
  return {
    label: "Analyze ↗",
    style: { background: "#F2EFE9", color: "#777777", border: "1px solid #E5E2DD" },
    prompt: `Analyze ${title} — cost ${fmtCents(cost)}, MV ${mv != null ? fmtCents(mv) : "unknown"}.`,
  };
}

type GridRow = { kind: "item"; item: BusinessInventoryItem } | { kind: "add" };

export interface InventoryCardGridProps {
  items: BusinessInventoryItem[];
  selectedItemId?: string | null;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
  onAddCard?: () => void;
  onConsultant?: (prompt: string) => void;
}

function CardImageArea({ item }: { item: BusinessInventoryItem }) {
  const imageCandidates = useMemo(
    () => uniqueHttpUrls([item.user_image_url, item.stock_image_url, item.ebay_image_url]),
    [item.user_image_url, item.stock_image_url, item.ebay_image_url]
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
  onConsultant,
}: {
  item: BusinessInventoryItem;
  selected: boolean;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
  onConsultant?: (prompt: string) => void;
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

  const consultantAction = onConsultant ? getConsultantAction(item) : null;

  return (
    <div
      onClick={() => onItemClick(item)}
      className={`flex flex-col rounded-xl border bg-white overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        selected
          ? "border-[var(--biz-primary)] ring-1 ring-[var(--biz-primary)]"
          : "border-[var(--biz-border)] hover:border-[var(--biz-primary-border)]"
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
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[var(--biz-hover)] whitespace-nowrap"
          >
            View
          </Link>
          {item.status !== "sold" ? (
            <button
              type="button"
              onClick={() => onMarkSold?.(item)}
              className="rounded border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[var(--biz-primary-soft-strong)] whitespace-nowrap"
            >
              Sold
            </button>
          ) : null}
          {canListOnEbay && (
            <button
              type="button"
              onClick={() => onEbayList?.(item)}
              className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[var(--biz-hover)] whitespace-nowrap"
            >
              List
            </button>
          )}
          <a
            href={getCompsUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--biz-primary)] hover:bg-[var(--biz-hover)] whitespace-nowrap"
          >
            Comps
          </a>
          {consultantAction && (
            <button
              type="button"
              onClick={() => onConsultant?.(consultantAction.prompt)}
              className="rounded px-1.5 py-0.5 text-[9px] font-medium whitespace-nowrap"
              style={{
                background: consultantAction.style.background,
                color: consultantAction.style.color,
                border: consultantAction.style.border,
              }}
            >
              {consultantAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-[1.5px] border-dashed border-[var(--biz-border)] rounded-xl min-h-[152px] flex flex-col items-center justify-center cursor-pointer bg-[#FAFAF8] hover:bg-[#F5F3F0] transition-colors gap-1"
    >
      <span className="text-2xl text-[#CCCCCC] leading-none">+</span>
      <span className="text-[11px] text-[#BBBBBB]">Add card</span>
    </button>
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
  onAddCard,
  onConsultant,
}: InventoryCardGridProps) {
  const rows: GridRow[] = useMemo(() => {
    const itemRows = items.map((item) => ({ kind: "item" as const, item }));
    if (onAddCard) return [...itemRows, { kind: "add" as const }];
    return itemRows;
  }, [items, onAddCard]);

  if (rows.length === 0) {
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
    onConsultant,
  });

  const gridBody =
    rows.length > VIRTUALIZE_THRESHOLD ? (
      <VirtuosoGrid
        data={rows}
        listClassName={GRID_CLASS}
        style={{ height: "calc(100vh - 340px)", minHeight: 400 }}
        itemContent={(_index, row) =>
          row.kind === "add" ? (
            <AddTile key="__add__" onClick={onAddCard!} />
          ) : (
            <InventoryCardCell key={row.item.id} {...cellProps(row.item)} />
          )
        }
        computeItemKey={(_index, row) => (row.kind === "add" ? "__add__" : row.item.id)}
      />
    ) : (
      <div className={GRID_CLASS}>
        {rows.map((row) =>
          row.kind === "add" ? (
            <AddTile key="__add__" onClick={onAddCard!} />
          ) : (
            <InventoryCardCell key={row.item.id} {...cellProps(row.item)} />
          )
        )}
      </div>
    );

  return <div className="px-4 sm:px-6 pb-6 pt-1">{gridBody}</div>;
}
