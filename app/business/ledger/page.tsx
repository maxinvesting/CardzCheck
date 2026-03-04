"use client";

import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Profiler,
  type ProfilerOnRenderCallback,
  startTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessLedgerView from "@/components/business/BusinessLedgerView";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import InventoryTable from "@/components/business/InventoryTable";
import ItemDetailDrawer from "@/components/business/ItemDetailDrawer";
import SalesTable, { type SalesFilters } from "@/components/business/SalesTable";
import SaleFormModal from "@/components/business/SaleFormModal";
import AddInventoryModal from "@/components/business/AddInventoryModal";
import AddWaxModal from "@/components/business/AddWaxModal";
import AddCardToInventoryModal from "@/components/business/AddCardToInventoryModal";
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
import {
  isPerfEnabled,
  setPerfInteraction,
  activatePerfBucket,
  deactivatePerfBucket,
  recordInventoryCommit,
  markClickStart,
  markClickEnd,
  startEventLoopLagMonitor,
  getPerfSnapshot,
  perfLog,
} from "@/lib/dev/perf";

const EBAY_STORE_URL_STORAGE_KEY = "cardzcheck_ebay_store_url";
const EBAY_STORE_URL_UPDATED_EVENT = "cardzcheck:ebay-store-url-updated";
const PERF_MOCK_ITEM_COUNT = 1200;

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

function resolveBusinessTab(tabParam: string | null): "inventory" | "sales" {
  return tabParam === "sales" ? "sales" : "inventory";
}

