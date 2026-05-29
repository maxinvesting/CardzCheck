"use client";

import { useMemo, useState } from "react";
import type { BusinessSale } from "@/types";
import { formatMoney } from "@/lib/business/sales-utils";
import SaleFormModal from "@/components/business/SaleFormModal";
import type { StoreTier } from "@/lib/business/EbayProfitEngine";

export interface SalesFilters {
  from: string;
  to: string;
  channel: string;
  search: string;
}

interface Props {
  sales: BusinessSale[];
  loading: boolean;
  filters: SalesFilters;
  onFiltersChange: (next: SalesFilters) => void;
  onEditSale: (saleId: string, updates: Record<string, unknown>) => Promise<void>;
  onDeleteSale: (saleId: string) => Promise<void>;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  storeTier?: StoreTier;
}

const CHANNEL_OPTIONS = ["", "ebay", "whatnot", "instagram", "show", "local", "other", "veriswap"] as const;

const inputClass =
  "mt-1 w-full border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-3 py-2 text-xs text-[color:var(--biz-text)] placeholder:text-[color:var(--biz-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]";

const thClass =
  "px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[color:var(--biz-muted)] border-b border-[color:var(--biz-border)]";

const tdClass =
  "px-3 py-2 align-middle text-[13px] leading-snug text-[color:var(--biz-text)] border-b border-[color:var(--biz-border-subtle)]";

export default function SalesTable({
  sales,
  loading,
  filters,
  onFiltersChange,
  onEditSale,
  onDeleteSale,
  page,
  pageSize,
  total,
  onPageChange,
  storeTier = "none",
}: Props) {
  const [editingSale, setEditingSale] = useState<BusinessSale | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = useMemo(
    () =>
      sales.map((sale) => {
        const gross = sale.gross_revenue_cents;
        const totalFees =
          sale.platform_fees_cents + sale.shipping_cost_cents + sale.tax_cents;
        return {
          ...sale,
          gross,
          totalFees,
          title: sale.inventory_item?.title?.trim() || "Unlinked sale",
        };
      }),
    [sales]
  );

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
        <label className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              onFiltersChange({ ...filters, from: event.target.value })
            }
            className={inputClass}
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              onFiltersChange({ ...filters, to: event.target.value })
            }
            className={inputClass}
          />
        </label>
        <label className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
          Channel
          <select
            value={filters.channel}
            onChange={(event) =>
              onFiltersChange({ ...filters, channel: event.target.value })
            }
            className={inputClass}
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All channels"}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2 text-[11px] uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
          Search
          <input
            type="text"
            value={filters.search}
            onChange={(event) =>
              onFiltersChange({ ...filters, search: event.target.value })
            }
            placeholder="Search notes/order id"
            className={inputClass}
          />
        </label>
      </div>

      <div className="overflow-x-auto border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]">
        <table className="w-full min-w-[1100px] border-collapse text-left text-xs font-data">
          <thead className="bg-[color:var(--biz-near-black)]">
            <tr>
              <th className={thClass}>Sold</th>
              <th className={thClass}>Title</th>
              <th className={thClass}>Channel</th>
              <th className={`${thClass} text-right`}>Gross</th>
              <th className={`${thClass} text-right`}>Fees</th>
              <th className={`${thClass} text-right`}>Net</th>
              <th className={`${thClass} text-right`}>COGS</th>
              <th className={`${thClass} text-right`}>Profit</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-[color:var(--biz-muted)]"
                >
                  Loading sales...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-[color:var(--biz-muted)]"
                >
                  No sales found for this range.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((sale) => (
                <tr
                  key={sale.id}
                  className="transition-colors hover:bg-[color:var(--biz-hover)]"
                >
                  <td className={`${tdClass} tabular-nums text-[color:var(--biz-muted)]`}>
                    {new Date(sale.sold_at).toISOString().slice(0, 10)}
                  </td>
                  <td className={`${tdClass} text-[color:var(--biz-text-strong)]`}>
                    {sale.title}
                  </td>
                  <td className={`${tdClass} text-[color:var(--biz-muted)]`}>
                    {sale.channel}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatMoney(sale.gross)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-[color:var(--biz-muted)]`}>
                    {formatMoney(sale.totalFees)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {formatMoney(sale.net_payout_cents)}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums text-[color:var(--biz-muted)]`}>
                    {formatMoney(sale.cogs_cents)}
                  </td>
                  <td
                    className={`${tdClass} text-right tabular-nums font-medium ${
                      sale.profit_cents >= 0 ? "ledger-pnl-pos" : "ledger-pnl-neg"
                    }`}
                  >
                    {formatMoney(sale.profit_cents)}
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingSale(sale)}
                        className="border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-surface-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-text-strong)] transition-colors hover:bg-[color:var(--biz-hover)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Delete this sale record?")) return;
                          setDeletingId(sale.id);
                          try {
                            await onDeleteSale(sale.id);
                          } catch {
                            // Toast is handled by the parent.
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                        disabled={deletingId === sale.id}
                        className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--biz-danger)] transition-colors hover:border-[color:var(--biz-danger)] focus:outline-none focus:ring-1 focus:ring-[color:var(--biz-focus)] disabled:opacity-60"
                      >
                        {deletingId === sale.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-[color:var(--biz-muted)]">
        <span>
          Showing {(page - 1) * pageSize + (rows.length > 0 ? 1 : 0)}-
          {(page - 1) * pageSize + rows.length} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-1 text-xs uppercase tracking-[0.04em] text-[color:var(--biz-text)] transition-colors hover:border-[color:var(--biz-border-strong)] disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 py-1 text-xs uppercase tracking-[0.04em] text-[color:var(--biz-text)] transition-colors hover:border-[color:var(--biz-border-strong)] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {editingSale && (
        <SaleFormModal
          isOpen
          title="Edit sale"
          submitLabel="Save sale"
          defaults={editingSale}
          onClose={() => setEditingSale(null)}
          onSubmit={async (payload) => {
            await onEditSale(editingSale.id, payload);
            setEditingSale(null);
          }}
          showCogsField
          storeTier={storeTier}
        />
      )}
    </div>
  );
}
