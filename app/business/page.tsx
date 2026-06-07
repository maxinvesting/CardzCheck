"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessDashboardView from "@/components/business/BusinessDashboardView";
import SaleFormModal from "@/components/business/SaleFormModal";
import { createClient } from "@/lib/supabase/client";
import type {
  BusinessMetrics as MetricsType,
  BusinessPeriodMetrics,
  BusinessSale,
  MarketplaceListingPreview,
  UserStorefront,
} from "@/types";
import { normalizeEbayStoreUrl, buildEbayStoreHref } from "@/lib/ebay-store-url";
import { parseInventoryVoiceCommand } from "@/lib/voice-commands";

const EBAY_STORE_URL_STORAGE_KEY = "cardzcheck_ebay_store_url";
const EBAY_STORE_URL_UPDATED_EVENT = "cardzcheck:ebay-store-url-updated";

function readStoredEbayStoreUrl(): string | null {
  if (typeof window === "undefined") return null;
  return normalizeEbayStoreUrl(
    window.sessionStorage.getItem(EBAY_STORE_URL_STORAGE_KEY)
  );
}

function persistEbayStoreUrl(value: string | null) {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem(EBAY_STORE_URL_STORAGE_KEY, value);
  } else {
    window.sessionStorage.removeItem(EBAY_STORE_URL_STORAGE_KEY);
  }
}

function BusinessDashboardContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [ebayStoreUrl, setEbayStoreUrl] = useState<string | null>(() =>
    readStoredEbayStoreUrl()
  );
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [periodMetrics, setPeriodMetrics] = useState<BusinessPeriodMetrics | null>(null);
  const [periodMetricsLoading, setPeriodMetricsLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<BusinessSale[]>([]);
  const [recentSalesLoading, setRecentSalesLoading] = useState(false);
  const [listings, setListings] = useState<MarketplaceListingPreview[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [storefronts, setStorefronts] = useState<UserStorefront[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [recordSaleOpen, setRecordSaleOpen] = useState(false);

  const ebayStoreHref = useMemo(
    () => buildEbayStoreHref(ebayStoreUrl),
    [ebayStoreUrl]
  );

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

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/business/kpis?range=mtd", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMetrics({
          revenueMtd: data.revenue_mtd_cents ?? 0,
          revenueYtd: data.revenue_ytd_cents ?? 0,
          profitMtd: data.profit_mtd_cents ?? 0,
          profitYtd: data.profit_ytd_cents ?? 0,
          salesCountMtd: data.sales_count_mtd ?? 0,
          salesCountYtd: data.sales_count_ytd ?? 0,
          activeInventoryCount: data.active_inventory_count ?? 0,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const loadPeriodMetrics = useCallback(async () => {
    setPeriodMetricsLoading(true);
    try {
      const res = await fetch("/api/business/kpis/periods", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.periods) setPeriodMetrics(data.periods as BusinessPeriodMetrics);
      }
    } catch {
      // ignore — snapshot degrades to zeros
    } finally {
      setPeriodMetricsLoading(false);
    }
  }, []);

  const loadListings = useCallback(async () => {
    setListingsLoading(true);
    try {
      const res = await fetch("/api/marketplace/listings/mine", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setListings((data.listings ?? []) as MarketplaceListingPreview[]);
      }
    } catch {
      // marketplace preview is non-critical
    } finally {
      setListingsLoading(false);
    }
  }, []);

  const loadStorefronts = useCallback(async () => {
    try {
      const res = await fetch("/api/business/storefronts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStorefronts(data.storefronts ?? []);
      }
    } catch {
      // storefronts are non-critical, fail silently
    }
  }, []);

  const loadRecentSales = useCallback(async () => {
    setRecentSalesLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
        page: "1",
        page_size: "8",
      });
      const res = await fetch(`/api/business/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setRecentSales(data.sales ?? []);
      }
    } catch {
      // ignore
    } finally {
      setRecentSalesLoading(false);
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
        const apiEbayStoreUrl = normalizeEbayStoreUrl(data.ebay_store_url);
        setBusinessName(apiBusinessName ?? null);
        setEbayStoreUrl(apiEbayStoreUrl);
        persistEbayStoreUrl(apiEbayStoreUrl);
        return user;
      }
    } catch {
      // fall through to client-side resolution
    }

    const metadataEbayStoreUrl = normalizeEbayStoreUrl(
      typeof user.user_metadata?.ebay_store_url === "string"
        ? user.user_metadata.ebay_store_url
        : null
    );
    const storedEbayStoreUrl = readStoredEbayStoreUrl();

    const { data: userData, error: userDataError } = await supabase
      .from("users")
      .select("business_name, ebay_store_url")
      .eq("id", user.id)
      .maybeSingle();

    if (
      userDataError &&
      String(userDataError.message || "").toLowerCase().includes("ebay_store_url")
    ) {
      const { data: fallbackUserData } = await supabase
        .from("users")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      setBusinessName(fallbackUserData?.business_name || null);
      const resolvedEbayStoreUrl = metadataEbayStoreUrl || storedEbayStoreUrl;
      setEbayStoreUrl(resolvedEbayStoreUrl);
      persistEbayStoreUrl(resolvedEbayStoreUrl);
    } else {
      setBusinessName(userData?.business_name || null);
      const resolvedEbayStoreUrl =
        normalizeEbayStoreUrl(userData?.ebay_store_url) ||
        metadataEbayStoreUrl ||
        storedEbayStoreUrl;
      setEbayStoreUrl(resolvedEbayStoreUrl);
      persistEbayStoreUrl(resolvedEbayStoreUrl);
    }
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
        loadMetrics(),
        loadPeriodMetrics(),
        loadRecentSales(),
        loadListings(),
        loadStorefronts(),
      ]);
    }
    init();
  }, [
    router,
    loadUserProfile,
    loadInventory,
    loadMetrics,
    loadPeriodMetrics,
    loadRecentSales,
    loadListings,
    loadStorefronts,
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
    const handleEbayStoreUrlUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ value?: string | null }>;
      setEbayStoreUrl(normalizeEbayStoreUrl(customEvent.detail?.value ?? null));
    };
    window.addEventListener(
      EBAY_STORE_URL_UPDATED_EVENT,
      handleEbayStoreUrlUpdated as EventListener
    );
    return () => {
      window.removeEventListener(
        EBAY_STORE_URL_UPDATED_EVENT,
        handleEbayStoreUrlUpdated as EventListener
      );
    };
  }, []);

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
        await Promise.all([loadMetrics(), loadPeriodMetrics(), loadRecentSales()]);
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to record sale",
        });
      }
    },
    [loadMetrics, loadPeriodMetrics, loadRecentSales]
  );

  const handleDashboardVoiceCommand = useCallback(
    (transcript: string) => {
      const command = parseInventoryVoiceCommand(transcript);
      if (command.type === "cancel") {
        setToast({ type: "success", message: "Voice action canceled" });
        return;
      }
      if (
        command.type === "confirm" ||
        command.type === "delete_card" ||
        command.type === "mark_sold"
      ) {
        setToast({ type: "error", message: "Manage individual cards from the Ledger" });
        return;
      }
      router.push(`/business/consultant?prompt=${encodeURIComponent(command.transcript)}`);
    },
    [router]
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
          <BusinessPaywall />
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-2">
        <BusinessDashboardView
          businessName={businessName}
          periodMetrics={periodMetrics}
          periodMetricsLoading={periodMetricsLoading}
          metrics={metrics}
          recentSales={recentSales}
          recentSalesLoading={recentSalesLoading}
          listings={listings}
          listingsLoading={listingsLoading}
          ebayStoreHref={ebayStoreHref}
          needsMigration={needsMigration}
          storefronts={storefronts}
          onRecordSale={() => setRecordSaleOpen(true)}
          onRecordTrade={handleRecordTrade}
          onDashboardVoiceCommand={handleDashboardVoiceCommand}
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
