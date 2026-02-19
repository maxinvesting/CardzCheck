"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DebugResponse = {
  latestFactors: Array<{
    card_fingerprint: string;
    computed_at: string;
    confidence: "low" | "medium" | "high";
    discount_ratio: number | null;
    discount_ratio_clipped: number | null;
    listing_count: number | null;
    sold_count: number | null;
  }>;
  selectedFactor: {
    card_fingerprint: string;
    computed_at: string;
    confidence: "low" | "medium" | "high";
    discount_ratio: number | null;
    discount_ratio_clipped: number | null;
    listing_median_cents: number | null;
    sold_median_cents: number | null;
    listing_count: number | null;
    sold_count: number | null;
    bucket: {
      priceTier: string;
      liquidityBucket: string;
      gradedFlag: string;
      auctionMix?: string;
    };
  } | null;
  selectedSnapshots: {
    active: { query_text: string; observed_at: string; prices_cents: number[] } | null;
    sold: { query_text: string; observed_at: string; prices_cents: number[] } | null;
  };
  selectedDistributions: {
    active: {
      raw: number[];
      trimmed: number[];
      outliersRemoved: number;
      medianRaw: number | null;
      medianTrimmed: number | null;
    } | null;
    sold: {
      raw: number[];
      trimmed: number[];
      outliersRemoved: number;
      medianRaw: number | null;
      medianTrimmed: number | null;
    } | null;
  };
  selectedExpectedDiscount: {
    ratio: number;
    p25: number | null;
    p75: number | null;
    confidence: "low" | "medium" | "high";
    source: string;
  } | null;
  selectedCmv: {
    method: "sold_median" | "listing_adjusted" | "insufficient_data";
    cmv: number | null;
    confidence: "low" | "medium" | "high";
  } | null;
  selectedComparison: {
    oldListingMedian: number | null;
    newCmv: number | null;
    deltaPct: number | null;
    method: string;
  };
  selectedBucketRows: Array<{
    ratio_median: number;
    ratio_p25: number | null;
    ratio_p75: number | null;
    n_cards: number;
    confidence: "low" | "medium" | "high";
    computed_at: string;
  }>;
  topDeltas: Array<{
    cardFingerprint: string;
    queryText: string;
    oldListingMedian: number | null;
    newCmv: number | null;
    deltaPct: number | null;
    method: string;
    confidence: "low" | "medium" | "high";
  }>;
};

function toUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function centsToDollars(value: number): number {
  return Math.round((value / 100) * 100) / 100;
}

