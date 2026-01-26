"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SportsCardBackground from "@/components/SportsCardBackground";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Authenticated user - redirect to dashboard
        router.replace("/dashboard");
      } else {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1419] relative overflow-hidden">
      <SportsCardBackground variant="hero" />
      <div className="relative z-10">
        <Header />

        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight">
          Card Ladder charges{" "}
          <span className="line-through text-gray-400">$200/year</span>
          <br />
          We charge{" "}
          <span className="text-[#3a7fff]">$20 once</span>
        </h1>
        <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
          Real-time eBay sold prices, card identification, and collection tracking.
          Everything you need to know what your cards are worth.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/search"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-lg"
          >
            Try It Free
          </Link>
          <Link
            href="/signup"
            className="px-8 py-4 border-2 border-gray-600 text-white font-semibold rounded-xl hover:border-gray-500 transition-colors text-lg"
          >
            Create Account
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          3 free searches, no credit card required
        </p>
      </section>

      {/* Features */}
      <section className="bg-white dark:bg-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-blue-600 dark:text-blue-400"
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
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Photo ID
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Upload a photo of your card. We identify the player, year, set, and grade for you.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Real-Time Comps
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                See actual eBay sold prices. Get the CMV (Current Market Value) based on recent sales.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-purple-600 dark:text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Track Your Collection
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Save cards to your collection. Track what you paid vs. current value. Know your portfolio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">
            Simple Pricing
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
            No subscriptions. No hidden fees. Pay once, use forever.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Free
              </h3>
              <p className="text-4xl font-bold text-gray-900 dark:text-white mt-4">
                $0
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                forever
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  3 card searches
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  5 cards in collection
                </li>
              </ul>
              <Link
                href="/signup"
                className="block mt-8 w-full py-3 text-center border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-blue-600 rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 text-sm font-semibold rounded-full">
                Best Value
              </div>
              <h3 className="text-xl font-semibold text-white">
                Pro
              </h3>
              <p className="text-4xl font-bold text-white mt-4">
                $20
              </p>
              <p className="text-blue-200 mt-1">
                one-time payment
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited searches
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited collection
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Portfolio tracking
                </li>
              </ul>
              <Link
                href="/signup"
                className="block mt-8 w-full py-3 text-center bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

        {/* Footer */}
        <footer className="bg-[#0f1419]/80 border-t border-gray-800 py-8">
          <div className="max-w-6xl mx-auto px-4 text-center text-gray-400 text-sm">
            <div className="flex justify-center mb-4">
              <span className="text-2xl font-bold text-white opacity-80">
                CardzCheck
              </span>
            </div>
            <p className="text-gray-400">Sports Card Price Comps + Collection Tracker</p>
            <p className="mt-2 text-gray-500">
              Data sourced from eBay sold listings.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
