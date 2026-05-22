"use client";

import Link from "next/link";
import type { LedgerTableRow } from "@/lib/business/ledger-table";

interface LedgerTableProps {
  rows: LedgerTableRow[];
  selectedRowId?: string | null;
  onRowClick?: (row: LedgerTableRow) => void;
}

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
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 border-b border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-3 py-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--biz-muted)] ${alignClass} ${className}`}
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
      className={`border-b border-[color:var(--biz-border-subtle)] px-3 py-2 align-middle text-[13px] leading-snug ${alignClass} ${className}`}
    >
      {children}
    </td>
  );
}

export default function LedgerTable({
  rows,
  selectedRowId = null,
  onRowClick,
}: LedgerTableProps) {
  if (rows.length === 0) {
    return (
      <div className="border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] px-4 py-10 text-center text-sm text-[color:var(--biz-muted)]">
        No active inventory.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]">
      <div className="max-h-[calc(100vh-190px)] min-h-[360px] overflow-auto">
        <table className="w-full min-w-[1300px] border-collapse font-data">
          <thead>
            <tr>
              <HeaderCell className="min-w-[300px]">Card</HeaderCell>
              <HeaderCell className="w-[92px]">Grade</HeaderCell>
              <HeaderCell align="right" className="w-[118px]">
                Cost Basis
              </HeaderCell>
              <HeaderCell align="right" className="w-[138px]">
                Estimated Value (CMV)
              </HeaderCell>
              <HeaderCell align="right" className="w-[118px]">
                Your Price
              </HeaderCell>
              <HeaderCell align="right" className="w-[126px]">
                Lowest Listing
              </HeaderCell>
              <HeaderCell align="right" className="w-[108px]">
                Spread
              </HeaderCell>
              <HeaderCell align="right" className="w-[112px]">
                P&amp;L
              </HeaderCell>
              <HeaderCell align="right" className="w-[92px]">
                Days Held
              </HeaderCell>
              <HeaderCell align="center" className="w-[104px]">
                Status
              </HeaderCell>
              <HeaderCell align="center" className="w-[132px]">
                Actions
              </HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.id === selectedRowId;
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
                    selected ? "bg-[color:var(--biz-surface-soft)]" : ""
                  }`}
                >
                  <Cell className="max-w-[360px]">
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
                  <Cell align="right" className="tabular-nums text-[#E6E8EB]">
                    {formatMoney(row.costBasisCents)}
                  </Cell>
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
                  <Cell
                    align="right"
                    className={`tabular-nums ${neutralMoneyClassName(row.yourPriceCents)}`}
                  >
                    {formatMoney(row.yourPriceCents)}
                  </Cell>
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
                  <Cell align="center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick?.(row);
                        }}
                        className="border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-text-strong)] transition-colors hover:bg-[color:var(--biz-hover)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
                        aria-label={`Edit ${row.cardLabel}`}
                      >
                        Edit
                      </button>
                      <Link
                        href={`/card/${row.id}?from=business`}
                        onClick={stopRowClick}
                        className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-muted)] transition-colors hover:border-[color:var(--biz-border-strong)] hover:text-[color:var(--biz-text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
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
