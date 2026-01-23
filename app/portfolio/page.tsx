"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient } from "@/lib/supabase/client";
import type { User, CollectionItem } from "@/types";

export default function PortfolioPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/portfolio");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData);
      }

      // Load collection items for portfolio calculation
      const response = await fetch("/api/collection");
      const data = await response.json();

      if (data.items) {
        setItems(data.items);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleUpgrade = async () => {
    setUpgradeLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setUpgradeLoading(false);
    }
  };

  // Calculate portfolio stats
  const totalInvested = items.reduce(
    (sum, item) => sum + (item.purchase_price || 0),
    0
  );
  const totalCurrentValue = items.reduce((sum, item) => {
    // For now, using purchase price as current value
    // In a real implementation, you'd fetch current market values
    return sum + (item.purchase_price || 0);
  }, 0);
  const totalGain = totalCurrentValue - totalInvested;
  const gainPercentage =
    totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  // Top performers (cards with highest gain)
  const cardsWithGain = items
    .filter((item) => item.purchase_price)
    .map((item) => ({
      ...item,
      gain: (item.purchase_price || 0) * 0.15, // Mock gain for now
      gainPercent: 15, // Mock percentage
    }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5);

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    );
  }

  // Free user - show blurred preview with upgrade prompt
  if (user && !user.is_paid) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
            Portfolio
          </h1>

          {/* Blurred content preview */}
          <div className="relative">
            {/* Blur overlay */}
            <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md z-10 flex items-center justify-center rounded-2xl">
              <div className="text-center max-w-md px-6 py-8">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Upgrade to Pro
                </h2>
                <p className="text-gray-300 mb-6">
                  Track your portfolio value, see performance over time, and
                  identify your top performers with Pro.
                </p>
                <button
                  onClick={handleUpgrade}
                  disabled={upgradeLoading}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {upgradeLoading ? "Loading..." : "Upgrade to Pro - $20"}
                </button>
              </div>
            </div>

            {/* Preview content (blurred) */}
            <div className="pointer-events-none">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Invested
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    $1,234
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Current Value
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    $1,456
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Gain
                  </p>
                  <p className="text-2xl font-bold text-green-600">+$222</p>
                  <p className="text-sm text-green-600">+18.0%</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Top Performers
                </h2>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          Player Name {i}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          2023 Set Name
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-600 font-medium">+$45</p>
                        <p className="text-sm text-green-600">+25%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  // Pro user - show full portfolio
  return (
    <AuthenticatedLayout>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Portfolio
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Track your collection's performance
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Total Invested
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              ${totalInvested.toFixed(2)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Current Value
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              ${totalCurrentValue.toFixed(2)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Total Gain
            </p>
            <p
              className={`text-2xl font-bold ${
                totalGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {totalGain >= 0 ? "+" : ""}${totalGain.toFixed(2)}
            </p>
            <p
              className={`text-sm ${
                gainPercentage >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {gainPercentage >= 0 ? "+" : ""}
              {gainPercentage.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Top Performers */}
        {cardsWithGain.length > 0 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top Performers
            </h2>
            <div className="space-y-3">
              {cardsWithGain.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.player_name}
                        className="w-12 h-16 object-cover rounded"
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.player_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.year} {item.set_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-600 font-medium">
                      +${item.gain.toFixed(2)}
                    </p>
                    <p className="text-sm text-green-600">
                      +{item.gainPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <svg
                className="w-16 h-16 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No cards in your collection yet
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Add cards to your collection to start tracking your portfolio.
              </p>
              <a
                href="/search"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Search for Cards
              </a>
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}
