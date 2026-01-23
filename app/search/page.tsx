"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CardUploader from "@/components/CardUploader";
import SearchForm from "@/components/SearchForm";
import CompsStats from "@/components/CompsStats";
import CompsTable from "@/components/CompsTable";
import PaywallModal from "@/components/PaywallModal";
import PlanSelectionModal from "@/components/PlanSelectionModal";
import WelcomeToast from "@/components/WelcomeToast";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient } from "@/lib/supabase/client";
import type { SearchFormData, SearchResult, Comp, User } from "@/types";
import { LIMITS } from "@/types";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [formData, setFormData] = useState<SearchFormData | undefined>();
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallType, setPaywallType] = useState<"search" | "collection">("search");
  const [addedToCollection, setAddedToCollection] = useState<Set<string>>(new Set());
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);

  // Load user data and check for welcome/plan selection
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (data) {
          setUser(data);

          // Check if we should show plan selection modal
          const isWelcome = searchParams.get("welcome") === "true";
          // Handle case where plan_selected column might not exist yet (null/undefined/false)
          // If column doesn't exist, plan_selected will be undefined, so we treat it as not selected
          const hasSelectedPlan = data.plan_selected === true;

          if (isWelcome && !hasSelectedPlan) {
            // Small delay to ensure page is fully loaded
            setTimeout(() => setShowPlanModal(true), 300);
          } else if (isWelcome && hasSelectedPlan) {
            // Show welcome toast after plan selection
            setTimeout(() => setShowWelcomeToast(true), 300);
          }
        } else {
          // User record doesn't exist yet - might be a new signup
          const isWelcome = searchParams.get("welcome") === "true";
          if (isWelcome) {
            setTimeout(() => setShowPlanModal(true), 300);
          }
        }
      }
      setAuthLoading(false);
    }
    loadUser();
  }, [searchParams]);

  const handleSearch = async (data: SearchFormData) => {
    // Check if user has reached search limit
    if (user && !user.is_paid) {
      const remainingSearches = LIMITS.FREE_SEARCHES - user.free_searches_used;
      if (remainingSearches <= 0) {
        setPaywallType("search");
        setShowPaywall(true);
        return;
      }
    }

    setError(null);
    setLoading(true);
    setResults(null);

    const params = new URLSearchParams();
    params.set("player", data.player_name);
    if (data.year) params.set("year", data.year);
    if (data.set_name) params.set("set", data.set_name);
    if (data.grade) params.set("grade", data.grade);

    try {
      const response = await fetch(`/api/search?${params}`);
      const result = await response.json();

      if (!response.ok) {
        if (result.error === "limit_reached") {
          setPaywallType("search");
          setShowPaywall(true);
          return;
        }
        throw new Error(result.message || result.error || "Search failed");
      }

      setResults(result);

      // Update user's search count locally
      if (user && !user.is_paid) {
        setUser({
          ...user,
          free_searches_used: user.free_searches_used + 1,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePlanSelected = () => {
    setShowPlanModal(false);
    setShowWelcomeToast(true);
    // Refresh user data to get updated plan_selected flag
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setUser(data);
            }
          });
      }
    });
  };

  const handleAddToCollection = async (comp: Comp) => {
    if (!user) {
      router.push("/login?redirect=/search");
      return;
    }

    // Check collection limit
    const supabase = createClient();
    const { count } = await supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!user.is_paid && (count || 0) >= LIMITS.FREE_COLLECTION) {
      setPaywallType("collection");
      setShowPaywall(true);
      return;
    }

    // Parse card details from title
    const { error } = await supabase.from("collection_items").insert({
      user_id: user.id,
      player_name: formData?.player_name || comp.title,
      year: formData?.year || null,
      set_name: formData?.set_name || null,
      grade: formData?.grade || null,
      purchase_price: comp.price,
      purchase_date: comp.date,
      image_url: comp.image || null,
    });

    if (error) {
      console.error("Error adding to collection:", error);
      return;
    }

    setAddedToCollection((prev) => new Set([...prev, comp.link]));
  };

  const remainingSearches = user
    ? user.is_paid
      ? null
      : Math.max(0, LIMITS.FREE_SEARCHES - user.free_searches_used)
    : null;

  const canSearch = user
    ? user.is_paid || (remainingSearches !== null && remainingSearches > 0)
    : true;

  return (
    <AuthenticatedLayout>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome Toast */}
        {showWelcomeToast && user && (
          <WelcomeToast
            user={user}
            onDismiss={() => setShowWelcomeToast(false)}
          />
        )}

        {/* Search Counter for Free Users */}
        {user && !user.is_paid && remainingSearches !== null && (
          <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Free Searches Remaining
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {remainingSearches} of {LIMITS.FREE_SEARCHES}
                </p>
              </div>
              {remainingSearches === 0 && (
                <button
                  onClick={() => {
                    setPaywallType("search");
                    setShowPaywall(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        )}
        {/* Search Section */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Photo Upload */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              1. Upload Card Photo
            </h2>
            <CardUploader
              onIdentified={setFormData}
              disabled={loading}
            />
          </div>

          {/* Manual Search */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              2. Search Details
            </h2>
            <SearchForm
              initialData={formData}
              onSearch={(data) => {
                setFormData(data);
                handleSearch(data);
              }}
              loading={loading || !canSearch}
              disabled={!canSearch}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            <CompsStats stats={results.stats} query={results.query} />
            <CompsTable
              comps={results.comps.filter((c) => !addedToCollection.has(c.link))}
              onAddToCollection={user ? handleAddToCollection : undefined}
              canAddToCollection={user?.is_paid || (user ? (LIMITS.FREE_COLLECTION - addedToCollection.size) > 0 : false)}
            />
          </div>
        )}

        {/* Empty State */}
        {!results && !loading && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              Upload a card photo or enter search details to find recent eBay sold prices
            </p>
          </div>
        )}

        {/* Search Limit Reached Message */}
        {user && !user.is_paid && remainingSearches === 0 && !results && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
              <svg
                className="w-12 h-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                You've used all your free searches
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Upgrade to Pro for unlimited searches and collection tracking.
              </p>
              <button
                onClick={() => {
                  setPaywallType("search");
                  setShowPaywall(true);
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Upgrade to Pro - $20
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Plan Selection Modal */}
      <PlanSelectionModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        onPlanSelected={handlePlanSelected}
      />

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        type={paywallType}
      />
    </AuthenticatedLayout>
  );
}
