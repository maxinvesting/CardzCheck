"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import BusinessDashboardView, {
  type DashboardSnapshot,
} from "@/components/business/BusinessDashboardView";
import SaleFormModal from "@/components/business/SaleFormModal";
import { createClient } from "@/lib/supabase/client";
import type { FinancialsSummary } from "@/lib/business/financials";

function BusinessDashboardContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [recordSaleOpen, setRecordSaleOpen] = useState(false);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/business/inventory", { cache: "no-store" });
      if (res.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (res.status === 503 && data.needs_migration) {
        setNeedsMigration(true);
        setHasAccess(true);
        return;
      }
      setNeedsMigration(false);
      setHasAccess(true);
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Single source of truth: the dashboard headline figures come from the same
  // Financials summary endpoint the Financials page uses, so they always match.
  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const res = await fetch("/api/business/financials/summary", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as FinancialsSummary;
        const mtd = data.totals?.mtd;
        setSnapshot({
          cashOnHandCents: data.snapshot?.cash_on_hand_cents ?? 0,
          inventoryValueCents: data.snapshot?.inventory_value_cents ?? 0,
          totalValueCents: data.snapshot?.total_business_value_cents ?? 0,
          unrealizedPnlCents: data.snapshot?.unrealized_pnl_cents ?? 0,
          unrealizedPnlPct: data.snapshot?.unrealized_pnl_pct ?? null,
          activeCount: data.snapshot?.active_count ?? 0,
          revenueMtdCents: mtd?.revenue_cents ?? 0,
          profitMtdCents: mtd?.profit_cents ?? 0,
          salesCountMtd: mtd?.sales_count ?? 0,
          marginMtdPct: mtd?.margin_pct ?? null,
        });
      }
    } catch {
      // snapshot degrades to zeros
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const loadUserProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    try {
      const res = await fetch("/api/user/name", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const apiBusinessName =
          typeof data.business_name === "string" ? data.business_name.trim() || null : null;
        setBusinessName(apiBusinessName ?? null);
        return user;
      }
    } catch {
      // fall through to client-side resolution
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_name")
      .eq("id", user.id)
      .maybeSingle();

    setBusinessName(userData?.business_name || null);
    return user;
  }, []);

  useEffect(() => {
    async function init() {
      const user = await loadUserProfile();
      if (!user) {
        router.push("/login?redirect=/business");
        return;
      }
      await Promise.all([
        loadInventory(),
        loadSnapshot(),
      ]);
    }
    init();
  }, [
    router,
    loadUserProfile,
    loadInventory,
    loadSnapshot,
  ]);

  // Refresh profile when returning to tab (e.g. after settings update)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        loadUserProfile();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [loadUserProfile]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleCreateSale = useCallback(
    async (sale: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/business/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to record sale");
        }
        setToast({ type: "success", message: "Sale recorded" });
        await loadSnapshot();
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to record sale",
        });
      }
    },
    [loadSnapshot]
  );

  const handleRecordTrade = useCallback(() => {
    router.push("/business/ledger?action=trade");
  }, [router]);

  if (loading) {
    return (
      <>
        <main className="mx-auto max-w-7xl px-4 py-2">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-[#E5E7EB]" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-[#E5E7EB]" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-48 rounded-lg bg-[#E5E7EB]" />
              <div className="h-48 rounded-lg bg-[#E5E7EB]" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (hasAccess === false) {
    return (
      <>
        <main className="mx-auto max-w-7xl px-4 py-2">
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-2">
        <BusinessDashboardView
          businessName={businessName}
          snapshot={snapshot}
          snapshotLoading={snapshotLoading}
          needsMigration={needsMigration}
          onRecordSale={() => setRecordSaleOpen(true)}
          onRecordTrade={handleRecordTrade}
        />
        <SaleFormModal
          isOpen={recordSaleOpen}
          title="Record a sale"
          submitLabel="Record sale"
          defaults={{ sold_at: new Date().toISOString() }}
          onClose={() => setRecordSaleOpen(false)}
          onSubmit={async (payload) => {
            await handleCreateSale(payload as unknown as Record<string, unknown>);
            setRecordSaleOpen(false);
          }}
          showCogsField
        />
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-[110] rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {toast.message}
          </div>
        )}
      </main>
    </>
  );
}

export default function BusinessDashboardPage() {
  return (
    <Suspense
      fallback={
        <>
          <main className="mx-auto max-w-7xl px-4 py-2">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-48 rounded bg-[#E5E7EB]" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 rounded-lg bg-[#E5E7EB]" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-48 rounded-lg bg-[#E5E7EB]" />
                <div className="h-48 rounded-lg bg-[#E5E7EB]" />
              </div>
            </div>
          </main>
        </>
      }
    >
      <BusinessDashboardContent />
    </Suspense>
  );
}
