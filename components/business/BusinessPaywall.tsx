"use client";

import { useState } from "react";
import {
  BUSINESS_MONTHLY_PRICE,
  BUSINESS_ANNUAL_PRICE,
  BUSINESS_ANNUAL_SAVINGS,
  formatPrice,
} from "@/lib/pricing";

export default function BusinessPaywall() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
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
        body: JSON.stringify({ billing, tier: "business" }),
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
    "Spreadsheet-style inventory tracking",
    "Revenue & profit dashboards (MTD / YTD)",
    "Bulk status & location updates",
    "CSV export for inventory",
    "All Pro features included",
  ];

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
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
          {/* Billing toggle */}
          <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-1 mb-5">
            <button
              onClick={() => setBilling("monthly")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                billing === "monthly"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                billing === "annual"
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Annual
              <span className="text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                Save {formatPrice(BUSINESS_ANNUAL_SAVINGS)}
              </span>
            </button>
          </div>

          {/* Price */}
          <div className="text-center mb-5">
            <div className="flex items-end justify-center gap-1">
              <span className="text-4xl font-bold text-white">
                {billing === "monthly"
                  ? formatPrice(BUSINESS_MONTHLY_PRICE)
                  : formatPrice(BUSINESS_ANNUAL_PRICE / 12, { decimals: 2 })}
              </span>
              <span className="text-gray-400 mb-1">/mo</span>
            </div>
            {billing === "annual" && (
              <p className="text-sm text-gray-400 mt-1">
                Billed {formatPrice(BUSINESS_ANNUAL_PRICE)}/year
              </p>
            )}
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
              : `Get Business — ${billing === "monthly" ? `${formatPrice(BUSINESS_MONTHLY_PRICE)}/mo` : `${formatPrice(BUSINESS_ANNUAL_PRICE)}/yr`}`}
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
