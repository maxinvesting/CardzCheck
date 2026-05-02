"use client";

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
  if (value == null) return "text-[#77808C]";
  if (value > 0) return "text-[#20B26B]";
  if (value < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function neutralMoneyClassName(value: number | null): string {
  return value == null ? "text-[#77808C]" : "text-[#E6E8EB]";
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
      className={`sticky top-0 z-10 border-b border-[#24282D] bg-[#0B0D0F] px-2.5 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C] ${alignClass} ${className}`}
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
      className={`border-b border-[#1E2227] px-2.5 py-1.5 align-middle text-[12px] ${alignClass} ${className}`}
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
      <div className="border border-[#24282D] bg-[#0B0D0F] px-4 py-10 text-center text-sm text-[#77808C]">
        No active inventory.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[#24282D] bg-[#0B0D0F]">
      <div className="max-h-[calc(100vh-190px)] min-h-[360px] overflow-auto">
        <table className="w-full min-w-[1180px] border-collapse font-data">
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
                  className={`group cursor-pointer outline-none transition-colors hover:bg-[#15191D] focus:bg-[#15191D] ${
                    selected ? "bg-[#132019]" : ""
                  }`}
                >
                  <Cell className="max-w-[360px]">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#E6E8EB]">
                        {row.cardLabel}
                      </div>
                      {row.cardMeta && (
                        <div className="mt-0.5 truncate text-[10px] text-[#77808C]">
                          {row.cardMeta}
                        </div>
                      )}
                    </div>
                  </Cell>
                  <Cell>
                    <span className="text-[#B8C0CC]">{row.gradeLabel}</span>
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
                      <div className="text-[9px] uppercase tracking-[0.08em] text-[#77808C]">
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
                  <Cell align="right" className="tabular-nums text-[#B8C0CC]">
                    {formatDays(row.daysHeld)}
                  </Cell>
                  <Cell align="center">
                    <span
                      className={`inline-flex min-w-[68px] justify-center border px-2 py-0.5 text-[10px] font-medium ${
                        row.status === "Listed"
                          ? "border-[#1F5F45] bg-[#0E251B] text-[#20B26B]"
                          : "border-[#343941] bg-[#111315] text-[#8D96A3]"
                      }`}
                    >
                      {row.status}
                    </span>
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
