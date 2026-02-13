"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ANNUAL_SAVINGS,
  formatPrice,
} from "@/lib/pricing";

interface PlanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlanSelected: () => void;
}

export default function PlanSelectionModal({
  isOpen,
  onClose,
  onPlanSelected,
}: PlanSelectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro_monthly" | "pro_annual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPlan = async (plan: "free" | "pro_monthly" | "pro_annual") => {
    setSelectedPlan(plan);
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be logged in to select a plan. Please refresh the page.");
        setLoading(false);
        return;
      }

      // API still expects "free" | "pro"
      const apiPlan = plan === "free" ? "free" : "pro";
      console.log("Sending plan selection request:", { plan, apiPlan, userId: user.id });
      const response = await fetch("/api/user/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: apiPlan }),
      });

      console.log("Plan selection response:", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          const text = await response.text();
          console.error("Error response text:", text);
          errorData = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse error response:", e);
        }
        
        console.error("Plan selection API error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        
        const errorMessage = errorData.error || errorData.details || `Failed to save plan selection (${response.status} ${response.statusText})`;
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const responseData = await response.json();
      console.log("Plan selection success:", responseData);

      // Check if there's a warning about missing column
      if (responseData.warning) {
        console.warn("Database column missing:", responseData.warning);
        // Still proceed - the user record was created/updated, just without plan_selected
        // The modal will close and user can continue, but plan_selected won't persist until column is added
      }

      if (plan === "pro_monthly" || plan === "pro_annual") {
        // Route to checkout flow (plan type can be passed when API supports it)
        const checkoutResponse = await fetch("/api/checkout", {
          method: "POST",
        });

        const checkoutData = await checkoutResponse.json();

        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        } else {
          setError(checkoutData.error || "Failed to start checkout. Please try again.");
          setLoading(false);
          return;
        }
      }

      // For free plan, just close modal and show welcome
      onPlanSelected();
      onClose();
    } catch (error) {
      console.error("Plan selection error:", error);
      setError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-4xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">
            Choose Your Plan
          </h2>
          <p className="text-blue-100">
            Get started with CardzCheck - select the plan that works for you
          </p>
        </div>

        {/* Plans */}
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all flex flex-col ${
                selectedPlan === "free"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
              }`}
              onClick={() => !loading && handleSelectPlan("free")}
            >
              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Free
                </h3>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">
                  $0
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  Try CardzCheck
                </p>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Collection tracking
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Smart Search + basic comps
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Limited CMV + Grade Probability uses
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Limited Analyst questions
                </li>
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("free"); }}
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && selectedPlan === "free" ? "Starting..." : "Get started"}
              </button>
            </div>

            {/* Pro Monthly - Most popular */}
            <div
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all relative flex flex-col ${
                selectedPlan === "pro_monthly"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-blue-600 bg-blue-600/5 dark:bg-blue-600/10 hover:bg-blue-600/10 dark:hover:bg-blue-600/20"
              }`}
              onClick={() => !loading && handleSelectPlan("pro_monthly")}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full">
                Most popular
              </div>

              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Pro (Monthly)
                </h3>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">
                  {formatPrice(PRO_MONTHLY_PRICE)}
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  / month
                </p>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited collection + watchlist
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full CMV + comps engine
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Grade Probability Engine (more uses)
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  CardzCheck Analyst (more uses)
                </li>
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("pro_monthly"); }}
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && selectedPlan === "pro_monthly" ? "Loading..." : "Go Pro"}
              </button>
            </div>

            {/* Pro Annual - Best value */}
            <div
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all relative flex flex-col ${
                selectedPlan === "pro_annual"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-blue-600 bg-blue-600/5 dark:bg-blue-600/10 hover:bg-blue-600/10 dark:hover:bg-blue-600/20"
              }`}
              onClick={() => !loading && handleSelectPlan("pro_annual")}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 text-sm font-semibold rounded-full">
                Best value
              </div>

              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Pro (Annual)
                </h3>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">
                  {formatPrice(PRO_ANNUAL_PRICE)}
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  / year
                </p>
                <p className="text-green-600 dark:text-green-400 text-sm font-medium mt-2">
                  Save {formatPrice(ANNUAL_SAVINGS)}/year
                </p>
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited collection + watchlist
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full CMV + comps engine
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Grade Probability Engine (more uses)
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  CardzCheck Analyst (more uses)
                </li>
              </ul>

              <button
                onClick={(e) => { e.stopPropagation(); handleSelectPlan("pro_annual"); }}
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && selectedPlan === "pro_annual" ? "Loading..." : "Go Annual"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
