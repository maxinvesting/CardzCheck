"use client";

import { useState } from "react";
import {
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ANNUAL_SAVINGS,
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
    "Unlimited comp searches",
    "Full collection tracking",
    "CardzCheck Analyst AI",
    "Grade Probability Engine",
    "Watchlist & price alerts",
    "Priority support",
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Upgrade to Pro</h2>
            <p className="text-sm text-gray-400 mt-1">
              Unlock all CardzCheck features
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
          <div className="flex items-center bg-gray-800 rounded-xl p-1 gap-1">
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
                Save {formatPrice(ANNUAL_SAVINGS)}
              </span>
            </button>
          </div>

          {/* Price display */}
          <div className="mt-5 text-center">
            <div className="flex items-end justify-center gap-1">
              <span className="text-4xl font-bold text-white">
                {billing === "monthly"
                  ? formatPrice(PRO_MONTHLY_PRICE)
                  : formatPrice(PRO_ANNUAL_PRICE / 12, { decimals: 2 })}
              </span>
              <span className="text-gray-400 mb-1">/mo</span>
            </div>
            {billing === "annual" && (
              <p className="text-sm text-gray-400 mt-1">
                Billed {formatPrice(PRO_ANNUAL_PRICE)}/year
              </p>
            )}
            {billing === "monthly" && (
              <p className="text-sm text-gray-500 mt-1">
                or {formatPrice(PRO_ANNUAL_PRICE / 12, { decimals: 2 })}/mo billed annually
              </p>
            )}
          </div>

          {/* Features */}
          <ul className="mt-5 space-y-2.5">
            {proFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                <svg
                  className="w-4 h-4 text-purple-400 flex-shrink-0"
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
                {feature}
              </li>
            ))}
          </ul>

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="mt-5 w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {loading
              ? "Redirecting to checkout..."
              : `Get Pro — ${billing === "monthly" ? `${formatPrice(PRO_MONTHLY_PRICE)}/mo` : `${formatPrice(PRO_ANNUAL_PRICE)}/yr`}`}
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
