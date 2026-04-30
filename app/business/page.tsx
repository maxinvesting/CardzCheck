"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessDashboardView from "@/components/business/BusinessDashboardView";
import BusinessVoiceMode from "@/components/business/BusinessVoiceMode";
import SaleFormModal from "@/components/business/SaleFormModal";
import { createClient } from "@/lib/supabase/client";
import type {
  BusinessInventoryItem,
  BusinessMetrics as MetricsType,
  BusinessSale,
  UserStorefront,
} from "@/types";
import {
  computeInventoryValueSummary,
  type InventoryValueSummary,
} from "@/lib/business/inventory-value";
import { normalizeEbayStoreUrl, buildEbayStoreHref } from "@/lib/ebay-store-url";
import {
  type InventoryVoiceCommand,
  type VoiceSalesChannel,
} from "@/lib/voice-commands";

const EBAY_STORE_URL_STORAGE_KEY = "cardzcheck_ebay_store_url";
const EBAY_STORE_URL_UPDATED_EVENT = "cardzcheck:ebay-store-url-updated";
const SALES_CHANNELS: VoiceSalesChannel[] = [
  "ebay",
  "whatnot",
  "instagram",
  "show",
  "local",
  "other",
];

function coerceSalesChannel(value: string | null | undefined): VoiceSalesChannel {
  return SALES_CHANNELS.includes(value as VoiceSalesChannel)
    ? (value as VoiceSalesChannel)
    : "ebay";
}

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
  const [storefronts, setStorefronts] = useState<UserStorefront[]>([]);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [markSoldItem, setMarkSoldItem] = useState<BusinessInventoryItem | null>(null);
  const [markSoldVoiceDefaults, setMarkSoldVoiceDefaults] = useState<
    Partial<BusinessSale> & {
      inventory_item_id?: string | null;
      channel?: string | null;
      sold_at?: string | null;
    } | null
  >(null);
  const [pendingVoiceDeleteItem, setPendingVoiceDeleteItem] =
    useState<BusinessInventoryItem | null>(null);

  const ebayStoreHref = useMemo(
    () => buildEbayStoreHref(ebayStoreUrl),
    [ebayStoreUrl]
  );

  const inventorySummary = useMemo((): InventoryValueSummary | null => {
    const activeItems = items.filter(
      (it) => it.status !== "sold" && it.status !== "returned"
    );
    return computeInventoryValueSummary(activeItems);
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
        loadRecentSales(),
        loadStorefronts(),
      ]);
    }
    init();
  }, [router, loadUserProfile, loadInventory, loadMetrics, loadRecentSales, loadStorefronts]);

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

  const deleteInventoryItem = useCallback(
    async (item: BusinessInventoryItem) => {
      try {
        const res = await fetch(`/api/business/inventory?ids=${encodeURIComponent(item.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setToast({ type: "success", message: "Card deleted" });
        await Promise.all([loadMetrics(), loadRecentSales()]);
      } catch {
        setToast({ type: "error", message: "Delete failed" });
      }
    },
    [loadMetrics, loadRecentSales]
  );

  const handleCreateSale = useCallback(
    async (sale: Record<string, unknown>) => {
      const inventoryId = (sale.inventory_item_id as string | null) || null;
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
        if (inventoryId) {
          setItems((prev) => prev.filter((it) => it.id !== inventoryId));
        }
        setToast({ type: "success", message: "Sale recorded" });
        await Promise.all([loadMetrics(), loadRecentSales()]);
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to record sale",
        });
      }
    },
    [loadMetrics, loadRecentSales]
  );

  const handleVoiceModeCommand = useCallback(
    async ({
      command,
      item,
    }: {
      transcript: string;
      command: InventoryVoiceCommand;
      item: BusinessInventoryItem | null;
    }) => {
      if (command.type === "cancel") {
        setPendingVoiceDeleteItem(null);
        setMarkSoldItem(null);
        setMarkSoldVoiceDefaults(null);
        setToast({ type: "success", message: "Voice action canceled" });
        return "Canceled.";
      }
      if (command.type === "confirm") {
        if (!pendingVoiceDeleteItem) {
          setToast({ type: "error", message: "No voice action is waiting for confirmation" });
          return "Nothing is waiting for confirmation.";
        }
        const itemToDelete = pendingVoiceDeleteItem;
        setPendingVoiceDeleteItem(null);
        await deleteInventoryItem(itemToDelete);
        return `Deleted ${itemToDelete.title || "that card"}.`;
      }
      if (command.type === "delete_card") {
        if (!item) {
          const message = "Which card should I delete? Say delete plus the card name.";
          setToast({ type: "error", message });
          return message;
        }
        setMarkSoldItem(null);
        setMarkSoldVoiceDefaults(null);
        setPendingVoiceDeleteItem(item);
        setToast({ type: "success", message: "Say confirm delete, or use the confirm button" });
        return `I found ${item.title || "that card"}. Confirm before I delete it.`;
      }

      if (command.type === "mark_sold") {
        if (!item) {
          const message = "Which card should I mark sold? Say the card name and sale price.";
          setToast({ type: "error", message });
          return message;
        }
        if (item.status === "sold") {
          setToast({ type: "error", message: "This item is already marked sold" });
          return "That item is already marked sold.";
        }
        setPendingVoiceDeleteItem(null);
        setMarkSoldVoiceDefaults({
          inventory_item_id: item.id,
          channel: command.channel ?? coerceSalesChannel(item.channel),
          sold_at: command.soldAt ?? new Date().toISOString(),
          sold_price_cents: command.salePriceCents ?? undefined,
          cogs_cents: item.cost_basis_total_cents,
        });
        setMarkSoldItem(item);
        setToast({
          type: "success",
          message: command.salePriceCents
            ? "Voice sale draft ready"
            : "Voice sale draft opened. Add a sold price to record it.",
        });
        return command.salePriceCents
          ? `I opened a sale draft for ${item.title || "that card"}. Review it, then record the sale.`
          : `I opened a sale draft for ${item.title || "that card"}. Add the sale price, then record it.`;
      }

      router.push(
        `/business/consultant?prompt=${encodeURIComponent(
          item
            ? `For ${item.title || "this inventory item"}, ${command.transcript}`
            : command.transcript
        )}`
      );
      return "I'll open that with the Business Consultant.";
    },
    [deleteInventoryItem, pendingVoiceDeleteItem, router]
  );

  if (loading) {
    return (
      <AuthenticatedLayout>
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
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-2">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-7xl px-4 py-2">
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
          storefronts={storefronts}
        />
        <BusinessVoiceMode
          businessName={businessName}
          contextLabel="Business dashboard"
          items={items}
          pendingDeleteItem={pendingVoiceDeleteItem}
          onCommand={handleVoiceModeCommand}
          onError={(message) => setToast({ type: "error", message })}
        />
        <SaleFormModal
          isOpen={Boolean(markSoldItem)}
          title={markSoldItem ? `Mark as sold: ${markSoldItem.title}` : "Mark as sold"}
          submitLabel="Record sale"
          defaults={
            markSoldItem
              ? {
                  inventory_item_id: markSoldItem.id,
                  channel: markSoldItem.channel,
                  sold_at: new Date().toISOString(),
                  cogs_cents: markSoldItem.cost_basis_total_cents,
                  ...markSoldVoiceDefaults,
                }
              : undefined
          }
          onClose={() => {
            setMarkSoldItem(null);
            setMarkSoldVoiceDefaults(null);
          }}
          onSubmit={async (payload) => {
            await handleCreateSale(payload as unknown as Record<string, unknown>);
            setMarkSoldItem(null);
            setMarkSoldVoiceDefaults(null);
          }}
          showCogsField={false}
        />
        {pendingVoiceDeleteItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-gray-900 shadow-2xl">
              <h3 className="text-lg font-bold">Delete this card?</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {pendingVoiceDeleteItem.title || "This inventory item"} will be removed from
                business inventory. This cannot be undone.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingVoiceDeleteItem(null);
                    setToast({ type: "success", message: "Voice delete canceled" });
                  }}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const itemToDelete = pendingVoiceDeleteItem;
                    setPendingVoiceDeleteItem(null);
                    void deleteInventoryItem(itemToDelete);
                  }}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
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
    </AuthenticatedLayout>
  );
}

export default function BusinessDashboardPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
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
        </AuthenticatedLayout>
      }
    >
      <BusinessDashboardContent />
    </Suspense>
  );
}
