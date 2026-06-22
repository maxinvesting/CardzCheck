"use client";

import { useState } from "react";
import {
  SUBSCRIPTION_MONTHLY_PRICE,
  TRIAL_DAYS,
  formatPrice,
} from "@/lib/pricing";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PricingModal({ isOpen, onClose }: PricingModalProps) {
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
    "Full collection & inventory tracking",
    "Marketplace listing and selling tools",
    "Profit, fees, and payout reporting",
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
              Start with a {TRIAL_DAYS}-day free trial
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

        <div className="p-6">
          <div className="border-2 border-purple-600 rounded-xl p-5 relative">
            <div className="absolute -top-3 left-4 bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {TRIAL_DAYS}-DAY FREE TRIAL
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Pro</h3>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-3xl font-bold text-white">
                {formatPrice(SUBSCRIPTION_MONTHLY_PRICE)}
              </span>
              <span className="text-gray-400 mb-0.5">/mo</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Free for {TRIAL_DAYS} days, then {formatPrice(SUBSCRIPTION_MONTHLY_PRICE)}/month. Cancel anytime.
            </p>

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
              {loading ? "..." : `Start ${TRIAL_DAYS}-day free trial`}
            </button>
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
