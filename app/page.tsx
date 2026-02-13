"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SportsCardBackground from "@/components/SportsCardBackground";
import { createClient } from "@/lib/supabase/client";
import {
  PRO_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  ANNUAL_SAVINGS,
  formatPrice,
} from "@/lib/pricing";

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
          The all-in-one card tool.
        </h1>
        <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto">
          AI grade analysis, an analyst that knows your collection, estimated CMV, and tracking—all in one place.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-lg"
          >
            Get started
          </Link>
          <Link
            href="/signup"
            className="px-8 py-4 border-2 border-gray-600 text-white font-semibold rounded-xl hover:border-gray-500 transition-colors text-lg"
          >
            Create Account
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-400">
          Free tier available, no credit card required
        </p>
      </section>

      {/* Features */}
      <section className="bg-white dark:bg-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Your all-in-one card toolkit
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1: AI Grade Analysis */}
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                AI Grade Analysis
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Get AI-powered grade probabilities for raw cards. See likelihoods for PSA, BGS, SGC and estimated values by grade.
              </p>
            </div>

            {/* Feature 2: AI Analyst that knows your collection */}
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
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                AI Analyst That Knows Your Collection
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Ask questions in plain English. CardzCheck Analyst has context on your collection, watchlist, and the market—so you get answers that actually fit your cards.
              </p>
            </div>

            {/* Feature 3: Comps, ID & Tracking */}
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
                Comps, ID &amp; Tracking
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Estimated CMV based off of real eBay listings, card identification from photos, and collection tracking—all in one place.
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

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-12">
            {/* Free */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Free
              </h3>
              <p className="text-4xl font-bold text-gray-900 dark:text-white mt-4">
                $0
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Try CardzCheck
              </p>
              <ul className="mt-6 space-y-3 flex-1">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Collection tracking
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Smart Search + basic comps
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Limited CMV + Grade Probability uses
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Limited Analyst questions
                </li>
              </ul>
              <Link
                href="/signup"
                className="block mt-8 w-full py-3 text-center border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Get started
              </Link>
            </div>

            {/* Pro Monthly - Most popular */}
            <div className="bg-blue-600 rounded-2xl p-8 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full">
                Most popular
              </div>
              <h3 className="text-xl font-semibold text-white">
                Pro (Monthly)
              </h3>
              <p className="text-4xl font-bold text-white mt-4">
                {formatPrice(PRO_MONTHLY_PRICE)}
              </p>
              <p className="text-blue-200 mt-1">
                / month
              </p>
              <ul className="mt-6 space-y-3 flex-1">
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited collection + watchlist
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full CMV + comps engine
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Grade Probability Engine (more uses)
                </li>
                <li className="flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-blue-200 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  CardzCheck Analyst (more uses)
                </li>
              </ul>
              <Link
                href="/signup"
                className="block mt-8 w-full py-3 text-center bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Go Pro
              </Link>
            </div>

            {/* Pro Annual - Best value */}
            <div className="bg-white dark:bg-gray-900 border-2 border-blue-600 rounded-2xl p-8 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 text-sm font-semibold rounded-full">
                Best value
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Pro (Annual)
              </h3>
              <p className="text-4xl font-bold text-gray-900 dark:text-white mt-4">
                {formatPrice(PRO_ANNUAL_PRICE)}
              </p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                / year
              </p>
              <p className="text-green-600 dark:text-green-400 text-sm font-medium mt-2">
                Save {formatPrice(ANNUAL_SAVINGS)}/year
              </p>
              <ul className="mt-6 space-y-3 flex-1">
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited collection + watchlist
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full CMV + comps engine
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Grade Probability Engine (more uses)
                </li>
                <li className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  CardzCheck Analyst (more uses)
                </li>
              </ul>
              <Link
                href="/signup"
                className="block mt-8 w-full py-3 text-center bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Go Annual
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
            <p className="text-gray-400">The all-in-one card tool. AI grade analysis, collection-smart analyst, estimated CMV &amp; tracking.</p>
            <p className="mt-2 text-gray-500">
              Data sourced from eBay sold listings.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-gray-400">
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