export default function MarketDiscountAdminClient() {
  const [query, setQuery] = useState("");
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const [data, setData] = useState<DebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<"refresh" | "seed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (overrideFingerprint?: string | null, overrideQuery?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const q = overrideQuery ?? query;
        if (q.trim()) params.set("q", q.trim());
        const targetFingerprint = overrideFingerprint ?? selectedFingerprint;
        if (targetFingerprint) params.set("fingerprint", targetFingerprint);
        params.set("limit", "40");

        const response = await fetch(`/api/admin/market-discount?${params.toString()}`);
        const payload = (await response.json()) as DebugResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load market discount debug data");
        }

        setData(payload);

        const nextFingerprint =
          targetFingerprint ?? payload.selectedFactor?.card_fingerprint ?? payload.latestFactors[0]?.card_fingerprint ?? null;
        setSelectedFingerprint(nextFingerprint);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    },
    [query, selectedFingerprint]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const distributionRows = useMemo(() => {
    const active = data?.selectedDistributions.active;
    const sold = data?.selectedDistributions.sold;
    return [
      {
        series: "Active Raw",
        median: active?.medianRaw ?? null,
        count: active?.raw.length ?? 0,
      },
      {
        series: "Active Trimmed",
        median: active?.medianTrimmed ?? null,
        count: active?.trimmed.length ?? 0,
      },
      {
        series: "Sold Raw",
        median: sold?.medianRaw ?? null,
        count: sold?.raw.length ?? 0,
      },
      {
        series: "Sold Trimmed",
        median: sold?.medianTrimmed ?? null,
        count: sold?.trimmed.length ?? 0,
      },
    ];
  }, [data]);

  const topDeltaChart = useMemo(
    () =>
      (data?.topDeltas ?? []).map((row) => ({
        label: row.queryText ? row.queryText.slice(0, 24) : row.cardFingerprint.slice(0, 24),
        deltaPct: row.deltaPct ?? 0,
      })),
    [data]
  );

  const runRefresh = async () => {
    if (!selectedFingerprint) return;
    setBusyAction("refresh");
    setError(null);
    try {
      const response = await fetch("/api/admin/market-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", fingerprint: selectedFingerprint }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Refresh failed");
      await load(selectedFingerprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusyAction(null);
    }
  };

  const runSeed = async () => {
    setBusyAction("seed");
    setError(null);
    try {
      const response = await fetch("/api/admin/market-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Seed failed");
      await load(selectedFingerprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fingerprint or query text"
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => load(null, query)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
          >
            {loading ? "Loading..." : "Search"}
          </button>
          <button
            onClick={runRefresh}
            disabled={!selectedFingerprint || busyAction !== null}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg text-sm font-medium"
          >
            {busyAction === "refresh" ? "Refreshing..." : "Refresh Selected"}
          </button>
          <button
            onClick={runSeed}
            disabled={busyAction !== null}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-800 rounded-lg text-sm font-medium"
          >
            {busyAction === "seed" ? "Seeding..." : "Seed 10"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="max-h-56 overflow-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="text-left px-3 py-2">Fingerprint</th>
                <th className="text-left px-3 py-2">Ratio</th>
                <th className="text-left px-3 py-2">Counts</th>
                <th className="text-left px-3 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {(data?.latestFactors ?? []).map((factor) => {
                const selected = factor.card_fingerprint === selectedFingerprint;
                return (
                  <tr
                    key={factor.card_fingerprint}
                    onClick={() => {
                      setSelectedFingerprint(factor.card_fingerprint);
                      void load(factor.card_fingerprint);
                    }}
                    className={`cursor-pointer border-t border-gray-800 ${selected ? "bg-blue-900/30" : "hover:bg-gray-900/60"}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{factor.card_fingerprint.slice(0, 80)}</td>
                    <td className="px-3 py-2">{factor.discount_ratio_clipped?.toFixed(3) ?? "-"}</td>
                    <td className="px-3 py-2">{factor.sold_count ?? 0} sold / {factor.listing_count ?? 0} active</td>
                    <td className="px-3 py-2 uppercase">{factor.confidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {data?.selectedFactor && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Selected Factor</h2>
            <p className="text-xs font-mono text-gray-400 break-all">{data.selectedFactor.card_fingerprint}</p>
            <p className="text-sm text-gray-300">Query: {data.selectedSnapshots.active?.query_text ?? data.selectedSnapshots.sold?.query_text ?? "-"}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Listing median: {toUsd(data.selectedFactor.listing_median_cents ? centsToDollars(data.selectedFactor.listing_median_cents) : null)}</div>
              <div>Sold median: {toUsd(data.selectedFactor.sold_median_cents ? centsToDollars(data.selectedFactor.sold_median_cents) : null)}</div>
              <div>Discount ratio: {data.selectedFactor.discount_ratio?.toFixed(3) ?? "-"}</div>
              <div>Clipped ratio: {data.selectedFactor.discount_ratio_clipped?.toFixed(3) ?? "-"}</div>
              <div>Model method: {data.selectedComparison.method}</div>
              <div>Model confidence: {data.selectedCmv?.confidence ?? "low"}</div>
              <div>Old CMV (listing median): {toUsd(data.selectedComparison.oldListingMedian)}</div>
              <div>New CMV: {toUsd(data.selectedComparison.newCmv)}</div>
              <div>Delta: {toPct(data.selectedComparison.deltaPct)}</div>
              <div>Expected ratio: {data.selectedExpectedDiscount?.ratio?.toFixed(3) ?? "-"}</div>
            </div>
            <p className="text-xs text-gray-400">
              Bucket: {JSON.stringify(data.selectedFactor.bucket)}
            </p>
          </div>

          <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Distribution Medians</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="series" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="median" fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-xs text-gray-400">
              Active outliers removed: {data.selectedDistributions.active?.outliersRemoved ?? 0} | Sold outliers removed: {data.selectedDistributions.sold?.outliersRemoved ?? 0}
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Where New CMV Differs From Listing Median</h2>
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topDeltaChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" hide />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="deltaPct" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="max-h-72 overflow-auto border border-gray-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="text-left px-3 py-2">Query</th>
                <th className="text-left px-3 py-2">Old</th>
                <th className="text-left px-3 py-2">New</th>
                <th className="text-left px-3 py-2">Delta</th>
                <th className="text-left px-3 py-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topDeltas ?? []).map((row) => (
                <tr key={row.cardFingerprint} className="border-t border-gray-800">
                  <td className="px-3 py-2">{row.queryText || row.cardFingerprint.slice(0, 48)}</td>
                  <td className="px-3 py-2">{toUsd(row.oldListingMedian)}</td>
                  <td className="px-3 py-2">{toUsd(row.newCmv)}</td>
                  <td className="px-3 py-2">{toPct(row.deltaPct)}</td>
                  <td className="px-3 py-2">{row.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
