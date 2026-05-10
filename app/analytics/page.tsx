"use client";

import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

const TOOLS = [
  {
    name: "Compare Listings",
    href: "/comps",
    description: "Live eBay sold comps and active listings — get a CMV for any card.",
  },
  {
    name: "Watchlist",
    href: "/watchlist",
    description: "Track cards you don't own and get alerts on price moves.",
    badge: "Pro",
  },
  {
    name: "CardzCheck Analyst",
    href: "/analyst",
    description: "AI-driven trend analysis, hold/sell signals, and market commentary.",
    badge: "Pro",
  },
  {
    name: "Grade Probability Engine",
    href: "/grade-hub",
    description: "Predict grading outcomes from photos and pick the best submission strategy.",
  },
];

export default function AnalyticsHubPage() {
  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-[#0f1419] text-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Market intelligence tools for valuing, tracking, and timing your cards.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group rounded-lg border border-gray-800 bg-gray-900/50 p-5 transition-colors hover:border-gray-700 hover:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight text-white group-hover:text-blue-300">
                    {tool.name}
                  </h2>
                  {tool.badge && (
                    <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                  {tool.description}
                </p>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500 group-hover:text-blue-400">
                  Open →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
