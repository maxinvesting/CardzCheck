"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LIMITS } from "@/types";

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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro" | null>(null);

  if (!isOpen) return null;

  const handleSelectPlan = async (plan: "free" | "pro") => {
    setSelectedPlan(plan);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        console.error("User not authenticated");
        setLoading(false);
        return;
      }

      // Mark plan as selected
      const response = await fetch("/api/user/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!response.ok) {
        throw new Error("Failed to save plan selection");
      }

      if (plan === "pro") {
        // Route to checkout flow
        const checkoutResponse = await fetch("/api/checkout", {
          method: "POST",
        });

        const checkoutData = await checkoutResponse.json();

        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
      }

      // For free plan, just close modal and show welcome
      onPlanSelected();
      onClose();
    } catch (error) {
      console.error("Plan selection error:", error);
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
          <div className="grid md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <div
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
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
                  forever
                </p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
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
                  {LIMITS.FREE_SEARCHES} card searches
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
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
                  {LIMITS.FREE_COLLECTION} cards in collection
                </li>
              </ul>

              <button
                onClick={() => handleSelectPlan("free")}
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  selectedPlan === "free"
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading && selectedPlan === "free"
                  ? "Starting..."
                  : "Start Free"}
              </button>
            </div>

            {/* Pro Plan */}
            <div
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all relative ${
                selectedPlan === "pro"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-blue-600 bg-blue-600/5 dark:bg-blue-600/10 hover:bg-blue-600/10 dark:hover:bg-blue-600/20"
              }`}
              onClick={() => !loading && handleSelectPlan("pro")}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 text-sm font-semibold rounded-full">
                Best Value
              </div>

              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Pro
                </h3>
                <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">
                  $20
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  one-time payment
                </p>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
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
                  Unlimited searches
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
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
                  Unlimited collection
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
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
                  Portfolio tracking
                </li>
              </ul>

              <button
                onClick={() => handleSelectPlan("pro")}
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  selectedPlan === "pro"
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading && selectedPlan === "pro"
                  ? "Loading..."
                  : "Upgrade to Pro"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
