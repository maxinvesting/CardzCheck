"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CompactMetricsRow from "@/components/dashboard/CompactMetricsRow";
import CompactTopPerformers from "@/components/dashboard/CompactTopPerformers";
import CompactQuickActions from "@/components/dashboard/CompactQuickActions";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import LoyaltyPerksWidget from "@/components/dashboard/LoyaltyPerksWidget";
import { Surface } from "@/components/ui/Surface";
import AddCardModalNew from "@/components/AddCardModalNew";
import PaywallModal from "@/components/PaywallModal";
import { createClient } from "@/lib/supabase/client";
import type { User, CollectionItem } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";
import { getEstCmv } from "@/lib/values";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    async function loadData() {
      if (isTestMode()) {
        setUser(getTestUser());
        const response = await fetch("/api/collection", { cache: "no-store" });
        const data = await response.json();
        if (data.items) {
          setCollectionItems(data.items);
        }
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Dashboard");
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/dashboard");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData as User);
      }

      const response = await fetch("/api/collection", { cache: "no-store" });
      const data = await response.json();
      if (data.items) {
        setCollectionItems(data.items as CollectionItem[]);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const refreshCollection = useCallback(async () => {
    // Don't hit API when we're not logged in (avoids 401 / "Failed to fetch" on focus)
    if (!user && !isTestMode()) return;
    try {
      const response = await fetch("/api/collection", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        console.error("Failed to refresh collection, status:", response.status);
        return;
      }
      const data = await response.json();
      if (data.items) {
        setCollectionItems(data.items);
      }
    } catch (error) {
      console.error("Failed to refresh collection:", error);
    }
  }, [user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshCollection();
      }
    };
    const handleFocus = () => {
      refreshCollection();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshCollection]);

  const needsCmvRefresh = useMemo(() => {
    return collectionItems.some((item) => {
      const compsCount = (item as { comps_count?: number | null }).comps_count;
      return typeof compsCount === "number" && compsCount > 0 && getEstCmv(item) === null;
    });
  }, [collectionItems]);

  useEffect(() => {
    if (!needsCmvRefresh) return;
    let attempts = 0;
    const maxAttempts = 6;
    const interval = setInterval(async () => {
      attempts += 1;
      await refreshCollection();
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [needsCmvRefresh, refreshCollection]);

  const userName = user?.name || (user?.email ? user.email.split("@")[0] : "");

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Greeting */}
        <header className="mb-4 sm:mb-6">
          <h1 className="text-xl font-semibold leading-snug text-[var(--biz-text)]">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[var(--biz-muted)]">
            Overview of your collection value and recent activity.
          </p>
        </header>

        {/* Metrics band */}
        <section className="mb-4 sm:mb-6">
          <Surface>
            <CompactMetricsRow items={collectionItems} loading={loading} />
          </Surface>
        </section>

        {/* Loyalty perks progress */}
        <section className="mb-4 sm:mb-6">
          <LoyaltyPerksWidget />
        </section>

        {/* Secondary layout: performers, activity, quick actions */}
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <div className="space-y-4">
              <CompactTopPerformers items={collectionItems} loading={loading} />
              <ActivityFeed recentCards={collectionItems.slice(0, 5)} />
            </div>
            <CompactQuickActions onAddCard={() => setShowAddModal(true)} />
          </div>
        </section>

        {/* Add Card Modal */}
        <AddCardModalNew
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={(playerName, item) => {
            const addedToInventory =
              item?.item_kind === "inventory" || item?.item_kind === "prospect";
            setToast({
              type: "success",
              message: addedToInventory
                ? `Added ${playerName} to inventory!`
                : `Added ${playerName} to collection!`,
            });
            if (isTestMode() && item) {
              setCollectionItems((prev) => [item, ...prev]);
            } else {
              refreshCollection();
            }
          }}
          onLimitReached={() => setShowPaywall(true)}
        />

        {/* Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          type="collection"
        />

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
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
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
