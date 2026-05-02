"use client";

import { useState } from "react";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

const FAQ_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    items: [
      {
        q: "How do I search for a card?",
        a: "From the Dashboard, type any player name, set, or card description into the search bar. CardzCheck will find matching cards and show you recent sales data and estimated market values. You can refine results by year, set, variation, and grade.",
      },
      {
        q: "How do I add a card to my collection?",
        a: "After searching for a card, click the card result to open its detail view, then click \"Add to Collection.\" You can specify the grade, purchase price, and quantity. Your collection total value updates automatically.",
      },
      {
        q: "What's the difference between the Free and Pro plans?",
        a: "Free accounts get 3 card searches to explore the platform. Pro members get unlimited searches, unlimited collection tracking, collection value tracking, and access to Pro-exclusive features like the Watchlist and CardzCheck Analyst.",
      },
      {
        q: "Can I use CardzCheck on mobile?",
        a: "Yes. CardzCheck has a mobile-optimized interface. On phones you'll see a bottom tab bar for quick navigation. The full feature set — including collection management, Bulk Mode, and Sales Search — works on any screen size.",
      },
    ],
  },
  {
    id: "pricing-estimates",
    title: "Pricing & Estimates",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    items: [
      {
        q: "Where does CardzCheck get its pricing data?",
        a: "CardzCheck uses public marketplace listing data (primarily eBay) to generate directional pricing estimates. Data freshness and coverage vary by card and source.",
      },
      {
        q: "How should I interpret the price estimates?",
        a: "Price estimates are directional guides, not guarantees. Actual card values vary based on condition, surface details, seller reputation, timing, and buyer demand. Always verify results against current listings and sold history before making decisions.",
      },
      {
        q: "What is the Sales Search feature?",
        a: "Sales Search lets you search any card and review filtered listing and sold-history results. You can filter by grade, date range, and platform to narrow to the most relevant matches.",
      },
      {
        q: "What is \"Estimated Market Value\" (Est. MV)?",
        a: "Est. MV is CardzCheck's modeled pricing estimate from available listing and sold-history signals. It's shown on card details and used in collection value summaries when estimate data is available.",
      },
    ],
  },
  {
    id: "collection",
    title: "Collection Tracking",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    items: [
      {
        q: "How is my collection value calculated?",
        a: "Each card in your collection is matched against available estimate data. CardzCheck multiplies each card's estimated value by quantity, then sums totals across your collection. Values update when estimate data is available.",
      },
      {
        q: "Can I track multiple copies of the same card?",
        a: "Yes. When adding a card to your collection you can specify a quantity greater than one, or add the same card multiple times with different grades or purchase prices to track each copy individually.",
      },
      {
        q: "Can I export my collection?",
        a: "Yes. From the Collection page, use the Export button to download a CSV of your collection including card names, grades, purchase prices, estimated market values, and quantities.",
      },
      {
        q: "What is Bulk Mode?",
        a: "Bulk Mode lets you add many cards to your collection or evaluate a large batch at once without searching one card at a time. It's especially useful after a show purchase or when cataloguing an acquired collection. Access it from the Bulk Mode item in the sidebar.",
      },
    ],
  },
  {
    id: "grade-engine",
    title: "Grade Probability Engine",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
    items: [
      {
        q: "What is the Grade Probability Engine?",
        a: "The Grade Probability Engine uses AI and historical grading data to predict the likelihood that a card will receive each possible grade (e.g., PSA 10, PSA 9, etc.) from a professional grading service. Upload photos of your card and describe its condition to get a probability breakdown.",
      },
      {
        q: "How accurate are the grade predictions?",
        a: "Grade estimates are AI-generated predictions, not guarantees. They are intended to help you decide whether submitting a card for grading makes financial sense — not to replace a professional grader's opinion. Actual grades assigned by PSA, BGS, SGC, or other services may differ significantly.",
      },
      {
        q: "Is the Grade Probability Engine affiliated with PSA, BGS, or SGC?",
        a: "No. CardzCheck is not affiliated with, endorsed by, or partnered with any grading company. The engine is an independent analytical tool only.",
      },
      {
        q: "How do I use the Grade Probability Engine to decide if grading is worth it?",
        a: "Enter your card's details and upload photos. The engine shows probability percentages for each grade and the corresponding market values, letting you calculate the expected return vs. the cost of grading services. A positive expected value means grading is likely worthwhile.",
      },
    ],
  },
  {
    id: "watchlist",
    title: "Watchlist",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    items: [
      {
        q: "What is the Watchlist?",
        a: "The Watchlist is a Pro feature that lets you track cards you're interested in buying without adding them to your collection. You'll see estimated market value and can monitor pricing trends over time.",
      },
      {
        q: "How do I add a card to my Watchlist?",
        a: "Search for a card and open its detail page. Click \"Add to Watchlist\" to start tracking it. You can manage all your watched cards from the Watchlist page in the sidebar.",
      },
      {
        q: "Does the Watchlist send price alerts?",
        a: "Price alert notifications are on our roadmap. Right now, you can check your Watchlist at any time to see how prices have moved since you started tracking a card.",
      },
    ],
  },
  {
    id: "analyst",
    title: "CardzCheck Analyst",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    items: [
      {
        q: "What is CardzCheck Analyst?",
        a: "CardzCheck Analyst is an AI-powered assistant that can answer questions about your collection, analyze market trends, help you research specific players or sets, and give you data-driven buying and selling insights — all through a natural-language chat interface.",
      },
      {
        q: "What can I ask the Analyst?",
        a: "You can ask things like: \"Which cards in my collection have gained the most value in the last 90 days?\", \"Is now a good time to sell my Patrick Mahomes rookie?\", \"What are the best-valued PSA 10 cards under $100 right now?\", or \"Summarize recent sales trends for 2023 Topps Chrome.\" The Analyst has context about your collection and CardzCheck's market data.",
      },
      {
        q: "Is CardzCheck Analyst available on the Free plan?",
        a: "No. CardzCheck Analyst is a Pro-exclusive feature. Upgrade to Pro to unlock it.",
      },
    ],
  },
  {
    id: "business",
    title: "Business Workspace",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    items: [
      {
        q: "What is the Business workspace?",
        a: "The Business workspace is designed for card dealers, resellers, and shop owners. It adds a dedicated Ledger (inventory tracking), Sales analytics, Revenue & profit dashboards, eBay integration, and a Business Consultant AI in a shared team workspace.",
      },
      {
        q: "How many users are included with Business?",
        a: "Business is $29/month and includes 1 owner seat. You can add additional team members for $12/month per seat.",
      },
      {
        q: "How do I switch between the personal and business workspaces?",
        a: "Use the workspace switcher in the sidebar header or the toggle in your account settings. The Business workspace has its own sidebar navigation, distinct from the personal workspace.",
      },
      {
        q: "How do I connect my eBay account?",
        a: "Go to Settings → eBay Integration and click \"Connect eBay Account.\" You'll be redirected to eBay to authorize CardzCheck. Once connected, you can sync your active listings and import sales history directly into your Business ledger.",
      },
      {
        q: "What is the eBay Parity Price?",
        a: "The eBay Parity Price is CardzCheck's calculation of the minimum price you should list a card at on eBay to break even, factoring in eBay's seller fees (Standard 13% or Top Rated Plus 12%). You can set your fee rate in Business Settings.",
      },
      {
        q: "Can I track inventory that isn't listed on eBay?",
        a: "Yes. You can manually add items to your Business inventory with purchase price, condition, grade, and notes — regardless of whether they're listed anywhere. The inventory is fully editable and exportable.",
      },
    ],
  },
  {
    id: "account-billing",
    title: "Account & Billing",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    items: [
      {
        q: "How do I upgrade to Pro?",
        a: "Click \"Upgrade\" in the sidebar or go to Settings → Current Plan → Upgrade. You'll be taken to secure Stripe checkout where you can select the plan that fits your workflow.",
      },
      {
        q: "How does Business billing work for teams?",
        a: "Business billing is monthly. The base plan is $29/month (1 included seat), and each additional team seat is $12/month.",
      },
      {
        q: "How do I change my email address?",
        a: "Email changes currently require contacting support. Reach out via the support link at the bottom of this page and our team will update it for you.",
      },
      {
        q: "How do I reset my password?",
        a: "On the login page, click \"Forgot password?\" to receive a reset link at your registered email address. If you don't see the email, check your spam folder. If you still need help, contact support.",
      },
      {
        q: "How do I delete my account?",
        a: "Go to Settings → Danger Zone → Delete Account. This action is permanent and will delete all your data including your collection, watchlist, and inventory. Please export any data you'd like to keep before deleting.",
      },
    ],
  },
];

