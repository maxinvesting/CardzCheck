"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import { createClient } from "@/lib/supabase/client";
import type { BusinessSale } from "@/types";

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function SalesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const loadSales = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const res = await fetch(`/api/business/sales?${params}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setHasAccess(true);
      setSales(data.sales ?? []);
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      loadSales();
    }
    init();
  }, [router, loadSales]);

  const totals = useMemo(() => {
    const revenue = sales.reduce((acc, s) => acc + s.sale_price_cents, 0);
    const net = sales.reduce((acc, s) => acc + s.net_proceeds_cents, 0);
    const profit = sales.reduce((acc, s) => acc + s.profit_cents, 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, net, profit, margin };
  }, [sales]);

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-800 rounded" />
            <div className="h-64 bg-gray-800 rounded-xl" />
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/business"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-white">Sales Ledger</h1>
            </div>
            <p className="text-gray-400 text-sm">
              All sales with totals and margin analysis
            </p>
          </div>
          <a
            href="/api/business/export?type=sales"
            className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Export for Accounting
          </a>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-4 mb-6">
          <div>
            <label className="block text-xs text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            onClick={loadSales}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
          >
            Apply
          </button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Revenue
            </p>
            <p className="text-xl font-bold text-white tabular-nums">
              {fmtCents(totals.revenue)}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Net Proceeds
            </p>
            <p className="text-xl font-bold text-white tabular-nums">
              {fmtCents(totals.net)}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Profit
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                totals.profit >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {totals.profit >= 0 ? "+" : ""}
              {fmtCents(totals.profit)}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              Margin
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                totals.margin >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {totals.margin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Sales table */}
        <div className="overflow-x-auto border border-gray-800 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Buyer
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-right">
                  Sale Price
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-right">
                  Fees
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-right">
                  Net
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider text-right">
                  Profit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sales.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No sales found for this date range.
                  </td>
                </tr>
              )}
              {sales.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-gray-900/50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-300">{s.sale_date}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {s.order_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {s.buyer_handle || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-right tabular-nums">
                    {fmtCents(s.sale_price_cents)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-right tabular-nums">
                    {fmtCents(s.platform_fees_cents)}
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-right tabular-nums">
                    {fmtCents(s.net_proceeds_cents)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      s.profit_cents >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {s.profit_cents >= 0 ? "+" : ""}
                    {fmtCents(s.profit_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          {sales.length} sale{sales.length !== 1 ? "s" : ""}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
