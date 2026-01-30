"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CardUploader from "@/components/CardUploader";
import SearchBar from "@/components/SearchBar";
import CompsStats from "@/components/CompsStats";
import CompsTable from "@/components/CompsTable";
import PaywallModal from "@/components/PaywallModal";
import PlanSelectionModal from "@/components/PlanSelectionModal";
import WelcomeToast from "@/components/WelcomeToast";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import ConfirmAddCardModal from "@/components/ConfirmAddCardModal";
import GradeEstimateDisplay from "@/components/GradeEstimateDisplay";
import WatchCardModal from "@/components/WatchCardModal";
import { createClient } from "@/lib/supabase/client";
import { addRecentSearch } from "@/lib/recent-searches";
import { parseSmartSearch } from "@/lib/smart-search-parser";
import type { SearchFormData, SearchResult, Comp, User, CardIdentificationResult } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [formData, setFormData] = useState<SearchFormData | undefined>();
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallType, setPaywallType] = useState<"search" | "collection">("search");
  const [addedToCollection, setAddedToCollection] = useState<Set<string>>(new Set());
  const [cardAddedFromSearch, setCardAddedFromSearch] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [cardWatched, setCardWatched] = useState(false);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load user data and check for welcome/plan selection
  useEffect(() => {
    async function loadUser() {
      // In test mode, use mock user
      if (isTestMode()) {
        setUser(getTestUser());
        setAuthLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Search");
        return;
      }

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
          const hasSelectedPlan = data.plan_selected === true;

          if (isWelcome && !hasSelectedPlan) {
            setTimeout(() => setShowPlanModal(true), 300);
          } else if (isWelcome && hasSelectedPlan) {
            setTimeout(() => setShowWelcomeToast(true), 300);
          }
        } else {
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

  // Check for upload parameter to show uploader
  useEffect(() => {
    if (searchParams.get("upload") === "true") {
      setShowUploader(true);
    }
  }, [searchParams]);

  // Check for pre-filled search params from dashboard
  useEffect(() => {
    const player = searchParams.get("player");
    if (player && !formData) {
      const data: SearchFormData = {
        player_name: player,
        year: searchParams.get("year") || undefined,
        set_name: searchParams.get("set") || undefined,
        grade: searchParams.get("grade") || undefined,
        parallel_type: searchParams.get("parallel_type") || undefined,
        card_number: searchParams.get("card_number") || undefined,
        serial_number: searchParams.get("serial_number") || undefined,
        variation: searchParams.get("variation") || undefined,
        autograph: searchParams.get("autograph") || undefined,
        relic: searchParams.get("relic") || undefined,
      };
      setFormData(data);
      // Auto-search if coming from dashboard with params
      if (!results && !loading) {
        handleSearch(data);
      }
    }
  }, [searchParams]);

  const handleSearch = async (data: SearchFormData) => {
    // Bypass paywall checks in test mode
    if (!isTestMode()) {
      // Check if user has reached search limit
      if (user && !user.is_paid) {
        const remainingSearches = LIMITS.FREE_SEARCHES - user.free_searches_used;
        if (remainingSearches <= 0) {
          setPaywallType("search");
          setShowPaywall(true);
          return;
        }
      }
    }

    setError(null);
    setFallbackUrl(null);
    setLoading(true);
    setResults(null);
    setFormData(data);
    setCardAddedFromSearch(false);

    const params = new URLSearchParams();
    params.set("player", data.player_name);
    if (data.year) params.set("year", data.year);
    if (data.set_name) params.set("set", data.set_name);
    if (data.grade) params.set("grade", data.grade);
    if (data.card_number) params.set("card_number", data.card_number);
    if (data.parallel_type) params.set("parallel_type", data.parallel_type);
    if (data.serial_number) params.set("serial_number", data.serial_number);
    if (data.variation) params.set("variation", data.variation);
    if (data.autograph) params.set("autograph", data.autograph);
    if (data.relic) params.set("relic", data.relic);

    try {
      const response = await fetch(`/api/search?${params}`);

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Search service temporarily unavailable. Please try again.');
      }

      const result = await response.json();

      if (!response.ok) {
        if (result.error === "limit_reached") {
          setPaywallType("search");
          setShowPaywall(true);
          return;
        }
        if (result.error === "ebay_blocked") {
          setFallbackUrl(result.fallback_url || null);
        }
        throw new Error(result.message || result.error || "Search failed");
      }

      setResults(result);
      setFallbackUrl(null);

      // Save to recent searches
      const queryString = [
        data.player_name,
        data.year,
        data.set_name,
        data.grade,
        data.parallel_type,
      ]
        .filter(Boolean)
        .join(" ");

      addRecentSearch({
        query: queryString,
        parsed: parseSmartSearch(queryString),
        timestamp: Date.now(),
        resultCount: result.comps?.length || 0,
        cmv: result.stats?.cmv,
      });

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

    const response = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: formData?.player_name || comp.title,
        year: formData?.year || null,
        set_name: formData?.set_name || null,
        grade: formData?.grade || null,
        purchase_price: comp.price,
        purchase_date: comp.date,
        image_url: comp.image || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Error adding to collection:", error);
      setToast({ type: 'error', message: 'Failed to add card. Please try again.' });
      return;
    }

    setAddedToCollection((prev) => new Set([...prev, comp.link]));
    setToast({ type: 'success', message: `Added ${formData?.player_name || 'card'} to collection!` });
  };

  // Add card to collection directly from search (when no comps exist)
  const handleAddCardFromSearch = async () => {
    if (!user) {
      router.push("/login?redirect=/search");
      return;
    }

    if (!formData?.player_name) {
      return;
    }

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

    const response = await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_name: formData.player_name,
        year: formData.year || null,
        set_name: formData.set_name || null,
        grade: formData.grade || null,
        purchase_price: null,
        purchase_date: null,
        image_url: null,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Error adding to collection:", error);
      setToast({ type: 'error', message: 'Failed to add card. Please try again.' });
      return;
    }

    setCardAddedFromSearch(true);
    setToast({ type: 'success', message: `Added ${formData.player_name} to collection!` });
  };

  // Handle watch from search results
  const handleWatchFromSearch = () => {
    if (!user) {
      router.push("/login?redirect=/search");
      return;
    }
    setShowWatchModal(true);
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
          <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">
                  Free Searches Remaining
                </p>
                <p className="text-2xl font-bold text-white mt-1">
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

        {/* Search Bar */}
        <div className="mb-8">
          <SearchBar
            initialData={formData}
            onSearch={(data: SearchFormData) => {
              setFormData(data);
              handleSearch(data);
            }}
            loading={loading}
            disabled={!canSearch}
            placeholder="Search any card... (e.g., Jordan Fleer 1986 PSA 10)"
          />
        </div>

        {/* Card Upload Section (collapsible) */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => setShowUploader(!showUploader)}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors mb-4"
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
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{showUploader ? "Hide" : "Upload Card Photo"}</span>
            <svg
              className={`w-4 h-4 transition-transform ${showUploader ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showUploader && (
            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
              <p className="text-sm text-gray-400 mb-4">
                Upload a photo of your card to identify it
              </p>
              <CardUploader
                onIdentified={(data: CardIdentificationResult) => {
                  setIdentifiedCard(data);
                  setFormData(data);
                  // Auto-search after identification
                  handleSearch(data);
                }}
                disabled={loading}
              />
            </div>
          )}
        </div>

        {/* Grade Estimate & Add to Collection (after card identification) */}
        {identifiedCard && (
          <div className="mb-8 space-y-4">
            {/* Add to Collection Button */}
            <div className="flex items-center justify-between p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
              <div className="flex items-center gap-3">
                {identifiedCard.imageUrl && (
                  <img
                    src={identifiedCard.imageUrl}
                    alt={identifiedCard.player_name}
                    className="w-12 h-16 object-cover rounded-lg"
                  />
                )}
                <div>
                  <p className="font-medium text-white">{identifiedCard.player_name}</p>
                  <p className="text-sm text-gray-400">
                    {[identifiedCard.year, identifiedCard.set_name, identifiedCard.parallel_type]
                      .filter(Boolean)
                      .join(" | ")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Add to Collection
              </button>
            </div>

            {/* Grade Estimate */}
            {identifiedCard.gradeEstimate && (
              <GradeEstimateDisplay estimate={identifiedCard.gradeEstimate} />
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 bg-red-900/20 border border-red-800 rounded-xl">
            <p className="text-red-400">{error}</p>
            {fallbackUrl && (
              <div className="mt-3">
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-500 text-red-200 rounded-lg hover:bg-red-600/30"
                >
                  Open results on eBay
                </a>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            <CompsStats
              stats={results.stats}
              query={results.query}
              onAddToCollection={user ? handleAddCardFromSearch : undefined}
              cardAdded={cardAddedFromSearch}
              canAddToCollection={user?.is_paid || (user ? addedToCollection.size < LIMITS.FREE_COLLECTION : false)}
              onWatch={user ? handleWatchFromSearch : undefined}
              isWatched={cardWatched}
              canWatch={user?.is_paid || false}
            />
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
            <svg
              className="w-16 h-16 text-gray-600 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-gray-400 mb-2">
              Search for any sports card to find recent eBay sold prices
            </p>
            <p className="text-sm text-gray-500">
              Try searching "Michael Jordan Fleer 1986 PSA 10" or upload a card photo
            </p>
          </div>
        )}

        {/* Search Limit Reached Message */}
        {user && !user.is_paid && remainingSearches === 0 && !results && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto p-6 bg-yellow-900/20 border border-yellow-800 rounded-xl">
              <svg
                className="w-12 h-12 text-yellow-400 mx-auto mb-4"
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
              <h3 className="text-lg font-semibold text-white mb-2">
                You've used all your free searches
              </h3>
              <p className="text-gray-400 mb-4">
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

      {/* Confirm Add Card Modal */}
      <ConfirmAddCardModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onSuccess={(playerName) => {
          setToast({ type: 'success', message: `Added ${playerName} to collection!` });
          setShowConfirmModal(false);
          setIdentifiedCard(null); // Clear after adding
        }}
        onLimitReached={() => {
          setShowConfirmModal(false);
          setPaywallType("collection");
          setShowPaywall(true);
        }}
        cardData={identifiedCard}
      />

      {/* Watch Card Modal */}
      <WatchCardModal
        isOpen={showWatchModal}
        onClose={() => setShowWatchModal(false)}
        onSuccess={(playerName) => {
          setToast({ type: 'success', message: `Added ${playerName} to watchlist!` });
          setShowWatchModal(false);
          setCardWatched(true);
        }}
        cardData={{
          player_name: formData?.player_name || "",
          year: formData?.year,
          set_brand: formData?.set_name,
          card_number: formData?.card_number,
          parallel_variant: formData?.parallel_type,
          condition: formData?.grade,
        }}
        isPro={user?.is_paid || false}
        onUpgradeClick={() => {
          setShowWatchModal(false);
          setShowPaywall(true);
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-75"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </AuthenticatedLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