function buildPerfMockInventory(count = PERF_MOCK_ITEM_COUNT): BusinessInventoryItem[] {
  const channels: BusinessInventoryItem["channel"][] = [
    "ebay",
    "whatnot",
    "instagram",
    "show",
    "local",
    "other",
  ];
  const statuses: BusinessInventoryItem["status"][] = [
    "unlisted",
    "listed",
    "pending_sale",
    "sold",
    "returned",
  ];
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const listPrice =
      index % 3 === 0 ? null : 2500 + ((index % 120) * 125);
    const cmv = index % 5 === 0 ? null : 2200 + ((index % 100) * 135);
    const createdAt = new Date(now - index * 3600_000).toISOString();
    const grade = index % 4 === 0 ? "10" : index % 4 === 1 ? "9" : null;

    return {
      id: `perf-item-${index + 1}`,
      user_id: "perf-user",
      card_id: `perf-card-${index + 1}`,
      title: `2024 Topps Chrome Prospect ${index + 1}`,
      quantity: (index % 3) + 1,
      acquisition_date: new Date(now - index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      acquisition_type: "buy",
      cost_basis_total_cents: 1400 + ((index % 80) * 110),
      tax_cents: 0,
      shipping_cents: 0,
      fees_paid_cents: 0,
      condition_status: grade ? "graded" : "raw",
      grading_company: grade ? "PSA" : null,
      grade,
      cert_number: grade ? `CERT-${100000 + index}` : null,
      location: index % 2 === 0 ? "Shelf A" : "Bin B",
      channel: channels[index % channels.length]!,
      status: statuses[index % statuses.length]!,
      list_price_cents: listPrice,
      current_market_value_cents: cmv,
      user_image_url: null,
      stock_image_url: null,
      ebay_image_url: null,
      notes: index % 10 === 0 ? "[WAX] Sealed product" : null,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
}

function LedgerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [ebayStoreUrl, setEbayStoreUrl] = useState<string | null>(() =>
    readStoredEbayStoreUrl()
  );
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(() => ({
    revenueMtd: 0,
    revenueYtd: 0,
    profitMtd: 0,
    profitYtd: 0,
    salesCountMtd: 0,
    salesCountYtd: 0,
    activeInventoryCount: 0,
  }));
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
  const [activeTab, setActiveTab] = useState<"inventory" | "sales">(() =>
    resolveBusinessTab(searchParams.get("tab"))
  );
  const [markSoldItem, setMarkSoldItem] = useState<BusinessInventoryItem | null>(null);
  const [sales, setSales] = useState<BusinessSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFilters, setSalesFilters] = useState<SalesFilters>(() =>
    defaultSalesFilters()
  );
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize] = useState(50);
  const [salesTotal, setSalesTotal] = useState(0);
  const perfEnabled = useMemo(() => isPerfEnabled(), []);
  const perfMockMode = useMemo(
    () => perfEnabled && searchParams.get("perfMock") === "1",
    [perfEnabled, searchParams]
  );
  const initialBucketStartedRef = useRef(false);
  const pendingFloorUpdatesRef = useRef<Map<string, BusinessInventoryItem>>(
    new Map()
  );
  const floorFlushTimerRef = useRef<number | null>(null);

  const handleInventoryProfilerRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (!perfEnabled) return;
      recordInventoryCommit({
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      });
    },
    [perfEnabled]
  );

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

  const flushFloorUpdates = useCallback(() => {
    floorFlushTimerRef.current = null;
    const updates = new Map(pendingFloorUpdatesRef.current);
    pendingFloorUpdatesRef.current.clear();
    if (updates.size === 0) return;

    if (perfEnabled) {
      perfLog("market-floor flush", { updates: updates.size });
    }

    startTransition(() => {
      setItems((prev) => prev.map((item) => updates.get(item.id) ?? item));
      setSelectedItem((prev) => (prev ? updates.get(prev.id) ?? prev : prev));
    });
  }, [perfEnabled]);

  const queueFloorUpdate = useCallback(
    (updated: BusinessInventoryItem) => {
      pendingFloorUpdatesRef.current.set(updated.id, updated);
      if (floorFlushTimerRef.current !== null) return;
      floorFlushTimerRef.current = window.setTimeout(flushFloorUpdates, 320);
    },
    [flushFloorUpdates]
  );

  useEffect(() => {
    if (!perfEnabled) return;
    const stopMonitor = startEventLoopLagMonitor();
    return () => {
      stopMonitor?.();
    };
  }, [perfEnabled]);

  useEffect(
    () => () => {
      if (floorFlushTimerRef.current !== null) {
        window.clearTimeout(floorFlushTimerRef.current);
      }
      floorFlushTimerRef.current = null;
      pendingFloorUpdatesRef.current.clear();
    },
    []
  );

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

  // Sync tab with ?tab= search param
  useEffect(() => {
    setActiveTab(resolveBusinessTab(searchParams.get("tab")));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (tab: "inventory" | "sales") => {
      setActiveTab(tab);
      router.push(`/business/ledger?tab=${tab}`, { scroll: false });
    },
    [router]
  );

  const loadInventory = useCallback(async () => {
    if (perfMockMode) {
      if (perfEnabled && !initialBucketStartedRef.current) {
        initialBucketStartedRef.current = true;
        activatePerfBucket("initial-load");
        setPerfInteraction("load");
      }
      const mockItems = buildPerfMockInventory();
      setHasAccess(true);
      setNeedsMigration(false);
      setItems(mockItems);
      setLoading(false);
      setMetrics({
        revenueMtd: 0,
        revenueYtd: 0,
        profitMtd: 0,
        profitYtd: 0,
        salesCountMtd: 0,
        salesCountYtd: 0,
        activeInventoryCount: mockItems.length,
      });
      setMetricsLoading(false);
      if (perfEnabled) {
        window.setTimeout(() => {
          deactivatePerfBucket("initial-load", {
            itemCount: mockItems.length,
            source: "perfMock",
          });
        }, 300);
      }
      return;
    }

    if (perfEnabled && !initialBucketStartedRef.current) {
      activatePerfBucket("initial-load");
      setPerfInteraction("load");
      initialBucketStartedRef.current = true;
    }

    let loadedItemCount = 0;
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
      const nextItems = data.items ?? [];
      loadedItemCount = nextItems.length;
      setItems(nextItems);
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
      if (perfEnabled && initialBucketStartedRef.current) {
        window.setTimeout(() => {
          deactivatePerfBucket("initial-load", {
            itemCount: loadedItemCount,
            source: "api",
          });
        }, 300);
      }
    }
  }, [perfEnabled, perfMockMode]);

  const loadMetrics = useCallback(async () => {
    if (perfMockMode) {
      setMetricsLoading(false);
      return;
    }
    setMetricsLoading(true);
    const defaultMetrics = {
      revenueMtd: 0,
      revenueYtd: 0,
      profitMtd: 0,
      profitYtd: 0,
      salesCountMtd: 0,
      salesCountYtd: 0,
      activeInventoryCount: 0,
    };
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
      } else {
        setMetrics(defaultMetrics);
      }
    } catch {
      setMetrics(defaultMetrics);
    } finally {
      setMetricsLoading(false);
    }
  }, [perfMockMode]);

  const loadSales = useCallback(async () => {
    if (perfMockMode) {
      setSales([]);
      setSalesTotal(0);
      setSalesLoading(false);
      return;
    }
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
  }, [perfMockMode, salesFilters, salesPage, salesPageSize]);

  const loadUserProfile = useCallback(async () => {
    if (perfMockMode) {
      setBusinessName("Perf Mock Business");
      setEbayStoreUrl(null);
      return { id: "perf-user" } as { id: string };
    }

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
  }, [perfMockMode]);

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
    if (!perfEnabled || !showAddCardModal) return;
    markClickEnd("open-add-inventory-modal", { modalVisible: true });
    window.setTimeout(() => {
      deactivatePerfBucket("button-click", {
        action: "open-add-inventory-modal",
      });
    }, 0);
  }, [showAddCardModal, perfEnabled]);

  useEffect(() => {
    if (!perfEnabled || !markSoldItem) return;
    markClickEnd("open-mark-sold-modal", {
      modalVisible: true,
      itemId: markSoldItem.id,
    });
    window.setTimeout(() => {
      deactivatePerfBucket("button-click", {
        action: "open-mark-sold-modal",
      });
    }, 0);
  }, [markSoldItem, perfEnabled]);

  useEffect(() => {
    if (!perfEnabled) return;
    const timer = window.setTimeout(() => {
      const snapshot = getPerfSnapshot();
      if (!snapshot) return;
      perfLog("summary", {
        commitAvgMs: snapshot.commitAvgMs,
        commitP50Ms: snapshot.commitP50Ms,
        commitP95Ms: snapshot.commitP95Ms,
        commitCount: snapshot.commitCount,
        renderedRows: snapshot.renderedRows,
        domNodeCount: snapshot.domNodeCount,
        eventLoopLagSpikes: snapshot.eventLoopLagSpikes.length,
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeTab, items.length, loading, perfEnabled]);

  const handleInlineUpdate = async (id: string, field: string, value: unknown) => {
    if (perfMockMode) {
      const updated = { id, [field]: value } as Partial<BusinessInventoryItem> &
        Pick<BusinessInventoryItem, "id">;
      if (field === "current_market_value_cents") {
        const existing = items.find((it) => it.id === id);
        if (existing) {
          queueFloorUpdate({ ...existing, ...updated });
        }
      } else {
        startTransition(() => {
          setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
          );
        });
      }
      return;
    }
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as BusinessInventoryItem;
        if (field === "current_market_value_cents") {
          queueFloorUpdate(updated);
        } else {
          startTransition(() => {
            setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
          });
        }
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
    payload?: unknown
  ) => {
    if (perfMockMode) {
      setItems((prev) =>
        prev.map((it) => {
          if (!ids.includes(it.id)) return it;
          if (action === "set_status") {
            return { ...it, status: payload as BusinessInventoryItem["status"] ?? it.status };
          }
          if (action === "set_location") {
            return { ...it, location: payload as string ?? it.location };
          }
          return it;
        })
      );
      setToast({ type: "success", message: `Updated ${ids.length} items` });
      return;
    }

    try {
      const updates: Record<string, unknown> = {};
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

    if (perfMockMode) {
      setItems((prev) => prev.filter((it) => !ids.includes(it.id)));
      setToast({ type: "success", message: `Deleted ${ids.length} items` });
      return;
    }

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

  const handleAddItem = async (item: Record<string, unknown>) => {
    if (perfMockMode) {
      const now = new Date().toISOString();
      const created: BusinessInventoryItem = {
        id: `perf-new-${Date.now()}`,
        user_id: "perf-user",
        card_id: null,
        title: (item.title as string) || "Untitled item",
        quantity: (item.quantity as number) || 1,
        acquisition_date: (item.acquisition_date as string) || null,
        acquisition_type: (item.acquisition_type as BusinessInventoryItem["acquisition_type"]) || "buy",
        cost_basis_total_cents: (item.cost_basis_total_cents as number) || 0,
        tax_cents: (item.tax_cents as number) || 0,
        shipping_cents: (item.shipping_cents as number) || 0,
        fees_paid_cents: (item.fees_paid_cents as number) || 0,
        condition_status: (item.condition_status as BusinessInventoryItem["condition_status"]) || "raw",
        grading_company: (item.grading_company as string) || null,
        grade: (item.grade as string) || null,
        cert_number: (item.cert_number as string) || null,
        location: (item.location as string) || null,
        channel: (item.channel as BusinessInventoryItem["channel"]) || "other",
        status: (item.status as BusinessInventoryItem["status"]) || "unlisted",
        list_price_cents: (item.list_price_cents as number) ?? null,
        current_market_value_cents: (item.current_market_value_cents as number) ?? null,
        user_image_url: null,
        stock_image_url: null,
        ebay_image_url: null,
        notes: (item.notes as string) || null,
        created_at: now,
        updated_at: now,
      };
      setItems((prev) => [created, ...prev]);
      setToast({ type: "success", message: `Added "${created.title}"` });
      return;
    }

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
    if (perfMockMode) {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
      );
      setSelectedItem((prev) =>
        prev && prev.id === id ? { ...prev, ...updates } : prev
      );
      setToast({ type: "success", message: "Item saved" });
      return;
    }

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
    if (perfEnabled) {
      activatePerfBucket("button-click");
      setPerfInteraction("click:mark-sold");
      markClickStart("open-mark-sold-modal", { itemId: item.id });
    }
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

    if (perfMockMode) {
      const mockSale: BusinessSale = {
        id: `perf-sale-${Date.now()}`,
        user_id: "perf-user",
        business_id: "perf-business",
        inventory_item_id: inventoryId,
        channel: (sale.channel as BusinessSale["channel"]) || "ebay",
        sold_at:
          (sale.sold_at as string | undefined) ||
          new Date().toISOString(),
        sold_price_cents: (sale.sold_price_cents as number | undefined) || 0,
        platform_fees_cents: (sale.platform_fees_cents as number | undefined) || 0,
        shipping_charged_cents:
          (sale.shipping_charged_cents as number | undefined) || 0,
        shipping_cost_cents: (sale.shipping_cost_cents as number | undefined) || 0,
        tax_cents: (sale.tax_cents as number | undefined) || 0,
        net_payout_cents: (sale.net_payout_cents as number | undefined) || 0,
        cogs_cents: (sale.cogs_cents as number | undefined) || 0,
        gross_revenue_cents: (sale.sold_price_cents as number | undefined) || 0,
        profit_cents: 0,
        external_order_id: null,
        notes: null,
        is_deleted: false,
        inventory_item: previousItem
          ? { id: previousItem.id, title: previousItem.title }
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSales((prev) => [mockSale, ...prev]);
      setToast({ type: "success", message: "Sale recorded" });
      setSalesPage(1);
      return;
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
    if (perfMockMode) {
      setSales((prev) =>
        prev.map((sale) => (sale.id === saleId ? { ...sale, ...updates } : sale))
      );
      setToast({ type: "success", message: "Sale updated" });
      return;
    }

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
    if (perfMockMode) {
      setSales((prev) => prev.filter((sale) => sale.id !== saleId));
      setToast({ type: "success", message: "Sale deleted" });
      return;
    }

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
    if (perfMockMode) return;
    loadInventory();
    loadMetrics();
  };

  const handleCardPickerSelect = (card: CardPickerSelection) => {
    setShowCardPicker(false);
    setPendingInventoryCard({
      card_id: card.id,
      player_name: card.player_name,
      year: card.year,
      set_name: card.set_name,
      parallel_type: card.variant,
      card_number: card.card_number,
      grader: card.grader,
      grade: card.grade,
      imageUrl:
        card.user_image_url ||
        card.stock_image_url ||
        card.ebay_image_url ||
        card.image_url,
      user_image_url: card.user_image_url,
      stock_image_url: card.stock_image_url,
      ebay_image_url: card.ebay_image_url,
      quantity: card.quantity,
    });
    setShowAddCardToInventory(true);
  };

  const handleCardIdentified = (cardData: {
    card_id?: string;
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grade?: string;
    imageUrl?: string;
    user_image_url?: string;
    stock_image_url?: string;
    ebay_image_url?: string;
    quantity?: number;
  }) => {
    setShowAddCardModal(false);
    setPendingInventoryCard(cardData);
    setShowAddCardToInventory(true);
  };

  const openAddInventoryModal = useCallback(() => {
    if (perfEnabled) {
      activatePerfBucket("button-click");
      setPerfInteraction("click:add-inventory");
      markClickStart("open-add-inventory-modal");
    }
    setShowAddCardModal(true);
  }, [perfEnabled]);

  const handleAddWax = async (item: Record<string, unknown>) => {
    if (perfMockMode) {
      await handleAddItem({ ...item, notes: "[WAX] Sealed product" });
      return;
    }

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
        <BusinessLedgerView
          businessName={businessName}
          ebayStoreHref={ebayStoreHref}
          metrics={metrics}
          metricsLoading={metricsLoading}
          inventorySummary={inventorySummary}
          totalItemCount={items.length}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          needsMigration={needsMigration}
          items={items}
          showAddDropdown={showAddDropdown}
          onToggleAddDropdown={() => setShowAddDropdown((prev) => !prev)}
          onAddInventory={openAddInventoryModal}
          onAddWax={() => setShowAddWaxModal(true)}
          onManualAdd={() => setShowAddModal(true)}
        >
          {/* Migration banner */}
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

          {/* Inventory tab */}
          {!needsMigration && activeTab === "inventory" && (
            perfEnabled ? (
              <Profiler
                id="BusinessInventoryTable"
                onRender={handleInventoryProfilerRender}
              >
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
                  perfEnabled={perfEnabled}
                />
              </Profiler>
            ) : (
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
            )
          )}

          {/* Sales tab */}
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
        </BusinessLedgerView>

        {/* Item detail drawer */}
        {selectedItem && (
          <ItemDetailDrawer
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleSaveItem}
          />
        )}

        {/* Add modals */}
        <AddInventoryModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddItem}
        />

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

        <CardPickerModal
          isOpen={showCardPicker}
          title="Add Card to Inventory"
          mode="collection"
          onClose={() => setShowCardPicker(false)}
          onSelect={handleCardPickerSelect}
          quantityEnabled
        />

        <AddCardToInventoryModal
          isOpen={showAddCardToInventory}
          card={pendingInventoryCard}
          onClose={() => {
            setShowAddCardToInventory(false);
            setPendingInventoryCard(null);
          }}
          onSuccess={handleCardAdded}
        />

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

        {/* Toast notification */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="hover:opacity-75">
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

export default function LedgerPage() {
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
      <LedgerPageContent />
    </Suspense>
  );
}
