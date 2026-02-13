"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CardUploader from "@/components/CardUploader";
import CardPicker, { type CardPickerSelection } from "@/components/CardPicker";
import CompsStats from "@/components/CompsStats";
import CompsTable from "@/components/CompsTable";
import FeaturedSearchCard from "@/components/FeaturedSearchCard";
import PaywallModal from "@/components/PaywallModal";
import PlanSelectionModal from "@/components/PlanSelectionModal";
import WelcomeToast from "@/components/WelcomeToast";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import ConfirmAddCardModal from "@/components/ConfirmAddCardModal";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import { CardIdentitySubtitle } from "@/components/ui";
import { gradingCopy } from "@/copy/grading";
import { createClient } from "@/lib/supabase/client";
import { addRecentSearch } from "@/lib/recent-searches";
import { formatGraderGrade } from "@/lib/cards/format";
import { needsYearConfirmation } from "@/lib/card-identity/ui";
import { getCollectionErrorMessage } from "@/lib/collection/client-errors";
import type { SearchFormData, SearchResult, Comp, User, CardIdentificationResult, GradeEstimate, ParsedSearch } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

function CompsPageContent() {
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
  const [gradeEstimate, setGradeEstimate] = useState<GradeEstimate | null>(null);
  const [estimatingGrade, setEstimatingGrade] = useState(false);
  const [identityPending, setIdentityPending] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cardWatched, setCardWatched] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState<string | null>(null);

  const resolveCmvForSave = (result: SearchResult | null): number | null => {
    if (!result) return null;
    const direct = result.stats?.cmv;
    if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
      return direct;
    }
    const estimate = result._estimatedSaleRange;
    if (estimate?.pricingAvailable && estimate.estimatedSaleRange) {
      const { low, high } = estimate.estimatedSaleRange;
      const mid = (low + high) / 2;
      if (Number.isFinite(mid) && mid > 0) {
        return Math.round(mid * 100) / 100;
      }
    }
    return null;
  };

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
        console.log("🧪 TEST MODE: Using mock user in Comps");
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
    setCardWatched(false);

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
    const cardId = searchParams.get("card_id");
    if (cardId) params.set("card_id", cardId);

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

      const parsed: ParsedSearch = {
        player_name: data.player_name,
        year: data.year,
        set_name: data.set_name,
        grade: data.grade,
        card_number: data.card_number,
        parallel_type: data.parallel_type,
        serial_number: data.serial_number,
        variation: data.variation,
        autograph: data.autograph,
        relic: data.relic,
        confidence: "high",
        unparsed_tokens: [],
      };

      addRecentSearch({
        query: queryString,
        parsed,
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

  const handleCardPickerSelect = (card: CardPickerSelection) => {
    const gradeLabel = formatGraderGrade(card.grader, card.grade);
    const data: SearchFormData = {
      player_name: card.player_name,
      year: card.year,
      set_name: card.set_name || card.brand,
      grade: gradeLabel,
      card_number: card.card_number,
      parallel_type: card.variant,
    };
    setFormData(data);
    handleSearch(data);
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
    console.log("🔵 handleAddToCollection called with:", comp);
    
    if (!user) {
      console.log("❌ No user, redirecting to login");
      router.push("/login?redirect=/comps");
      return;
    }

    if (addingToCollection === comp.link) {
      console.log("⏳ Already adding this item, skipping");
      return;
    }

    setAddingToCollection(comp.link);

    try {
      const cmvForSave = resolveCmvForSave(results);
      const payload = {
        player_name: formData?.player_name || comp.title,
        year: formData?.year || null,
        set_name: formData?.set_name || null,
        parallel_type: formData?.parallel_type || null,
        card_number: formData?.card_number || null,
        grade: formData?.grade || null,
        purchase_price: comp.price,
        purchase_date: comp.date,
        image_url: comp.image || null,
        notes: [
          formData?.parallel_type && formData.parallel_type !== "Base"
            ? `Parallel: ${formData.parallel_type}` : null,
          formData?.card_number ? `Card #${formData.card_number}` : null,
        ].filter(Boolean).join(" | ") || null,
        // Persist the same CMV shown in the comps tab
        est_cmv: cmvForSave,
        estimated_cmv: cmvForSave,
      };

      console.log("📦 Adding to collection:", payload);

      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("📦 Response status:", response.status, response.statusText);

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("📦 Non-JSON response:", text);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      console.log("📦 Response data:", data);

      if (!response.ok) {
        if (data.error === "limit_reached") {
          setPaywallType("collection");
          setShowPaywall(true);
          return;
        }
        throw new Error(getCollectionErrorMessage(data, "Failed to add to collection"));
      }

      setAddedToCollection((prev) => new Set([...prev, comp.link]));
      setToast({ type: 'success', message: `Added ${formData?.player_name || 'card'} to collection!` });
    } catch (err) {
      console.error("❌ Error adding to collection:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add card. Please try again.';
      setToast({ type: 'error', message: errorMessage });
    } finally {
      setAddingToCollection(null);
    }
  };

  // Add card to collection directly from search (when no comps exist)
  const handleAddCardFromSearch = async () => {
    if (!user) {
      router.push("/login?redirect=/comps");
      return;
    }

    if (!formData?.player_name) {
      return;
    }

    try {
      const cmvForSave = resolveCmvForSave(results);
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_name: formData.player_name,
          year: formData.year || null,
          set_name: formData.set_name || null,
          parallel_type: formData.parallel_type || null,
          card_number: formData.card_number || null,
          grade: formData.grade || null,
          purchase_price: null,
          purchase_date: null,
          image_url: results?._forSale?.items?.[0]?.image || null,
          notes: [
            formData.parallel_type && formData.parallel_type !== "Base"
              ? `Parallel: ${formData.parallel_type}` : null,
            formData.card_number ? `Card #${formData.card_number}` : null,
          ].filter(Boolean).join(" | ") || null,
          // Use the same CMV that was estimated for this search, if available
          est_cmv: cmvForSave,
          estimated_cmv: cmvForSave,
        }),
      });
      const contentType = response.headers.get("content-type");
      const data = contentType?.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok) {
        if (data.error === "limit_reached") {
          setPaywallType("collection");
          setShowPaywall(true);
          return;
        }
        throw new Error(getCollectionErrorMessage(data, "Failed to add to collection"));
      }

      setCardAddedFromSearch(true);
      setToast({ type: 'success', message: `Added ${formData.player_name} to collection!` });
    } catch (err) {
      console.error("Error adding to collection:", err);
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add card. Please try again.' });
    }
  };

  const handleAddToWatchlist = async (data: {
    player_name: string;
    year?: string | null;
    set_brand?: string | null;
    parallel_variant?: string | null;
    condition?: string | null;
  }) => {
    if (!user) {
      router.push("/login?redirect=/comps");
      return;
    }
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          year: data.year ?? formData?.year ?? null,
          set_brand: data.set_brand ?? formData?.set_name ?? null,
          parallel_variant: data.parallel_variant ?? formData?.parallel_type ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === "upgrade_required") {
          setPaywallType("search");
          setShowPaywall(true);
          return;
        }
        throw new Error(json.message ?? json.error ?? "Failed to add to watchlist");
      }
      setCardWatched(true);
      setToast({ type: "success", message: `Added ${data.player_name} to watchlist` });
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to add to watchlist",
      });
      throw e;
    }
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
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Comps</h1>
          <p className="text-gray-400">
            Find comparable sales and market values for any sports card
          </p>
        </div>

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

        {/* Card Picker */}
        <div className="mb-8">
          <CardPicker
            mode="comps"
            onSelect={handleCardPickerSelect}
            disabled={!canSearch || loading}
            initialFilters={{
              playerName: formData?.player_name,
              setName: formData?.set_name,
              year: formData?.year,
              parallel: formData?.parallel_type,
              cardNumber: formData?.card_number,
              grader: formData?.grade?.split(" ")[0],
              grade: formData?.grade?.split(" ")[1],
            }}
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
                onStart={() => {
                  setIdentifiedCard(null);
                  setGradeEstimate(null);
                  setEstimatingGrade(false);
                  setFormData(undefined);
                }}
                onReset={() => {
                  setIdentifiedCard(null);
                  setFormData(undefined);
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
                  <p className="font-medium text-white">
                    {identityPending ? "Identity pending" : identifiedCard.player_name}
                  </p>
                  <CardIdentitySubtitle
                    identity={
                      identityPending
                        ? null
                        : identifiedCard.cardIdentity ?? (identifiedCard
                            ? {
                                year: identifiedCard.year ? Number(identifiedCard.year) : null,
                                brand: null,
                                setName: identifiedCard.set_name ?? null,
                                subset: null,
                                parallel: identifiedCard.parallel_type ?? null,
                              }
                            : null)
                    }
                    className="text-gray-400"
                  />
                  {!identityPending && needsYearConfirmation(
                    identifiedCard.year,
                    identifiedCard.confidence,
                    identifiedCard.cardIdentity?.fieldConfidence?.year
                  ) ? (
                    <p className="text-xs text-amber-400 mt-1">Year: Needs confirmation</p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!identifiedCard?.imageUrl) return;
                    setGradeEstimate(null);
                    setEstimatingGrade(true);
                    setIdentityPending(true);
                    try {
                      const response = await fetch("/api/grade-estimate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ imageUrl: identifiedCard.imageUrl }),
                      });
                      if (response.ok) {
                        const estimate: GradeEstimate = await response.json();
                        setGradeEstimate(estimate);
                      }
                    } catch (err) {
                      console.error("Failed to estimate grade:", err);
                    } finally {
                      setEstimatingGrade(false);
                      setIdentityPending(false);
                    }
                  }}
                  disabled={estimatingGrade || !!gradeEstimate || !!identifiedCard.grade}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {estimatingGrade ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {gradingCopy.actions.analyzing}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {gradingCopy.actions.analyze}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  {gradingCopy.actions.addToCollection}
                </button>
              </div>
            </div>

            {/* Grade Estimate */}
            {gradeEstimate && (
              <GradeProbabilityPanel
                estimate={gradeEstimate}
                primaryImageUrl={
                  identifiedCard?.imageUrl || identifiedCard?.imageUrls?.[0] || null
                }
              />
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
            {(() => {
              const hasListings = (results._forSale?.count ?? 0) > 0 || (results.comps?.length ?? 0) > 0;
              if (!hasListings) {
                return (
                  <CompsStats
                    stats={results.stats}
                    query={results.query}
                    onAddToCollection={user ? handleAddCardFromSearch : undefined}
                    cardAdded={cardAddedFromSearch}
                    canAddToCollection={user?.is_paid || (user ? addedToCollection.size < LIMITS.FREE_COLLECTION : false)}
                  />
                );
              }
              return (
                <>
                  {/* Fallback banner — only shown when we have results but used a broader search pass */}
                  {results._passUsed && results._passUsed !== "strict" && (
                    <div className="p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-yellow-200 text-sm font-medium">No exact matches — showing closest comps</p>
                          <p className="text-yellow-300/70 text-xs mt-1">
                            We expanded your search to find similar listings. Results may include cards from different years or variations.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Most relevant result — click to expand for CMV, recent sales, Add to Watchlist */}
                  <FeaturedSearchCard
                    results={results}
                    formData={formData}
                    onAddToWatchlist={user ? handleAddToWatchlist : undefined}
                    canWatch={user?.is_paid ?? false}
                    isWatched={cardWatched}
                    userLoggedIn={!!user}
                  />

                  {/* Current Listings */}
                  <div className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">
                      Current Listings ({results._forSale?.count ?? results.comps?.length ?? 0})
                    </h2>
                    {results._forSale && results._forSale.count > 0 ? (
                      <CompsTable
                        isCurrentListings
                        comps={results._forSale.items
                          .map((item) => ({
                            title: item.title,
                            price: item.price,
                            date: new Date().toISOString().split("T")[0],
                            link: item.url,
                            image: item.image,
                            source: "ebay" as const,
                          }))
                          .filter((c) => !addedToCollection.has(c.link))}
                        onAddToCollection={user ? handleAddToCollection : undefined}
                        canAddToCollection={user?.is_paid || (user ? LIMITS.FREE_COLLECTION - addedToCollection.size > 0 : false)}
                        addingLink={addingToCollection}
                      />
                    ) : (
                      <CompsTable
                        comps={(results.comps ?? []).filter((c) => !addedToCollection.has(c.link))}
                        onAddToCollection={user ? handleAddToCollection : undefined}
                        canAddToCollection={user?.is_paid || (user ? LIMITS.FREE_COLLECTION - addedToCollection.size > 0 : false)}
                        addingLink={addingToCollection}
                      />
                    )}
                  </div>

                  {results._disclaimers && results._disclaimers.length > 0 && (
                    <div className="p-3 bg-gray-800/30 border border-gray-700/50 rounded-lg">
                      <p className="text-xs text-gray-500">{results._disclaimers.slice(0, 2).join(" • ")}</p>
                    </div>
                  )}
                </>
              );
            })()}
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <p className="text-gray-400 mb-2">
              Search for any sports card to get estimated values from active listings
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
                Upgrade to Pro
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
        initialCmv={resolveCmvForSave(results)}
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

export default function CompsPage() {
  return (
    <Suspense fallback={
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    }>
      <CompsPageContent />
    </Suspense>
  );
}
