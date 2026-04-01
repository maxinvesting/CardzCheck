"use client";

import { useEffect, useState } from "react";

interface ShopListingAiInsightProps {
  listingId: string;
}

export default function ShopListingAiInsight({ listingId }: ShopListingAiInsightProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/shop/listings/${listingId}/ai-insight`);
        if (!res.ok) throw new Error("failed");
        const json = await res.json();
        if (!cancelled) setInsight(json.insight ?? null);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (error) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-cyan-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-widest text-cyan-700">
          Market Insight
        </span>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          <div className="h-3.5 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-3.5 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-3.5 w-4/6 animate-pulse rounded bg-slate-100" />
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-slate-700">{insight}</p>
          <p className="mt-3 text-[11px] text-slate-400">Powered by CardzCheck AI · Updated weekly</p>
        </>
      )}
    </div>
  );
}
