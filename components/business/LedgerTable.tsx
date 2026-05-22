"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LedgerTableRow } from "@/lib/business/ledger-table";

export type LedgerInlineField =
  | "cost_basis_total_cents"
  | "list_price_cents"
  | "status"
  | "channel";

export interface LedgerInlineEditPayload {
  rowId: string;
  field: LedgerInlineField;
  value: string | number | null;
}

interface LedgerTableProps {
  rows: LedgerTableRow[];
  selectedRowId?: string | null;
  onRowClick?: (row: LedgerTableRow) => void;
  selectedRowIds?: Set<string>;
  onToggleRow?: (rowId: string) => void;
  onToggleAll?: (allSelected: boolean) => void;
  onInlineEdit?: (payload: LedgerInlineEditPayload) => Promise<void> | void;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned", "traded"] as const;
const CHANNEL_OPTIONS = ["", "ebay", "whatnot", "instagram", "show", "local", "other"] as const;

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const COMPACT_MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMoney(cents: number | null, compact = false): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return (compact ? COMPACT_MONEY_FORMATTER : MONEY_FORMATTER).format(dollars);
}

function formatSpread(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${PERCENT_FORMATTER.format(pct)}%`;
}

function formatDays(days: number | null): string {
  if (days == null) return "—";
  return `${days}d`;
}

function signedClassName(value: number | null): string {
  if (value == null) return "text-[color:var(--biz-faint)]";
  if (value > 0) return "text-[color:var(--biz-profit)]";
  if (value < 0) return "text-[color:var(--biz-danger)]";
  return "text-[color:var(--biz-muted)]";
}

function neutralMoneyClassName(value: number | null): string {
  return value == null ? "text-[color:var(--biz-faint)]" : "text-[color:var(--biz-text)]";
}

function stopRowClick(event: React.MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function HeaderCell({
  children,
  align = "left",
  className = "",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      title={title}
      className={`sticky top-0 z-10 border-b border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--biz-muted)] ${alignClass} ${className}`}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td
      className={`border-b border-[color:var(--biz-border-subtle)] px-2 py-1.5 align-middle text-[12px] leading-snug ${alignClass} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * Click-to-edit money cell. Shows formatted money; on click swaps to a number
 * input. Enter / blur saves, Escape cancels.
 */
function InlineMoneyCell({
  cents,
  onSave,
  ariaLabel,
  align = "right",
  className = "",
}: {
  cents: number | null;
  onSave: (nextCents: number | null) => Promise<void> | void;
  ariaLabel: string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit(event: React.MouseEvent) {
    event.stopPropagation();
    setDraft(cents == null ? "" : (cents / 100).toFixed(2));
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    const nextCents =
      trimmed === "" ? null : Math.round(Number(trimmed) * 100);
    if (trimmed !== "" && !Number.isFinite(Number(trimmed))) {
      setEditing(false);
      return;
    }
    if (nextCents === cents) {
      setEditing(false);
      return;
    }
    await onSave(nextCents);
    setEditing(false);
  }

  if (editing) {
    return (
      <Cell align={align} className={className}>
        <input
          ref={inputRef}
          type="number"
          step="0.01"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={stopRowClick}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          aria-label={ariaLabel}
          className="w-full bg-transparent text-right text-[13px] tabular-nums text-[color:var(--biz-text-strong)] outline-none ring-1 ring-[color:var(--biz-border-strong)] focus:ring-[color:var(--biz-focus)] px-1"
        />
      </Cell>
    );
  }

  return (
    <Cell align={align} className={`tabular-nums ${className}`}>
      <button
        type="button"
        onClick={startEdit}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full text-right transition-colors hover:text-[color:var(--biz-text-strong)] hover:underline focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
        aria-label={`Edit ${ariaLabel}`}
        title="Click to edit"
      >
        {formatMoney(cents)}
      </button>
    </Cell>
  );
}

function InlineSelectCell({
  value,
  options,
  onSave,
  ariaLabel,
  formatOption,
}: {
  value: string | null;
  options: ReadonlyArray<string>;
  onSave: (next: string) => Promise<void> | void;
  ariaLabel: string;
  formatOption?: (v: string) => string;
}) {
  return (
    <Cell align="center">
      <select
        value={value ?? ""}
        onClick={stopRowClick}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          void onSave(e.target.value);
        }}
        aria-label={ariaLabel}
        className="w-full max-w-full bg-[color:var(--biz-near-black)] text-[11px] text-[color:var(--biz-text)] border border-[color:var(--biz-border)] px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "" ? "—" : formatOption ? formatOption(opt) : opt}
          </option>
        ))}
      </select>
    </Cell>
  );
}

