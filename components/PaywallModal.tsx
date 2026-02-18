"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LIMITS } from "@/types";
import PricingModal from "@/components/PricingModal";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "search" | "collection";
}

export default function PaywallModal({ isOpen, onClose, type }: PaywallModalProps) {
  const router = useRouter();
  const [pricingOpen, setPricingOpen] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login?redirect=/comps");
      return;
    }

    setPricingOpen(true);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">
              {type === "search" ? "Unlock Unlimited Searches" : "Expand Your Collection"}
            </h2>
            <p className="text-blue-100 mt-2">
              {type === "search"
                ? `You've used your ${LIMITS.FREE_SEARCHES} free searches`
                : `Your collection has reached the ${LIMITS.FREE_COLLECTION} card limit`}
            </p>
          </div>

          {/* Body */}
          <div className="p-6">
            <div className="text-center mb-6">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                Upgrade to Pro
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Unlimited searches and collection
              </p>
            </div>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Unlimited card searches
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Unlimited collection tracking
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                AI card photo identification
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Real-time eBay sold prices
              </li>
              <li className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Collection value tracking
              </li>
            </ul>

            <div className="space-y-3">
              <button
                onClick={handleUpgrade}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Upgrade Now
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 px-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>

      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </>
  );
}
