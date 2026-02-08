"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CompactMetricsRow from "@/components/dashboard/CompactMetricsRow";
import CompactTopPerformers from "@/components/dashboard/CompactTopPerformers";
import CompactQuickActions from "@/components/dashboard/CompactQuickActions";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
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

      const { data: items } = await supabase
        .from("collection_items")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (items) {
        setCollectionItems(items as CollectionItem[]);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const refreshCollection = useCallback(async () => {
    const response = await fetch("/api/collection", { cache: "no-store" });
    const data = await response.json();
    if (data.items) {
      setCollectionItems(data.items);
    }
  }, []);

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
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        {/* Greeting */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
        </div>

        {/* Compact Metrics Row */}
        <div className="mb-4">
          <CompactMetricsRow items={collectionItems} loading={loading} />
        </div>

        {/* Compact Single Column Layout */}
        <div className="space-y-4 mb-4">
          <CompactTopPerformers items={collectionItems} loading={loading} />
          <ActivityFeed recentCards={collectionItems.slice(0, 5)} />
          <CompactQuickActions onAddCard={() => setShowAddModal(true)} />
        </div>

        {/* Add Card Modal */}
        <AddCardModalNew
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={(playerName, item) => {
            setToast({
              type: "success",
              message: `Added ${playerName} to collection!`,
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
      </div>
    </AuthenticatedLayout>
  );
}
