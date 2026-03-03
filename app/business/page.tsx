"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessDashboardView from "@/components/business/BusinessDashboardView";
import { createClient } from "@/lib/supabase/client";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
} from "@/types";
import {
  computeInventoryValueSummary,
  type InventoryValueSummary,
} from "@/lib/business/inventory-value";
import { normalizeEbayStoreUrl, buildEbayStoreHref } from "@/lib/ebay-store-url";

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
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<BusinessSale[]>([]);
  const [recentSalesLoading, setRecentSalesLoading] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);

  const ebayStoreHref = useMemo(
    () => buildEbayStoreHref(ebayStoreUrl),
    [ebayStoreUrl]
  );

  const inventorySummary = useMemo((): InventoryValueSummary | null => {
    return computeInventoryValueSummary(items);
  }, [items]);

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
        setItems([]);
        return;
      }
      setNeedsMigration(false);
      setHasAccess(true);
      setItems(data.items ?? []);
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
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
    } finally {
      setMetricsLoading(false);
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
    await supabase.auth.refreshSession();
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
      await Promise.all([loadInventory(), loadMetrics(), loadRecentSales()]);
    }
    init();
  }, [router, loadUserProfile, loadInventory, loadMetrics, loadRecentSales]);

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

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-800 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-800 rounded-lg" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-48 bg-gray-800 rounded-lg" />
              <div className="h-48 bg-gray-800 rounded-lg" />
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-4">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="max-w-7xl mx-auto px-4 py-3">
        <BusinessDashboardView
          businessName={businessName}
          metrics={metrics}
          metricsLoading={metricsLoading}
          inventorySummary={inventorySummary}
          items={items}
          recentSales={recentSales}
          recentSalesLoading={recentSalesLoading}
          ebayStoreHref={ebayStoreHref}
          needsMigration={needsMigration}
        />
      </main>
    </AuthenticatedLayout>
  );
}

export default function BusinessDashboardPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <main className="max-w-7xl mx-auto px-4 py-4">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-48 bg-gray-800 rounded" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-800 rounded-lg" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-48 bg-gray-800 rounded-lg" />
                <div className="h-48 bg-gray-800 rounded-lg" />
              </div>
            </div>
          </main>
        </AuthenticatedLayout>
      }
    >
      <BusinessDashboardContent />
    </Suspense>
  );
}
