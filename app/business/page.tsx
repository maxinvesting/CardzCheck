"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMetrics from "@/components/business/BusinessMetrics";
import InventoryTable from "@/components/business/InventoryTable";
import ItemDetailDrawer from "@/components/business/ItemDetailDrawer";
import AddInventoryModal from "@/components/business/AddInventoryModal";
import { createClient } from "@/lib/supabase/client";
import type { BusinessInventoryItem, BusinessMetrics as MetricsType } from "@/types";

export default function BusinessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsType | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<BusinessInventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/business/inventory", { cache: "no-store" });
      if (res.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
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
            <h1 className="text-2xl font-bold text-white">Business</h1>
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
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>
        </div>

        {/* Metrics */}
        <BusinessMetrics metrics={metrics} loading={metricsLoading} />

        {/* Inventory Table */}
        <InventoryTable
          items={items}
          onItemClick={setSelectedItem}
          onInlineUpdate={handleInlineUpdate}
          onBulkAction={handleBulkAction}
          onDelete={handleDelete}
        />

        {/* Detail Drawer */}
        {selectedItem && (
          <ItemDetailDrawer
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={handleSaveItem}
            onAddSale={handleAddSale}
          />
        )}

        {/* Add Modal */}
        <AddInventoryModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddItem}
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
