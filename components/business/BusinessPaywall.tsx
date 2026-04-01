"use client";

import { useState } from "react";
import {
  BUSINESS_MONTHLY_PRICE,
  BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE,
  BUSINESS_INCLUDED_SEATS,
  formatPrice,
} from "@/lib/pricing";

export default function BusinessPaywall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          billing: "monthly",
          tier: "business",
          seat_quantity: 1,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to start checkout.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("No checkout URL returned.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const features = [
    `Base includes ${BUSINESS_INCLUDED_SEATS} owner seat`,
    `Add teammates for ${formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)}/month each`,
    "Shared inventory and sales dashboards",
    "Role-based access for owner, manager, and employee",
    "All Pro features included",
  ];

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="bg-[#111827] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-none">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">CardzCheck Business</h2>
              <p className="text-sm text-gray-400">
                Inventory tracking & sales analytics for card sellers
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Price */}
          <div className="text-center mb-5">
            <div className="flex items-end justify-center gap-1">
              <span className="text-4xl font-bold text-white">
                {formatPrice(BUSINESS_MONTHLY_PRICE)}
              </span>
              <span className="text-gray-400 mb-1">/mo</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {formatPrice(BUSINESS_MONTHLY_PRICE)} base +{" "}
              {formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)} per additional seat
            </p>
          </div>

          {/* Features */}
          <ul className="space-y-2.5 mb-5">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-gray-300">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          {error && (
            <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {loading
              ? "Redirecting to checkout..."
              : `Get Business — ${formatPrice(BUSINESS_MONTHLY_PRICE)}/mo`}
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
