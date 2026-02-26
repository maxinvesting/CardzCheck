"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import BusinessAnalystPreviewCard from "@/components/business/BusinessAnalystPreviewCard";
import InventoryTable from "@/components/business/InventoryTable";
import ItemDetailDrawer from "@/components/business/ItemDetailDrawer";
import SalesTable, { type SalesFilters } from "@/components/business/SalesTable";
import SaleFormModal from "@/components/business/SaleFormModal";
import AddInventoryModal from "@/components/business/AddInventoryModal";
import AddWaxModal from "@/components/business/AddWaxModal";
import AddCardToInventoryModal from "@/components/business/AddCardToInventoryModal";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import type { PendingInventoryCard } from "@/components/business/AddCardToInventoryModal";
import AddCardModalNew from "@/components/AddCardModalNew";
import CardPickerModal from "@/components/CardPickerModal";
import type { CardPickerSelection } from "@/components/CardPicker";
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

function defaultSalesFilters(): SalesFilters {
  const now = new Date();
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    channel: "",
    search: "",
  };
}

function BusinessPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [ebayStoreUrl, setEbayStoreUrl] = useState<string | null>(() =>
    readStoredEbayStoreUrl()
  );
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<BusinessInventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showAddCardToInventory, setShowAddCardToInventory] = useState(false);
  const [pendingInventoryCard, setPendingInventoryCard] = useState<PendingInventoryCard | null>(null);
  const [showAddWaxModal, setShowAddWaxModal] = useState(false);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [filteredItems, setFilteredItems] = useState<BusinessInventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"inventory" | "sales">("inventory");
  const [markSoldItem, setMarkSoldItem] = useState<BusinessInventoryItem | null>(null);
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFilters, setSalesFilters] = useState<SalesFilters>(() =>
    defaultSalesFilters()
  );
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize] = useState(50);
  const [salesTotal, setSalesTotal] = useState(0);

  const inventorySummary = useMemo((): InventoryValueSummary | null => {
    const list = filteredItems.length > 0 ? filteredItems : items;
    return computeInventoryValueSummary(list);
  }, [filteredItems, items]);

  const ebayStoreHref = useMemo(
    () => buildEbayStoreHref(ebayStoreUrl),
    [ebayStoreUrl]
  );

  const handleFilteredChange = useCallback((filtered: BusinessInventoryItem[]) => {
    setFilteredItems(filtered);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!showAddDropdown) return;
    const handleClick = () => setShowAddDropdown(false);
    const timer = setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
    };
  }, [showAddDropdown]);

  useEffect(() => {
    if (searchParams.get("notice") === "business_mode") {
      setToast({
        type: "success",
        message: "Business accounts use Inventory/Prospects.",
      });
    }
  }, [searchParams]);

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

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("from", salesFilters.from);
      params.set("to", salesFilters.to);
      params.set("page", String(salesPage));
      params.set("page_size", String(salesPageSize));
      if (salesFilters.channel) params.set("channel", salesFilters.channel);
      if (salesFilters.search.trim()) params.set("search", salesFilters.search.trim());

      const res = await fetch(`/api/business/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setSales(data.sales ?? []);
      setSalesTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setSalesLoading(false);
    }
  }, [salesFilters, salesPage, salesPageSize]);

  const loadUserProfile = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.refreshSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Prefer server-authoritative profile so eBay store URL is always current after saving in Settings
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
      await Promise.all([loadInventory(), loadMetrics()]);
    }
    init();
  }, [router, loadUserProfile, loadInventory, loadMetrics]);

  useEffect(() => {
    if (activeTab !== "sales" || hasAccess === false || needsMigration) return;
    loadSales();
  }, [activeTab, hasAccess, needsMigration, loadSales]);

  // Refetch user profile when returning to the tab (e.g. after adding store link in Settings)
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

  const handleInlineUpdate = async (id: string, field: string, value: any) => {
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message:
            (typeof data?.error === "string" && data.error) ||
            `Failed to update ${field}`,
        });
      }
    } catch {
      setToast({ type: "error", message: "Failed to update item" });
    }
  };

  const handleBulkAction = async (
    action: string,
    ids: string[],
    payload?: any
  ) => {
    try {
      const updates: Record<string, string> = {};
      if (action === "set_status") updates.status = payload;
      if (action === "set_location") updates.location = payload;

      await fetch("/api/business/inventory/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, updates }),
      });

      setToast({ type: "success", message: `Updated ${ids.length} items` });
      loadInventory();
    } catch {
      setToast({ type: "error", message: "Bulk update failed" });
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} item(s)? This cannot be undone.`)) return;

    try {
      await fetch(`/api/business/inventory?ids=${ids.join(",")}`, {
        method: "DELETE",
      });
      setItems((prev) => prev.filter((it) => !ids.includes(it.id)));
      setToast({ type: "success", message: `Deleted ${ids.length} items` });
      loadMetrics();
    } catch {
      setToast({ type: "error", message: "Delete failed" });
    }
  };

  const handleAddItem = async (item: any) => {
    try {
      const res = await fetch("/api/business/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const created = await res.json();
        setItems((prev) => [created, ...prev]);
        setToast({ type: "success", message: `Added "${item.title}"` });
        loadMetrics();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: data.error || "Failed to add item" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to add item" });
    }
  };

  const handleSaveItem = async (
    id: string,
    updates: Partial<BusinessInventoryItem>
  ) => {
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
        setSelectedItem(updated);
        setToast({ type: "success", message: "Item saved" });
        loadMetrics();
      }
    } catch {
      setToast({ type: "error", message: "Failed to save item" });
    }
  };

  const handleMarkSold = (item: BusinessInventoryItem) => {
    setMarkSoldItem(item);
  };

  const handleCreateSale = async (sale: Record<string, unknown>) => {
    const inventoryId = (sale.inventory_item_id as string | null) || null;
    let previousItem: BusinessInventoryItem | null = null;
    if (inventoryId) {
      previousItem = items.find((it) => it.id === inventoryId) || null;
      setItems((prev) =>
        prev.map((it) =>
          it.id === inventoryId
            ? { ...it, status: "sold" as BusinessInventoryItem["status"] }
            : it
        )
      );
    }

    try {
      const res = await fetch("/api/business/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (previousItem) {
          setItems((prev) =>
            prev.map((it) => (it.id === previousItem!.id ? previousItem! : it))
          );
        }
        setToast({
          type: "error",
          message: data.error || "Failed to record sale",
        });
        return;
      }

      setToast({ type: "success", message: "Sale recorded" });
      setSalesPage(1);
      if (activeTab === "sales") {
        loadSales();
      }
      loadInventory();
      loadMetrics();
    } catch {
      if (previousItem) {
        setItems((prev) =>
          prev.map((it) => (it.id === previousItem!.id ? previousItem! : it))
        );
      }
      setToast({ type: "error", message: "Failed to record sale" });
    }
  };

  const handleUpdateSale = async (
    saleId: string,
    updates: Record<string, unknown>
  ) => {
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
    await Promise.all([loadSales(), loadMetrics(), loadInventory()]);
  };

  const handleDeleteSale = async (saleId: string) => {
    const res = await fetch(`/api/business/sales/${saleId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete sale");
    }
    setToast({ type: "success", message: "Sale deleted" });
    await Promise.all([loadSales(), loadMetrics(), loadInventory()]);
  };

  const handleCardAdded = (playerName: string) => {
    setPendingInventoryCard(null);
    setToast({ type: "success", message: `Added "${playerName}" to inventory` });
    loadInventory();
    loadMetrics();
  };

  const handleCardPickerSelect = (card: CardPickerSelection) => {
    setShowCardPicker(false);
    setPendingInventoryCard({
      player_name: card.player_name,
      year: card.year,
      set_name: card.set_name,
      parallel_type: card.variant,
      card_number: card.card_number,
      grader: card.grader,
      grade: card.grade,
      quantity: card.quantity,
    });
    setShowAddCardToInventory(true);
  };

  // Called when AddCardModalNew identifies a card via upload (watchlist mode)
  const handleCardIdentified = (cardData: {
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grade?: string;
    quantity?: number;
  }) => {
    setShowAddCardModal(false);
    setPendingInventoryCard(cardData);
    setShowAddCardToInventory(true);
  };

  const handleAddWax = async (item: any) => {
    try {
      const res = await fetch("/api/business/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const created = await res.json();
        setItems((prev) => [created, ...prev]);
        setToast({ type: "success", message: `Added "${item.title}"` });
        loadMetrics();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: data.error || "Failed to add wax item" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to add wax item" });
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-800 rounded" />
            <div className="grid grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-gray-800 rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-gray-800 rounded-xl" />
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
      <main className="max-w-7xl mx-auto px-4 py-3 business-density">
        {/* Header — compact for dense ledger dashboard */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-white">
              CardzCheck Business
            </h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Inventory tracking & sales analytics
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ebayStoreHref ? (
              <a
                href={ebayStoreHref}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 border border-gray-700 text-gray-300 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
              >
                Ebay Storefront
              </a>
            ) : (
              <Link
                href="/settings"
                className="px-3 py-1.5 border border-gray-600 text-gray-400 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
              >
                Add Ebay Storefront
              </Link>
            )}
            <a
              href="/api/business/export?type=inventory"
              className="px-3 py-1.5 border border-gray-700 text-gray-300 rounded-md hover:bg-gray-800 transition-colors text-xs font-medium whitespace-nowrap"
            >
              Export for Accounting
            </a>
            <div className="relative">
              <div className="flex">
                <button
                  onClick={() => setShowAddCardModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-l-md transition-colors text-xs font-medium flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Inventory
                </button>
                <button
                  onClick={() => setShowAddDropdown((prev) => !prev)}
                  className="px-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-r-md transition-colors border-l border-emerald-500"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {showAddDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddCardModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 rounded-t-lg"
                  >
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    Add Inventory
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddWaxModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    Add Wax
                  </button>
                  <button
                    onClick={() => {
                      setShowAddDropdown(false);
                      setShowAddModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 rounded-b-lg"
                  >
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Manual Entry
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metrics — compact in Business mode */}
        <BusinessMetrics
          metrics={metrics}
          loading={metricsLoading}
          inventorySummary={inventorySummary}
          totalItemCount={items.length}
          compact
        />

        {!needsMigration && activeTab === "inventory" && (
          <BusinessAnalystPreviewCard items={items} />
        )}

        {!needsMigration && (
          <div className="mb-2 flex items-center gap-1 border-b border-gray-800">
            <button
              type="button"
              onClick={() => setActiveTab("inventory")}
              className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "inventory"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Inventory
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sales")}
              className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "sales"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Sales
            </button>
          </div>
        )}

        {/* Migration banner (shown when database tables haven't been created) */}
        {needsMigration && (
          <div className="mt-3">
            <BusinessMigrationBanner
              onRetry={() => {
                setLoading(true);
                loadInventory();
              }}
            />
          </div>
        )}

        {/* Inventory Table */}
        {!needsMigration && activeTab === "inventory" && (
          <InventoryTable
            items={items}
            selectedItemId={selectedItem?.id ?? null}
            onItemClick={setSelectedItem}
            onInlineUpdate={handleInlineUpdate}
            onBulkAction={handleBulkAction}
            onDelete={handleDelete}
            onMarkSold={handleMarkSold}
            onFilteredChange={handleFilteredChange}
            dense
          />
        )}

        {!needsMigration && activeTab === "sales" && (
          <SalesTable
            sales={sales}
            loading={salesLoading}
            filters={salesFilters}
            onFiltersChange={(next) => {
              setSalesFilters(next);
              setSalesPage(1);
            }}
            onEditSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
            page={salesPage}
            pageSize={salesPageSize}
            total={salesTotal}
            onPageChange={(next) => setSalesPage(next)}
          />
        )}

        {/* Detail Drawer */}
        {selectedItem && (
          <ItemDetailDrawer
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleSaveItem}
          />
        )}

        {/* Manual Add Modal */}
        <AddInventoryModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddItem}
        />

        {/* Add Card Modal — identify via photo or open card database search */}
        <AddCardModalNew
          isOpen={showAddCardModal}
          onClose={() => setShowAddCardModal(false)}
          onSuccess={() => {}}
          onLimitReached={() => {}}
          addMode="business"
          modalTitle="Add Card to Inventory"
          onOpenSmartSearch={() => {
            setShowAddCardModal(false);
            setShowCardPicker(true);
          }}
          onCardSelected={handleCardIdentified}
        />

        {/* Card Database Search Picker */}
        <CardPickerModal
          isOpen={showCardPicker}
          title="Add Card to Inventory"
          mode="collection"
          onClose={() => setShowCardPicker(false)}
          onSelect={handleCardPickerSelect}
          quantityEnabled
        />

        {/* Business-specific confirm: set cost/channel/status, saves to business_inventory_items */}
        <AddCardToInventoryModal
          isOpen={showAddCardToInventory}
          card={pendingInventoryCard}
          onClose={() => {
            setShowAddCardToInventory(false);
            setPendingInventoryCard(null);
          }}
          onSuccess={handleCardAdded}
        />

        {/* Add Wax Modal */}
        <AddWaxModal
          isOpen={showAddWaxModal}
          onClose={() => setShowAddWaxModal(false)}
          onAdd={handleAddWax}
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
                }
              : undefined
          }
          onClose={() => setMarkSoldItem(null)}
          onSubmit={async (payload) => {
            await handleCreateSale(payload as unknown as Record<string, unknown>);
            setMarkSoldItem(null);
          }}
          showCogsField={false}
        />

        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="hover:opacity-75">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}

export default function BusinessPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <main className="max-w-7xl mx-auto px-4 py-4">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-48 bg-gray-800 rounded" />
              <div className="grid grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-800 rounded-xl" />
                ))}
              </div>
              <div className="h-64 bg-gray-800 rounded-xl" />
            </div>
          </main>
        </AuthenticatedLayout>
      }
    >
      <BusinessPageContent />
    </Suspense>
  );
}
