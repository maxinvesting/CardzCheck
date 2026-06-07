"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import type { LedgerTableRow } from "@/lib/business/ledger-table";
import {
  getInventoryImageCandidates,
  isResolvingInventoryCertImage,
} from "@/lib/business/inventory-display";

interface LedgerPhotoGridProps {
  rows: LedgerTableRow[];
  selectedRowId?: string | null;
  onRowClick?: (row: LedgerTableRow) => void;
  selectedRowIds?: Set<string>;
  onToggleRow?: (rowId: string) => void;
  onToggleAll?: (allSelected: boolean) => void;
}

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatMoney(cents: number | null): string {
  if (cents == null) return "-";
  return MONEY_FORMATTER.format(cents / 100);
}

function signedClassName(value: number | null): string {
  if (value == null) return "text-[#77808C]";
  if (value > 0) return "text-[#20B26B]";
  if (value < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function statusClassName(status: LedgerTableRow["item"]["status"]): string {
  switch (status) {
    case "listed":
      return "border-[#3F4650] bg-[#1B2026] text-[#E6E8EB]";
    case "pending_sale":
      return "border-[#5A4A1F] bg-[#251E0E] text-[#F0B429]";
    case "sold":
    case "returned":
    case "traded":
      return "border-[#3A3030] bg-[#1A1111] text-[#E05C5C]";
    default:
      return "border-[#343941] bg-[#0F1216] text-[#77808C]";
  }
}

function formatStatus(status: LedgerTableRow["item"]["status"]): string {
  if (status === "pending_sale") return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Metric({
  label,
  value,
  valueClassName = "text-[#E6E8EB]",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </div>
      <div className={`mt-0.5 truncate font-data text-[12px] font-semibold tabular-nums ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyImage({ resolving }: { resolving: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
      <svg
        className="h-12 w-12 text-[#3F4650]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      {resolving ? (
        <p className="text-[11px] font-medium text-[#B8C0CC]">Resolving image</p>
      ) : (
        <p className="text-[11px] font-medium text-[#77808C]">No image</p>
      )}
    </div>
  );
}

function LedgerPhotoCard({
  row,
  selected,
  checked,
  selectable,
  onRowClick,
  onToggleRow,
}: {
  row: LedgerTableRow;
  selected: boolean;
  checked: boolean;
  selectable: boolean;
  onRowClick?: (row: LedgerTableRow) => void;
  onToggleRow?: (rowId: string) => void;
}) {
  const imageCandidates = useMemo(() => getInventoryImageCandidates(row.item), [row.item]);
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex] ?? null;
  const resolving = isResolvingInventoryCertImage(row.item);

  useEffect(() => {
    setImageIndex(0);
  }, [row.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onRowClick?.(row);
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open profile for ${row.cardLabel}`}
      onClick={() => onRowClick?.(row)}
      onKeyDown={handleKeyDown}
      className={`group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border bg-[#0B0D0F] outline-none transition-colors hover:border-[#5A626E] focus:ring-1 focus:ring-[#5A626E] ${
        selected || checked ? "border-[#B8C0CC]" : "border-[#24282D]"
      }`}
    >
      <div className="relative aspect-[3/4] bg-[#050607]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={row.cardLabel}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
            className="object-contain"
            onError={() => {
              setImageIndex((prev) => {
                const next = prev + 1;
                return next < imageCandidates.length ? next : imageCandidates.length;
              });
            }}
          />
        ) : (
          <EmptyImage resolving={resolving} />
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div className="flex min-w-0 items-start gap-2">
            {selectable ? (
              <input
                type="checkbox"
                checked={checked}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  onToggleRow?.(row.id);
                }}
                aria-label={`Select ${row.cardLabel}`}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[#5A626E] bg-[#0B0D0F] text-[#E6E8EB]"
              />
            ) : null}
            {row.quantity > 1 ? (
              <span className="rounded-sm border border-black/30 bg-black/72 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Qty {row.quantity}
              </span>
            ) : null}
          </div>
          <span
            className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${statusClassName(
              row.item.status
            )}`}
          >
            {formatStatus(row.item.status)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-[#24282D] p-3">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium text-[#B8C0CC]">
              {row.gradeLabel}
            </span>
            {row.daysHeld != null ? (
              <span className="shrink-0 font-data text-[11px] tabular-nums text-[#77808C]">
                {row.daysHeld}d
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-[#E6E8EB]">
            {row.cardLabel}
          </h3>
          {row.cardMeta ? (
            <p className="mt-1 truncate text-[11px] text-[#77808C]">{row.cardMeta}</p>
          ) : null}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-[#1E2227] pt-2">
          <Metric label="Cost" value={formatMoney(row.costBasisCents)} />
          <Metric label="CMV" value={formatMoney(row.estimatedValueCents)} />
          <Metric
            label="P&L"
            value={formatMoney(row.pnlCents)}
            valueClassName={signedClassName(row.pnlCents)}
          />
        </div>
      </div>
    </article>
  );
}

export default function LedgerPhotoGrid({
  rows,
  selectedRowId = null,
  onRowClick,
  selectedRowIds,
  onToggleRow,
  onToggleAll,
}: LedgerPhotoGridProps) {
  const selectable = Boolean(selectedRowIds && onToggleRow);
  const allSelected =
    selectable && rows.length > 0 && rows.every((row) => selectedRowIds!.has(row.id));
  const someSelected =
    selectable && rows.some((row) => selectedRowIds!.has(row.id)) && !allSelected;

  if (rows.length === 0) {
    return (
      <div className="border border-[#24282D] bg-[#0B0D0F] px-4 py-10 text-center text-sm text-[#77808C]">
        No active inventory.
      </div>
    );
  }

  return (
    <div className="border border-[#24282D] bg-[#07080A]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-3 py-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            Photo Mode
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-[#E6E8EB]">
            {rows.length.toLocaleString("en-US")} card{rows.length === 1 ? "" : "s"}
          </div>
        </div>
        {selectable ? (
          <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#B8C0CC]">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => onToggleAll?.(allSelected)}
              aria-label={allSelected ? "Deselect all cards" : "Select all cards"}
              className="h-4 w-4 cursor-pointer rounded border-[#5A626E] bg-[#0B0D0F] text-[#E6E8EB]"
            />
            Select all
          </label>
        ) : null}
      </div>

      <div className="max-h-[calc(100vh-240px)] overflow-auto p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {rows.map((row) => {
            const checked = selectable ? selectedRowIds!.has(row.id) : false;
            return (
              <LedgerPhotoCard
                key={row.id}
                row={row}
                selected={row.id === selectedRowId}
                checked={checked}
                selectable={selectable}
                onRowClick={onRowClick}
                onToggleRow={onToggleRow}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
