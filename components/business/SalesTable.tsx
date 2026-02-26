"use client";

import { useMemo, useState } from "react";
import type { BusinessSale } from "@/types";
import { formatMoney } from "@/lib/business/sales-utils";
import SaleFormModal from "@/components/business/SaleFormModal";

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
}

const CHANNEL_OPTIONS = ["", "ebay", "whatnot", "instagram", "show", "local", "other"] as const;

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
          title: sale.inventory_item?.title || "Unlinked sale",
        };
      }),
    [sales]
  );

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
        <label className="text-[11px] text-gray-400">
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              onFiltersChange({ ...filters, from: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="text-[11px] text-gray-400">
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              onFiltersChange({ ...filters, to: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white"
          />
        </label>
        <label className="text-[11px] text-gray-400">
          Channel
          <select
            value={filters.channel}
            onChange={(event) =>
              onFiltersChange({ ...filters, channel: event.target.value })
            }
            className="mt-1 w-full rounded border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white"
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All channels"}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2 text-[11px] text-gray-400">
          Search
          <input
            type="text"
            value={filters.search}
            onChange={(event) =>
              onFiltersChange({ ...filters, search: event.target.value })
            }
            placeholder="Search notes/order id"
            className="mt-1 w-full rounded border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-800 bg-gray-900">
            <tr>
              <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500">Sold</th>
              <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500">Title</th>
              <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500">Channel</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500">Gross</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500">Fees</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500">Net</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500">COGS</th>
              <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-gray-500">Profit</th>
              <th className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/70">
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  Loading sales...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  No sales found for this range.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-800/40">
                  <td className="px-2 py-1.5 text-gray-300">
                    {new Date(sale.sold_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-2 py-1.5 text-gray-300">{sale.title}</td>
                  <td className="px-2 py-1.5 text-gray-300">{sale.channel}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">
                    {formatMoney(sale.gross)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-300">
                    {formatMoney(sale.totalFees)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">
                    {formatMoney(sale.net_payout_cents)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-300">
                    {formatMoney(sale.cogs_cents)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums font-medium ${
                      sale.profit_cents >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatMoney(sale.profit_cents)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingSale(sale)}
                        className="rounded bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-200 hover:bg-gray-700"
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
                        className="rounded bg-red-900/50 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-800/60 disabled:opacity-60"
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

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span>
          Showing {(page - 1) * pageSize + (rows.length > 0 ? 1 : 0)}-
          {(page - 1) * pageSize + rows.length} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
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
            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
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
        />
      )}
    </div>
  );
}
