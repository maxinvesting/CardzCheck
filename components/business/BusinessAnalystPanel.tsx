"use client";

import { useMemo } from "react";
import type { BusinessInventoryItem } from "@/types";
import { generateBusinessAnalystInsights } from "@/lib/business/analyst-insights";

interface Props {
  items: BusinessInventoryItem[];
}

const SECTION_ORDER = [
  { key: "listingOpportunities", title: "Listing Opportunities" },
  { key: "inventoryRisks", title: "Inventory Risks" },
  { key: "profitSignals", title: "Profit Signals" },
  { key: "behavioralObservations", title: "Behavioral Observations" },
] as const;

type SectionKey = (typeof SECTION_ORDER)[number]["key"];

export default function BusinessAnalystPanel({ items }: Props) {
  const insights = useMemo(() => generateBusinessAnalystInsights(items), [items]);

  return (
    <section className="mb-3 rounded-lg border border-gray-800 bg-gray-900/80">
      <div className="flex flex-col gap-2 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">AI Business Analyst</h2>
          <p className="text-xs text-gray-400">Inventory &amp; Profit Intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 font-medium uppercase tracking-wider text-emerald-300">
            AI
          </span>
          <span className="text-gray-500">
            {insights.coverage.totalItems} tracked
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-gray-800 px-3 py-2 text-[10px] text-gray-400 md:grid-cols-4">
        <div>
          Active
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.activeItems}
          </span>
        </div>
        <div>
          CMV Coverage
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.cmvCoveragePct}%
          </span>
        </div>
        <div>
          LIST Coverage
          <span className="ml-1 font-semibold text-gray-200">
            {insights.coverage.listCoveragePct}%
          </span>
        </div>
        <div className="text-gray-500">Deterministic inventory signals</div>
      </div>

      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        {SECTION_ORDER.map((section) => {
          const sectionInsights = insights[section.key as SectionKey];
          return (
            <div
              key={section.key}
              className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2"
            >
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {sectionInsights.map((text, idx) => (
                  <li
                    key={`${section.key}-${idx}`}
                    className="flex items-start gap-1.5 text-xs text-gray-200"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-500" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
