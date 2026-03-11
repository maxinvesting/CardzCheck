"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import SportsCardBackground from "@/components/SportsCardBackground";
import { createClient } from "@/lib/supabase/client";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";

function FeatureCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-blue-300">
          {icon}
        </div>
        {badge ? (
          <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-300">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </article>
  );
}

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Authenticated user - redirect by tier
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("user_id", user.id)
          .maybeSingle();

        if (hasActiveBusinessTier(subscription)) {
          router.replace("/business");
          return;
        }

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
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1419] relative overflow-hidden">
      <SportsCardBackground variant="hero" />
      <div className="relative z-10">
        <Header />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-14">
          <section className="rounded-2xl border border-gray-800 bg-gray-900/75 p-6 backdrop-blur-sm sm:p-10">
            <p className="inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-300">
              Live eBay pricing plus collection tracking
            </p>

            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Card Ladder charges{" "}
              <span className="text-gray-500 line-through">$200/year</span>.
              <br />
              CardzCheck charges{" "}
              <span className="text-blue-400">$20 once</span>.
            </h1>

            <p className="mt-5 max-w-3xl text-base text-gray-300 sm:text-lg">
              Search comps, identify cards from photos, and track your collection value in one
              place with the same interface used inside the app.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/comps"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Try It Free
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-6 py-3 text-base font-semibold text-gray-200 transition-colors hover:border-gray-600 hover:text-white"
              >
                Create Account
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Starter Access</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">
                  3 free searches, no credit card required
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Data Source</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">Real-time eBay listing data</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Core Workflow</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">Search, value, track, repeat</p>
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">How It Works</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <FeatureCard
                title="Photo Identification"
                description="Upload a card photo and auto-fill the player, year, set, and grade details before running comps."
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                )}
              />
              <FeatureCard
                title="Real-Time Comps"
                description="See active market pricing and valuation stats with the same comps engine used in your dashboard."
                badge="Beta"
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                )}
              />
              <FeatureCard
                title="Collection Tracking"
                description="Save cards, track cost basis against market value, and monitor portfolio movement from one screen."
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                )}
              />
            </div>
          </section>

          <section className="mt-10 rounded-2xl border border-gray-800 bg-gray-900/75 p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Simple Pricing</h2>
            <p className="mt-2 text-gray-400">No subscription trap. Upgrade once and keep full access.</p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-gray-800 bg-gray-950/40 p-6">
                <h3 className="text-xl font-semibold text-white">Free</h3>
                <p className="mt-4 text-4xl font-bold text-white">$0</p>
                <p className="text-sm text-gray-400">forever</p>
                <ul className="mt-6 space-y-2 text-sm text-gray-300">
                  <li className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    3 card searches
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    5 cards in collection
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 font-medium text-gray-200 transition-colors hover:border-gray-600 hover:text-white"
                >
                  Get Started
                </Link>
              </article>

              <article className="relative rounded-xl border border-blue-500/50 bg-blue-500/10 p-6">
                <div className="absolute right-4 top-4 rounded-full border border-blue-300/40 bg-blue-400/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-200">
                  Best Value
                </div>
                <h3 className="text-xl font-semibold text-white">Pro</h3>
                <p className="mt-4 text-4xl font-bold text-white">$20</p>
                <p className="text-sm text-blue-200">one-time payment</p>
                <ul className="mt-6 space-y-2 text-sm text-blue-100">
                  <li className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited searches
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited collection
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Collection tracking and analytics
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Upgrade
                </Link>
              </article>
            </div>
          </section>
        </main>

        <footer className="border-t border-gray-800 bg-[#0f1419]/80 py-8">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-400">
            <div className="mb-4 flex justify-center">
              <span className="text-2xl font-bold tracking-tight text-white">CardzCheck</span>
            </div>
            <p>Sports Card Price Comps (Beta) + Collection Tracker</p>
            <p className="mt-2 text-gray-500">Data sourced from eBay sold listings.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              <Link href="/terms" className="transition-colors hover:text-white">
                Terms
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-white">
                Privacy
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
