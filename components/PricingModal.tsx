"use client";

import { useState } from "react";
import {
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ANNUAL_SAVINGS,
  BUSINESS_MONTHLY_PRICE,
  BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE,
  BUSINESS_INCLUDED_SEATS,
  formatPrice,
} from "@/lib/pricing";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ billing }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to start checkout. Please try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "No checkout URL returned. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const proFeatures = [
    "Unlimited card searches",
    "Full collection tracking",
    "CardzCheck Analyst AI",
    "Grade Probability Engine",
    "Watchlist & price alerts",
    "Priority support",
  ];

  const businessFeatures = [
    "Everything in Pro",
    `Includes ${BUSINESS_INCLUDED_SEATS} user seat`,
    `Additional seats ${formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)}/month each`,
    "Shared inventory and sales workflows",
    "Revenue and profit dashboards",
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Upgrade Your Plan</h2>
            <p className="text-sm text-gray-400 mt-1">
              Choose the plan that fits your needs
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors ml-4 mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Billing toggle */}
        <div className="p-6 pb-4">
          <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-1 max-w-xs mx-auto mb-6">
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
              <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full">
                Save
              </span>
            </button>
          </div>

          {/* Two-column plan comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pro plan */}
            <div className="border border-gray-700 rounded-xl p-5">
              <h3 className="text-lg font-bold text-white mb-1">Pro</h3>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-3xl font-bold text-white">
                  {billing === "monthly"
                    ? formatPrice(PRO_MONTHLY_PRICE)
                    : formatPrice(PRO_ANNUAL_PRICE / 12, { decimals: 2 })}
                </span>
                <span className="text-gray-400 mb-0.5">/mo</span>
              </div>
              {billing === "annual" && (
                <p className="text-xs text-gray-400 -mt-3 mb-4">
                  Billed {formatPrice(PRO_ANNUAL_PRICE)}/year · Save {formatPrice(ANNUAL_SAVINGS)}
                </p>
              )}

              <ul className="space-y-2 mb-5">
                {proFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {loading ? "..." : `Get Pro`}
              </button>
            </div>

            {/* Business plan */}
            <div className="border-2 border-emerald-600 rounded-xl p-5 relative">
              <div className="absolute -top-3 left-4 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                RECOMMENDED
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Business</h3>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-3xl font-bold text-white">
                  {formatPrice(BUSINESS_MONTHLY_PRICE)}
                </span>
                <span className="text-gray-400 mb-0.5">/mo</span>
              </div>

              <ul className="space-y-2 mb-5">
                {businessFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={async () => {
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
                }}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                {loading ? "..." : `Get Business`}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          <p className="text-center text-xs text-gray-500 mt-4">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
