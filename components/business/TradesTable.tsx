"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/business/sales-utils";
import {
  recognizableFromBusinessTrade,
  tradeRecognition,
  tradeDeferredGain,
} from "@/lib/business/trade-recognition";

export interface TradeItem {
  direction: "in" | "out";
  collection_item_id: string;
  fair_value_cents: number | null;
  allocated_cost_basis_cents: number | null;
  title: string | null;
}

export interface BusinessTrade {
  id: string;
  partner_name: string | null;
  traded_at: string;
  cash_paid_cents: number;
  cash_received_cents: number;
  outgoing_basis_cents: number;
  incoming_basis_cents: number;
  realized_gain_cents: number;
  notes: string | null;
  created_at: string;
  items: TradeItem[];
}

interface Props {
  trades: BusinessTrade[];
  loading: boolean;
  onDeleteTrade: (tradeId: string) => Promise<void>;
}

const thClass =
  "px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--biz-muted)] border-b border-[color:var(--biz-border)]";

const tdClass =
  "px-3 py-2 align-middle text-[13px] leading-snug text-[color:var(--biz-text)] border-b border-[color:var(--biz-border-subtle)]";

function summarizeItems(items: TradeItem[], direction: "in" | "out"): string {
  const titles = items
    .filter((it) => it.direction === direction)
    .map((it) => it.title?.trim())
    .filter((t): t is string => Boolean(t));
  if (titles.length === 0) return "—";
  if (titles.length <= 2) return titles.join(", ");
  return `${titles.slice(0, 2).join(", ")} +${titles.length - 2} more`;
}

function sumFairValue(items: TradeItem[], direction: "in" | "out"): number {
  return items
    .filter((it) => it.direction === direction)
    .reduce((acc, it) => acc + (it.fair_value_cents ?? 0), 0);
}

export default function TradesTable({ trades, loading, onDeleteTrade }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      trades.map((trade) => {
        const netCash = trade.cash_received_cents - trade.cash_paid_cents;
        // Recognize each trade the same way the Financials P&L does: a
        // card-for-card swap defers its gain into the received card's basis
        // (realized only when that card sells), so only cash that can't be
        // absorbed hits P&L now. This keeps the trades table reconciled with
        // the P&L instead of showing the raw mark-to-market gain.
        const rec = recognizableFromBusinessTrade(trade);
        const recognized = tradeRecognition(rec)?.profit_cents ?? 0;
        const deferred = tradeDeferredGain(rec);
        return {
          ...trade,
          partnerLabel: trade.partner_name?.trim() || "Trade",
          outSummary: summarizeItems(trade.items, "out"),
          inSummary: summarizeItems(trade.items, "in"),
          outValue: sumFairValue(trade.items, "out"),
          inValue: sumFairValue(trade.items, "in"),
          netCash,
          recognized,
          deferred,
        };
      }),
    [trades]
  );

  return (
    <div className="overflow-x-auto border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]">
      <table className="w-full min-w-[1100px] border-collapse text-left text-xs font-data">
        <thead className="bg-[color:var(--biz-near-black)]">
          <tr>
            <th className={thClass}>Traded</th>
            <th className={thClass}>Partner</th>
            <th className={thClass}>Gave</th>
            <th className={thClass}>Received</th>
            <th className={`${thClass} text-right`}>Out value</th>
            <th className={`${thClass} text-right`}>In value</th>
            <th className={`${thClass} text-right`}>Net cash</th>
            <th
              className={`${thClass} text-right`}
              title="Gain hitting P&L now — cash that can't be deferred into a received card's basis. Card-for-card swaps realize $0 here."
            >
              Realized (P&L)
            </th>
            <th
              className={`${thClass} text-right`}
              title="Gain rolled into the received card's cost basis. Realizes as profit when that card sells."
            >
              Deferred (basis)
            </th>
            <th className={thClass}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-6 text-center text-[color:var(--biz-muted)]"
              >
                Loading trades...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={10}
                className="px-3 py-6 text-center text-[color:var(--biz-muted)]"
              >
                No trades found for this range.
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((trade) => (
              <tr
                key={trade.id}
                className="transition-colors hover:bg-[color:var(--biz-hover)]"
              >
                <td className={`${tdClass} tabular-nums text-[color:var(--biz-muted)]`}>
                  {new Date(trade.traded_at).toISOString().slice(0, 10)}
                </td>
                <td className={`${tdClass} text-[color:var(--biz-text-strong)]`}>
                  {trade.partnerLabel}
                </td>
                <td className={`${tdClass} text-[color:var(--biz-muted)]`}>
                  {trade.outSummary}
                </td>
                <td className={`${tdClass} text-[color:var(--biz-muted)]`}>
                  {trade.inSummary}
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {formatMoney(trade.outValue)}
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {formatMoney(trade.inValue)}
                </td>
                <td
                  className={`${tdClass} text-right tabular-nums ${
                    trade.netCash >= 0 ? "ledger-pnl-pos" : "ledger-pnl-neg"
                  }`}
                >
                  {formatMoney(trade.netCash)}
                </td>
                <td
                  className={`${tdClass} text-right tabular-nums font-medium ${
                    trade.recognized > 0
                      ? "ledger-pnl-pos"
                      : trade.recognized < 0
                        ? "ledger-pnl-neg"
                        : "text-[color:var(--biz-muted)]"
                  }`}
                >
                  {trade.recognized === 0 ? "—" : formatMoney(trade.recognized)}
                </td>
                <td
                  className={`${tdClass} text-right tabular-nums ${
                    trade.deferred >= 0 ? "ledger-pnl-pos" : "ledger-pnl-neg"
                  }`}
                >
                  {formatMoney(trade.deferred)}
                </td>
                <td className={tdClass}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Undo this trade? Outgoing cards return to inventory and incoming cards are removed."
                        )
                      )
                        return;
                      setDeletingId(trade.id);
                      try {
                        await onDeleteTrade(trade.id);
                      } catch {
                        // Toast is handled by the parent.
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    disabled={deletingId === trade.id}
                    className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-danger)] transition-colors hover:border-[color:var(--biz-danger)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)] disabled:opacity-60"
                  >
                    {deletingId === trade.id ? "..." : "Undo"}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
