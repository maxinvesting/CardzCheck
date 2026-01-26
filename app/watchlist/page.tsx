"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import WatchlistGrid from "@/components/WatchlistGrid";
import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem, User } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

function formatPrice(price: number | null): string {
  if (price === null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export default function WatchlistPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "player_az" | "price_high" | "price_low"
  >("newest");

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    async function loadData() {
      // In test mode, use mock user
      if (isTestMode()) {
        setUser({ ...getTestUser(), is_paid: true });
        setIsPro(true);
        setLoading(false);
        console.log("Test mode: Using mock Pro user in Watchlist");
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/watchlist");
        return;
      }

      // Load user data
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData);
        setIsPro(userData.is_paid);
      }

      // Load watchlist (will return 403 if not Pro)
      const response = await fetch("/api/watchlist");
      const data = await response.json();

      if (response.ok && data.items) {
        setItems(data.items);
      } else if (data.error === "upgrade_required") {
        setIsPro(false);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/watchlist?id=${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setToast({ type: "success", message: "Removed from watchlist" });
    } else {
      setToast({ type: "error", message: "Failed to remove from watchlist" });
    }
  };

  const handleUpdateTargetPrice = async (id: string, targetPrice: number | null) => {
    const response = await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, target_price: targetPrice }),
    });

    if (response.ok) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, target_price: targetPrice } : item
        )
      );
      setToast({ type: "success", message: "Target price updated" });
    }
  };

  // Calculate watchlist stats
  const watchlistStats = useMemo(() => {
    const totalItems = items.length;
    const itemsWithPrice = items.filter((item) => item.last_price !== null);
    const totalValue = itemsWithPrice.reduce(
      (sum, item) => sum + (item.last_price || 0),
      0
    );
    const belowTarget = items.filter(
      (item) =>
        item.target_price !== null &&
        item.last_price !== null &&
        item.last_price <= item.target_price
    ).length;

    return { totalItems, totalValue, belowTarget };
  }, [items]);

  // Filter and sort items
  const visibleItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    let filtered = items;

    if (q) {
      filtered = items.filter((it) => {
        const hay = [
          it.player_name,
          it.year,
          it.set_brand,
          it.condition,
          it.parallel_variant,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const sorted = [...filtered];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) =>
          (a.created_at || "").localeCompare(b.created_at || "")
        );
        break;
      case "player_az":
        sorted.sort((a, b) =>
          (a.player_name || "").localeCompare(b.player_name || "")
        );
        break;
      case "price_high":
        sorted.sort((a, b) => (b.last_price || 0) - (a.last_price || 0));
        break;
      case "price_low":
        sorted.sort((a, b) => (a.last_price || 0) - (b.last_price || 0));
        break;
      case "newest":
      default:
        sorted.sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        );
        break;
    }
    return sorted;
  }, [items, filterQuery, sortBy]);

  // Pro upgrade prompt for free users
  if (!loading && !isPro) {
    return (
      <AuthenticatedLayout>
        <div className="h-screen flex items-center justify-center p-4">
          <div className="max-w-md text-center">
            <div className="p-4 bg-blue-500/20 rounded-full inline-flex mb-6">
              <svg
                className="w-12 h-12 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              Watchlist is a Pro Feature
            </h1>
            <p className="text-gray-400 mb-6">
              Track cards you want to buy, set target prices, and get notified
              when prices drop. Upgrade to Pro to unlock the Watchlist.
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  const response = await fetch("/api/checkout", {
                    method: "POST",
                  });
                  const data = await response.json();
                  if (data.url) {
                    window.location.href = data.url;
                  }
                }}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
              >
                Upgrade to Pro
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Watchlist
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Track cards you want to buy
            </p>
          </div>
          <button
            onClick={() => router.push("/search")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Search Cards
          </button>
        </div>

        {/* Watchlist Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">
              Watching
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {watchlistStats.totalItems} cards
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">
              Total Value
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPrice(watchlistStats.totalValue)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">
              Below Target
            </p>
            <p className="text-2xl font-bold text-green-500">
              {watchlistStats.belowTarget} cards
            </p>
          </div>
        </div>

        {/* Filter and Sort */}
        {!loading && items.length > 0 && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Watched Cards
              </h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {visibleItems.length} of {items.length}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter watchlist..."
                className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="sm:w-56 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="player_az">Sort: Player A-Z</option>
                <option value="price_high">Sort: Price High-Low</option>
                <option value="price_low">Sort: Price Low-High</option>
              </select>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
              >
                <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-800 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Watchlist Grid */}
        {!loading && (
          <WatchlistGrid
            items={visibleItems}
            onDelete={handleDelete}
            onUpdateTargetPrice={handleUpdateTargetPrice}
          />
        )}

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.type === "success" ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 hover:opacity-75"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}
