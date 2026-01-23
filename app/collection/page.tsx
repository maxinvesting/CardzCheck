"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CollectionGrid from "@/components/CollectionGrid";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import PaywallModal from "@/components/PaywallModal";
import { createClient } from "@/lib/supabase/client";
import type { CollectionItem, User } from "@/types";
import { LIMITS } from "@/types";

export default function CollectionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/collection");
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
      }

      // Load collection
      const response = await fetch("/api/collection");
      const data = await response.json();

      if (data.items) {
        setItems(data.items);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/collection?id=${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const refreshCollection = async () => {
    const response = await fetch("/api/collection");
    const data = await response.json();
    if (data.items) {
      setItems(data.items);
    }
  };

  const collectionCount = items.length;
  const collectionLimit = user?.is_paid
    ? null
    : LIMITS.FREE_COLLECTION;
  const isNearLimit = !user?.is_paid && collectionLimit !== null && collectionCount >= collectionLimit - 1;

  return (
    <AuthenticatedLayout>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              My Collection
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Track your cards and portfolio value
            </p>
          </div>
          <Link
            href="/search"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Card
          </Link>
        </div>

        {/* Collection Limit Indicator for Free Users */}
        {user && !user.is_paid && collectionLimit !== null && (
          <div className={`mb-6 p-4 rounded-xl border ${
            isNearLimit
              ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
              : "bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Collection Limit
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                  {collectionCount} / {collectionLimit} cards
                </p>
              </div>
              {isNearLimit && (
                <button
                  onClick={() => setShowPaywall(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
            {isNearLimit && (
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-2">
                You're near your collection limit. Upgrade to Pro for unlimited cards.
              </p>
            )}
          </div>
        )}

        {loading ? (
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
        ) : (
          <CollectionGrid
            items={items}
            onDelete={handleDelete}
            onRefresh={refreshCollection}
          />
        )}

        {/* Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          type="collection"
        />
      </main>
    </AuthenticatedLayout>
  );
}
