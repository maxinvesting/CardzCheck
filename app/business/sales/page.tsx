"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import SalesTable, { type SalesFilters } from "@/components/business/SalesTable";
import { createClient } from "@/lib/supabase/client";
import type { BusinessSale } from "@/types";
import { formatMoney } from "@/lib/business/sales-utils";

const PAGE_SIZE = 25;

function defaultFilters(): SalesFilters {
  const now = new Date();
  const from = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    channel: "",
    search: "",
  };
}

export default function BusinessSalesHistoryPage() {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SalesFilters>(defaultFilters);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: filters.from,
        to: filters.to,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await fetch(`/api/business/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      if (res.status === 403) {
        setHasAccess(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load sales");
      const data = await res.json();
      setHasAccess(true);
      setSales(data.sales ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load sales",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, page, router]);

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
      void loadSales();
    }
    void init();
  }, [router, loadSales]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleEditSale = useCallback(
    async (saleId: string, updates: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/business/sales/${saleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update sale");
        }
        setToast({ type: "success", message: "Sale updated" });
        await loadSales();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to update sale",
        });
      }
    },
    [loadSales]
  );

  const handleDeleteSale = useCallback(
    async (saleId: string) => {
      try {
        const res = await fetch(`/api/business/sales/${saleId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete sale");
        }
        setToast({ type: "success", message: "Sale deleted" });
        await loadSales();
      } catch (err) {
        setToast({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to delete sale",
        });
      }
    },
    [loadSales]
  );

  const summary = useMemo(() => {
    let gross = 0;
    let net = 0;
    let profit = 0;
    for (const s of sales) {
      gross += s.gross_revenue_cents;
      net += s.net_payout_cents;
      profit += s.profit_cents;
    }
    return { gross, net, profit };
  }, [sales]);

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="min-h-screen bg-[#090B0D] px-4 py-4">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                Inventory
              </div>
              <h1 className="mt-0.5 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
                Sales
              </h1>
            </div>
            <a
              href="/api/business/export?type=sales"
              className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Export
            </a>
          </header>

          <div className="grid grid-cols-1 gap-px border-b border-[#24282D] bg-[#24282D] sm:grid-cols-4">
            <SummaryCell label="Sales in range" value={String(total)} />
            <SummaryCell label="Gross revenue" value={formatMoney(summary.gross)} />
            <SummaryCell label="Net payout" value={formatMoney(summary.net)} />
            <SummaryCell
              label="Profit"
              value={formatMoney(summary.profit)}
              tone={summary.profit >= 0 ? "positive" : "negative"}
            />
          </div>

          <section className="min-w-0 flex-1 px-4 py-4">
            <SalesTable
              sales={sales}
              loading={loading}
              filters={filters}
              onFiltersChange={(next) => {
                setFilters(next);
                setPage(1);
              }}
              onEditSale={handleEditSale}
              onDeleteSale={handleDeleteSale}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </section>
        </div>
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 rounded border px-4 py-2 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-700 bg-emerald-900/90 text-emerald-50"
                : "border-red-700 bg-red-900/90 text-red-50"
            }`}
          >
            {toast.message}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-red-400"
      : "text-[#E6E8EB]";
  return (
    <div className="bg-[#090B0D] px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
        {label}
      </div>
      <div className={`mt-0.5 text-[18px] font-semibold tracking-normal ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