export default function LedgerTable({
  rows,
  selectedRowId = null,
  onRowClick,
  selectedRowIds,
  onToggleRow,
  onToggleAll,
  onInlineEdit,
}: LedgerTableProps) {
  const selectable = Boolean(selectedRowIds && onToggleRow);
  const allSelected =
    selectable && rows.length > 0 && rows.every((r) => selectedRowIds!.has(r.id));
  const someSelected =
    selectable && rows.some((r) => selectedRowIds!.has(r.id)) && !allSelected;

  if (rows.length === 0) {
    return (
      <div className="border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] px-4 py-10 text-center text-sm text-[color:var(--biz-muted)]">
        No active inventory.
      </div>
    );
  }

  async function handleEdit(rowId: string, field: LedgerInlineField, value: string | number | null) {
    if (!onInlineEdit) return;
    await onInlineEdit({ rowId, field, value });
  }

  return (
    <div className="overflow-hidden border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]">
      <div className="max-h-[calc(100vh-190px)] min-h-[360px] overflow-auto">
        <table className="w-full border-collapse font-data text-[12px]">
          <thead>
            <tr>
              {selectable ? (
                <HeaderCell align="center" className="w-[32px]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => onToggleAll?.(allSelected)}
                    aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                    className="cursor-pointer"
                  />
                </HeaderCell>
              ) : null}
              <HeaderCell className="min-w-[180px]">Card</HeaderCell>
              <HeaderCell className="w-[64px]">Grade</HeaderCell>
              <HeaderCell align="right" className="w-[78px]">
                Cost
              </HeaderCell>
              <HeaderCell align="right" className="w-[84px]" title="Estimated Value (CMV)">
                CMV
              </HeaderCell>
              <HeaderCell align="right" className="w-[80px]">
                Price
              </HeaderCell>
              <HeaderCell align="right" className="w-[82px]" title="Lowest Listing">
                Lowest
              </HeaderCell>
              <HeaderCell align="right" className="w-[64px]">
                Spread
              </HeaderCell>
              <HeaderCell align="right" className="w-[80px]">
                P&amp;L
              </HeaderCell>
              <HeaderCell align="right" className="w-[52px]">
                Days
              </HeaderCell>
              <HeaderCell align="center" className="w-[104px]">
                Status
              </HeaderCell>
              <HeaderCell align="center" className="w-[92px]">
                Channel
              </HeaderCell>
              <HeaderCell align="center" className="w-[88px]">
                Actions
              </HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.id === selectedRowId;
              const isChecked = selectable ? selectedRowIds!.has(row.id) : false;
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick?.(row);
                    }
                  }}
                  className={`group cursor-pointer outline-none transition-colors hover:bg-[color:var(--biz-hover)] focus:bg-[color:var(--biz-hover)] ${
                    selected || isChecked ? "bg-[color:var(--biz-surface-soft)]" : ""
                  }`}
                >
                  {selectable ? (
                    <Cell align="center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={stopRowClick}
                        onChange={() => onToggleRow?.(row.id)}
                        aria-label={`Select ${row.cardLabel}`}
                        className="cursor-pointer"
                      />
                    </Cell>
                  ) : null}
                  <Cell className="max-w-[260px]">
                    <div className="min-w-0">
                      <Link
                        href={`/card/${row.id}?from=business`}
                        onClick={stopRowClick}
                        className="block truncate font-medium text-[color:var(--biz-text-strong)] underline-offset-2 transition-colors hover:text-[color:var(--biz-text)] hover:underline focus:underline focus:outline-none"
                        aria-label={`Open profile for ${row.cardLabel}`}
                      >
                        {row.cardLabel}
                      </Link>
                      {row.cardMeta && (
                        <div className="mt-0.5 truncate text-[10px] text-[color:var(--biz-muted)]">
                          {row.cardMeta}
                        </div>
                      )}
                    </div>
                  </Cell>
                  <Cell>
                    <span className="text-[color:var(--biz-muted)]">{row.gradeLabel}</span>
                  </Cell>
                  {onInlineEdit ? (
                    <InlineMoneyCell
                      cents={row.costBasisCents}
                      onSave={(next) => handleEdit(row.id, "cost_basis_total_cents", next)}
                      ariaLabel={`cost basis for ${row.cardLabel}`}
                      className="text-[color:var(--biz-text)]"
                    />
                  ) : (
                    <Cell align="right" className="tabular-nums text-[color:var(--biz-text)]">
                      {formatMoney(row.costBasisCents)}
                    </Cell>
                  )}
                  <Cell
                    align="right"
                    className={`tabular-nums ${neutralMoneyClassName(row.estimatedValueCents)}`}
                  >
                    <div>{formatMoney(row.estimatedValueCents)}</div>
                    {row.estimatedValueSource === "fallback" && (
                      <div className="text-[9px] uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
                        Fallback
                      </div>
                    )}
                  </Cell>
                  {onInlineEdit ? (
                    <InlineMoneyCell
                      cents={row.yourPriceCents}
                      onSave={(next) => handleEdit(row.id, "list_price_cents", next)}
                      ariaLabel={`your price for ${row.cardLabel}`}
                      className={neutralMoneyClassName(row.yourPriceCents)}
                    />
                  ) : (
                    <Cell
                      align="right"
                      className={`tabular-nums ${neutralMoneyClassName(row.yourPriceCents)}`}
                    >
                      {formatMoney(row.yourPriceCents)}
                    </Cell>
                  )}
                  <Cell
                    align="right"
                    className={`tabular-nums ${neutralMoneyClassName(row.lowestListingCents)}`}
                  >
                    {formatMoney(row.lowestListingCents)}
                  </Cell>
                  <Cell align="right" className={`tabular-nums ${signedClassName(row.spreadPct)}`}>
                    {formatSpread(row.spreadPct)}
                  </Cell>
                  <Cell align="right" className={`tabular-nums ${signedClassName(row.pnlCents)}`}>
                    {formatMoney(row.pnlCents)}
                  </Cell>
                  <Cell align="right" className="tabular-nums text-[color:var(--biz-muted)]">
                    {formatDays(row.daysHeld)}
                  </Cell>
                  {onInlineEdit ? (
                    <InlineSelectCell
                      value={row.item.status ?? "unlisted"}
                      options={STATUS_OPTIONS as unknown as string[]}
                      onSave={(next) => handleEdit(row.id, "status", next)}
                      ariaLabel={`status for ${row.cardLabel}`}
                    />
                  ) : (
                    <Cell align="center">
                      <span
                        className={`inline-flex min-w-[68px] justify-center border px-2 py-0.5 text-[10px] font-medium ${
                          row.status === "Listed"
                            ? "border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-soft)] text-[color:var(--biz-text-strong)]"
                            : "border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] text-[color:var(--biz-muted)]"
                        }`}
                      >
                        {row.status}
                      </span>
                    </Cell>
                  )}
                  {onInlineEdit ? (
                    <InlineSelectCell
                      value={row.item.channel ?? ""}
                      options={CHANNEL_OPTIONS as unknown as string[]}
                      onSave={(next) => handleEdit(row.id, "channel", next || null)}
                      ariaLabel={`channel for ${row.cardLabel}`}
                    />
                  ) : (
                    <Cell align="center">
                      <span className="text-[color:var(--biz-muted)] text-[11px]">
                        {row.item.channel ?? "—"}
                      </span>
                    </Cell>
                  )}
                  <Cell align="center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick?.(row);
                        }}
                        className="border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-text-strong)] transition-colors hover:bg-[color:var(--biz-hover)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
                        aria-label={`Edit ${row.cardLabel}`}
                      >
                        Edit
                      </button>
                      <Link
                        href={`/card/${row.id}?from=business`}
                        onClick={stopRowClick}
                        className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-muted)] transition-colors hover:border-[color:var(--biz-border-strong)] hover:text-[color:var(--biz-text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
                        aria-label={`Open profile for ${row.cardLabel}`}
                      >
                        Profile
                      </Link>
                    </div>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