const QUICK_LINKS = [
  { label: "Search Cards", href: "/dashboard", desc: "Look up any card and see recent sales", color: "blue" },
  { label: "My Collection", href: "/collection", desc: "Track and value your card collection", color: "purple" },
  { label: "Sales Search", href: "/comps", desc: "Review listing and sold-history data", color: "emerald" },
  { label: "Grade Probability Engine", href: "/grade-probability", desc: "Estimate grading probabilities with AI", color: "amber" },
  { label: "Bulk Mode", href: "/bulk", desc: "Add or evaluate cards in bulk", color: "rose" },
  { label: "Marketplace", href: "/marketplace", desc: "Browse cards for sale", color: "cyan" },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-gray-900 dark:text-white">{q}</span>
        <svg
          className={`w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

const colorMap: Record<string, string> = {
  blue:    "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50 text-blue-600 dark:text-blue-400",
  purple:  "bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/50 text-purple-600 dark:text-purple-400",
  emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400",
  amber:   "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50 text-amber-600 dark:text-amber-400",
  rose:    "bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/50 text-rose-600 dark:text-rose-400",
  cyan:    "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-100 dark:border-cyan-800/50 text-cyan-600 dark:text-cyan-400",
};

export default function HelpPage() {
  const [search, setSearch] = useState("");

  const filteredSections = FAQ_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        !search ||
        item.q.toLowerCase().includes(search.toLowerCase()) ||
        item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((section) => !search || section.items.length > 0);

  return (
    <AuthenticatedLayout>
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Help &amp; FAQ
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Everything you need to know about CardzCheck — from searching cards to running your business.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search help articles…"
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Quick Links (hidden while searching) */}
        {!search && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Jump to a feature
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex flex-col gap-1 p-4 rounded-xl border transition-opacity hover:opacity-80 ${colorMap[link.color]}`}
                >
                  <span className="text-sm font-semibold">{link.label}</span>
                  <span className="text-xs opacity-75">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Sections */}
        {filteredSections.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">No results for &ldquo;{search}&rdquo;</p>
            <p className="text-sm mt-1">Try different keywords or browse the sections below.</p>
            <button onClick={() => setSearch("")} className="mt-3 text-blue-500 hover:text-blue-400 text-sm font-medium">
              Clear search
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSections.map((section) => (
              <div
                key={section.id}
                id={section.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6"
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-blue-500 dark:text-blue-400">{section.icon}</span>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    {section.title}
                  </h2>
                </div>
                <div>
                  {section.items.map((item) => (
                    <AccordionItem key={item.q} q={item.q} a={item.a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact / Support */}
        <div className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
            Still need help?
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Can&apos;t find what you&apos;re looking for? Our team is happy to help with any questions not covered here.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:support@cardzcheck.com"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Support
            </a>
            <div className="flex gap-3">
              <Link
                href="/terms"
                className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
