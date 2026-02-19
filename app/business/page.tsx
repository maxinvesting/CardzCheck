"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import InventoryTable from "@/components/business/InventoryTable";
import ItemDetailDrawer from "@/components/business/ItemDetailDrawer";
import AddInventoryModal from "@/components/business/AddInventoryModal";
import AddWaxModal from "@/components/business/AddWaxModal";
import AddCardToInventoryModal from "@/components/business/AddCardToInventoryModal";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import type { PendingInventoryCard } from "@/components/business/AddCardToInventoryModal";
import AddCardModalNew from "@/components/AddCardModalNew";
import CardPickerModal from "@/components/CardPickerModal";
import type { CardPickerSelection } from "@/components/CardPicker";
import { createClient } from "@/lib/supabase/client";
import type { BusinessInventoryItem, BusinessMetrics as MetricsType } from "@/types";

function BusinessPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
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
      const res = await fetch("/api/business/metrics", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch {
      // ignore
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      setBusinessName(userData?.business_name || null);

      await Promise.all([loadInventory(), loadMetrics()]);
    }
    init();
  }, [router, loadInventory, loadMetrics]);

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

  const handleAddSale = async (sale: any) => {
    try {
      const res = await fetch("/api/business/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      });
      if (res.ok) {
        setToast({ type: "success", message: "Sale recorded" });
        loadInventory();
        loadMetrics();
      }
    } catch {
      setToast({ type: "error", message: "Failed to record sale" });
    }
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
      grade: card.grade,
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
        <main className="max-w-7xl mx-auto px-4 py-8">
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
            <h1 className="text-2xl font-bold text-white">
              {businessName?.trim() || "Business"}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Inventory tracking & sales analytics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/business/sales"
              className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              Sales Ledger
            </Link>
            <div className="relative group">
              <button className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium">
                Export CSV
              </button>
              <div className="absolute right-0 mt-1 w-40 bg-gray-900 border border-gray-700 rounded-lg shadow-lg hidden group-hover:block z-10">
                <a
                  href="/api/business/export?type=inventory"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-t-lg"
                >
                  Inventory
                </a>
                <a
                  href="/api/business/export?type=sales"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-b-lg"
                >
                  Sales
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="flex">
                <button
                  onClick={() => setShowAddCardModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-l-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Card
                </button>
                <button
                  onClick={() => setShowAddDropdown((prev) => !prev)}
                  className="px-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-r-lg transition-colors border-l border-emerald-500"
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
                    Add Card
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

        {/* Metrics */}
        <BusinessMetrics metrics={metrics} loading={metricsLoading} />

        {/* Migration banner (shown when database tables haven't been created) */}
        {needsMigration && (
          <div className="mt-6">
            <BusinessMigrationBanner
              onRetry={() => {
                setLoading(true);
                loadInventory();
              }}
            />
          </div>
        )}

        {/* Inventory Table */}
        {!needsMigration && (
          <InventoryTable
            items={items}
            onItemClick={setSelectedItem}
            onInlineUpdate={handleInlineUpdate}
            onBulkAction={handleBulkAction}
            onDelete={handleDelete}
          />
        )}

        {/* Detail Drawer */}
        {selectedItem && (
          <ItemDetailDrawer
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleSaveItem}
            onAddSale={handleAddSale}
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
          addMode="watchlist"
          onOpenSmartSearch={() => {
            setShowAddCardModal(false);
            setShowCardPicker(true);
          }}
          onCardSelected={handleCardIdentified}
        />

        {/* Card Database Search Picker */}
        <CardPickerModal
          isOpen={showCardPicker}
          title="Find Card in Database"
          mode="collection"
          onClose={() => setShowCardPicker(false)}
          onSelect={handleCardPickerSelect}
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
          <main className="max-w-7xl mx-auto px-4 py-8">
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
