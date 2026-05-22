"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import SportsCardBackground from "@/components/SportsCardBackground";
import { createClient } from "@/lib/supabase/client";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";
import {
  ANNUAL_SAVINGS,
  BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE,
  BUSINESS_INCLUDED_SEATS,
  BUSINESS_MONTHLY_PRICE,
  PRO_ANNUAL_PRICE,
  PRO_MONTHLY_PRICE,
  formatPrice,
} from "@/lib/pricing";
import { LIMITS } from "@/types";

function FeatureCard({
  icon,
  title,
  description,
  points,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  points: string[];
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
      <ul className="mt-4 space-y-2 text-sm text-gray-300">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
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
        const hasBusinessAccess = await hasBusinessWorkspaceAccess(
          supabase as any,
          user.id
        );

        if (hasBusinessAccess) {
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

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white/30" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
      <SportsCardBackground variant="hero" />
      <div className="relative z-10">
        <Header />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-14">
          <section className="rounded-2xl border border-gray-800 bg-gray-900/75 p-6 backdrop-blur-sm sm:p-10">
            <p className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              COLLECTORS · FLIPPERS · DEALERS
            </p>

            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              The intelligence platform for sports card collectors and businesses.
            </h1>

            <p className="mt-5 max-w-3xl text-base text-gray-300 sm:text-lg">
              Grade probability, pricing estimates, collection tracking, and full business
              operations — in one platform built for collectors and dealers alike.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white px-6 py-3 text-base font-semibold text-black transition-colors hover:bg-gray-200"
              >
                Start Free
              </Link>
              <Link
                href="/#features"
                className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-6 py-3 text-base font-semibold text-gray-200 transition-colors hover:border-gray-600 hover:text-white"
              >
                See How It Works
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Free Start</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">
                  {LIMITS.FREE_SEARCHES} card searches + {LIMITS.FREE_COLLECTION} saved cards
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Core Engines</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">
                  Grade Probability Engine, Pricing Insights, and Analyst AI
                </p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Scale Path</p>
                <p className="mt-1 text-sm font-semibold text-gray-100">
                  Upgrade from collector mode to full business operations
                </p>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-gray-800 bg-gray-900/70 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-500">Collector Mode</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Know what your cards are doing.</h2>
              <p className="mt-3 text-sm text-gray-400">
                Track cost basis, current value, and movement over time. Focus your collection on
                what is performing and cut what is stalling.
              </p>
            </article>

            <article className="rounded-xl border border-gray-800 bg-gray-900/70 p-6">
              <p className="text-xs uppercase tracking-wide text-gray-500">Business Mode</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Run inventory like a real desk.</h2>
              <p className="mt-3 text-sm text-gray-400">
                Manage inventory, sales, and pricing with your team in one workspace built for card operations.
              </p>
            </article>
          </section>

          <section id="features" className="mt-10">
            <h2 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">What You Can Do</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                title="Know the Grade Before You Submit"
                description="Upload card photos and get PSA and BGS grade probabilities with confidence levels — before you pay for a submission."
                badge="Featured"
                points={[
                  "Grade Probability Engine with confidence levels",
                  "Pre-submit expected value modeling",
                  "Submission ROI calculator",
                ]}
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                )}
              />
              <FeatureCard
                title="Price with Confidence"
                description="Review listing trends and estimated value ranges before you buy, list, or flip."
                points={[
                  "Estimated market value and trend tracking",
                  "Card photo identification to reduce manual entry",
                  "Saved searches and quick repeat workflows",
                ]}
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
                title="Operate at Scale"
                description="Manage inventory, track P&L, and sell across eBay and Whatnot from a single business dashboard."
                points={[
                  "Inventory, ledger, and sales tracking",
                  "Owner, manager, and employee seat roles",
                  "eBay and Whatnot channel integration",
                  "Business Consultant and Analyst workflows",
                ]}
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                )}
              />
              <FeatureCard
                title="Shop Below Our eBay Price"
                description="Paid subscribers get exclusive access to CardzCheck inventory priced at least 13.5% below our eBay storefront."
                badge="Subscriber Deal"
                points={[
                  "Always 13.5%+ below our eBay storefront",
                  "Loyalty discounts up to 10% for repeat buyers",
                  "Extra 1% off every order for Business members",
                ]}
                icon={(
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 7H4l1-7z"
                    />
                  </svg>
                )}
              />
            </div>
          </section>

          {/* CardzCheck Deals spotlight */}
          <section className="mt-10 overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-950/80 via-gray-900/80 to-gray-900/80">
            <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Subscriber Exclusive
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                  CardzCheck Deals
                </h2>
                <p className="mt-3 max-w-xl text-gray-300">
                  Every paid subscriber gets access to our curated storefront — CardzCheck inventory
                  priced at least <span className="font-semibold text-gray-200">13.5% below our eBay storefront</span>.
                  Some deals also come in below market comps. Not a peer-to-peer marketplace.
                  Sold directly by CardzCheck.
                </p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  {[
                    "Exclusive subscriber-only pricing on every listing",
                    "Loyalty discounts unlock at 5 and 10 purchases (up to 10% off)",
                    "Business plan members get an extra 1% off every deal",
                    "Every 5th purchase (15, 20, 25…) earns a milestone discount",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/marketplace"
                  className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
                >
                  Browse marketplace
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              <div className="shrink-0 lg:w-64">
                <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-5">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Pricing vs. our eBay</p>
                  <div className="mt-3 space-y-3">
                    {[
                      { label: "Our eBay storefront", value: "$179", muted: true },
                      { label: "Subscriber price", value: "$155", highlight: true },
                      { label: "You save", value: "$24 (13.5%)", green: true },
                    ].map(({ label, value, muted, highlight, green }) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className={`text-sm ${muted ? "text-gray-500 line-through" : "text-gray-300"}`}>
                          {label}
                        </span>
                        <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-white" : green ? "text-[#9baca3]" : "text-gray-500"}`}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-gray-500">
                    Example based on a $179 eBay listing. Business members save an additional 1%.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10 rounded-2xl border border-gray-800 bg-gray-900/75 p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Plans That Scale with You</h2>
            <p className="mt-2 text-gray-400">
              Start free. Upgrade when you want more depth or a full business workflow.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <article className="rounded-xl border border-gray-800 bg-gray-950/40 p-6">
                <h3 className="text-lg font-semibold text-white">Free</h3>
                <p className="mt-4 text-3xl font-bold text-white">$0</p>
                <p className="text-sm text-gray-400">forever</p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  <li>{LIMITS.FREE_SEARCHES} card searches</li>
                  <li>{LIMITS.FREE_COLLECTION} collection cards</li>
                  <li>Basic dashboard access</li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 font-medium text-gray-200 transition-colors hover:border-gray-600 hover:text-white"
                >
                  Create Free Account
                </Link>
              </article>

              <article className="rounded-xl border border-gray-700 bg-gray-950/50 p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Most Popular</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Pro</h3>
                <p className="mt-4 text-3xl font-bold text-white">{formatPrice(PRO_MONTHLY_PRICE)}/mo</p>
                <p className="text-sm text-gray-400">or {formatPrice(PRO_ANNUAL_PRICE)}/year (save {formatPrice(ANNUAL_SAVINGS)})</p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  <li>Unlimited card searches</li>
                  <li>Full collection tracking</li>
                  <li>Analyst AI + Grade Probability Engine</li>
                  <li>Subscriber deals (13.5%+ below our eBay)</li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-white/15 bg-white px-4 py-2.5 font-semibold text-black transition-colors hover:bg-gray-200"
                >
                  Start Pro
                </Link>
              </article>

              <article className="rounded-xl border border-gray-700 bg-gray-950/40 p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">For Card Teams</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Business</h3>
                <p className="mt-4 text-3xl font-bold text-white">{formatPrice(BUSINESS_MONTHLY_PRICE)}/mo</p>
                <p className="text-sm text-gray-400">
                  Includes {BUSINESS_INCLUDED_SEATS} user · Add team members for {formatPrice(BUSINESS_ADDITIONAL_SEAT_MONTHLY_PRICE)}/month each
                </p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  <li>Everything in Pro</li>
                  <li>Shared inventory, sales, and ledger workflows</li>
                  <li>Role-based team access and seat controls</li>
                  <li>Profit-focused business dashboard</li>
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-lg border border-white/12 bg-gray-900 px-4 py-2.5 font-semibold text-gray-100 transition-colors hover:bg-gray-800"
                >
                  Start Business
                </Link>
              </article>
            </div>
          </section>
        </main>

        <footer className="border-t border-gray-800 bg-[#0a0a0a]/90 py-8">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-gray-400">
            <div className="mb-4 flex justify-center">
              <span className="text-2xl font-bold tracking-tight text-white">CardzCheck</span>
            </div>
            <p>The intelligence platform for sports card collectors and businesses.</p>
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
