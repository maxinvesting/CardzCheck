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
        <label className="text-[11px] text-[#77808C]">
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              onFiltersChange({ ...filters, from: event.target.value })
            }
            className="mt-1 w-full rounded border border-[#24282D] bg-[#0F1216] px-3 py-2 text-xs text-[#E6E8EB] [color-scheme:dark]"
          />
        </label>
        <label className="text-[11px] text-[#77808C]">
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              onFiltersChange({ ...filters, to: event.target.value })
            }
            className="mt-1 w-full rounded border border-[#24282D] bg-[#0F1216] px-3 py-2 text-xs text-[#E6E8EB] [color-scheme:dark]"
          />
        </label>
        <label className="text-[11px] text-[#77808C]">
          Channel
          <select
            value={filters.channel}
            onChange={(event) =>
              onFiltersChange({ ...filters, channel: event.target.value })
            }
            className="mt-1 w-full rounded border border-[#24282D] bg-[#0F1216] px-3 py-2 text-xs text-[#E6E8EB] [color-scheme:dark]"
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option || "all"} value={option}>
                {option || "All channels"}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2 text-[11px] text-[#77808C]">
          Search
          <input
            type="text"
            value={filters.search}
            onChange={(event) =>
              onFiltersChange({ ...filters, search: event.target.value })
            }
            placeholder="Search notes/order id"
            className="mt-1 w-full rounded border border-[#24282D] bg-[#0F1216] px-3 py-2 text-xs text-[#E6E8EB] placeholder:text-[#77808C]"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#24282D] bg-[#0F1216]">
        <table className="w-full text-left text-xs text-[#E6E8EB]">
          <thead className="sticky top-0 z-10 border-b border-[#24282D] bg-[#14181D]">
            <tr>
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Sold</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Title</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Channel</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Gross</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Fees</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Net</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">COGS</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Profit</th>
              <th className="border-l border-[#24282D] px-3 py-2 text-[11px] font-semibold uppercase tracking-normal text-[#77808C]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--biz-border)]">
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[#77808C]">
                  Loading sales...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[#77808C]">
                  No sales found for this range.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((sale) => (
                <tr key={sale.id} className="hover:bg-[#14181D]">
                  <td className="px-3 py-2 text-[#E6E8EB]">
                    {new Date(sale.sold_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-[#E6E8EB]">{sale.title}</td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-[#E6E8EB]">{sale.channel}</td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                    {formatMoney(sale.gross)}
                  </td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                    {formatMoney(sale.totalFees)}
                  </td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                    {formatMoney(sale.net_payout_cents)}
                  </td>
                  <td className="border-l border-[#24282D] px-3 py-2 text-right tabular-nums text-[#E6E8EB]">
                    {formatMoney(sale.cogs_cents)}
                  </td>
                  <td
                    className={`border-l border-[#24282D] px-3 py-2 text-right tabular-nums font-medium ${
                      sale.profit_cents >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatMoney(sale.profit_cents)}
                  </td>
                  <td className="border-l border-[#24282D] px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingSale(sale)}
                        className="rounded border border-[#343941] bg-[#14181D] px-2 py-1 text-[10px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
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
                        className="rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[10px] font-medium text-red-300 hover:border-red-700 hover:bg-red-900/40 disabled:opacity-60"
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

      <div className="mt-2 flex items-center justify-between text-[11px] text-[#77808C]">
        <span>
          Showing {(page - 1) * pageSize + (rows.length > 0 ? 1 : 0)}-
          {(page - 1) * pageSize + rows.length} of {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded border border-[#343941] bg-[#14181D] px-2 py-1 text-xs text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50"
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
            className="rounded border border-[#343941] bg-[#14181D] px-2 py-1 text-xs text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50"
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
