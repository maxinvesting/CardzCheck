"use client";

import { useEffect, useState } from "react";

export interface TierGates {
  tier: "free" | "business" | "business_pro";
  canBulkAddByCert: boolean;
  canMultiCardScan: boolean;
  maxGradeScanSlots: number;
  /** null = unlimited, 0 = blocked (paywall), positive = weekly cap */
  analystWeeklyLimit: number | null;
  /** null = unlimited */
  inventoryItemCap: number | null;
  canSellOnMarketplace: boolean;
  marketplaceFees: { one_pct: number; two_pct: number; five_pct: number };
}

export interface WeeklyAnalystUsage {
  messagesUsed: number;
  weekStart: string | null;
  resetsAt: string | null;
}

interface UseTierGatesReturn {
  gates: TierGates | null;
  analyst: WeeklyAnalystUsage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

let cachedGates: TierGates | null = null;
let cachedAnalyst: WeeklyAnalystUsage | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Reads the caller's tier + feature gates from /api/me/tier.
 * In-memory cache so repeated mounts (e.g. nav between pages) don't refetch.
 */
export function useTierGates(): UseTierGatesReturn {
  const [gates, setGates] = useState<TierGates | null>(cachedGates);
  const [analyst, setAnalyst] = useState<WeeklyAnalystUsage | null>(cachedAnalyst);
  const [loading, setLoading] = useState(!cachedGates);
  const [error, setError] = useState<string | null>(null);

  async function fetchOnce() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/tier", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to load tier");
        return;
      }
      cachedGates = data.gates ? { tier: data.tier, ...data.gates } : null;
      cachedAnalyst = data.analyst ?? null;
      cachedAt = Date.now();
      setGates(cachedGates);
      setAnalyst(cachedAnalyst);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tier");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const fresh = cachedGates && Date.now() - cachedAt < CACHE_TTL_MS;
    if (!fresh) void fetchOnce();
  }, []);

  return {
    gates,
    analyst,
    loading,
    error,
    refresh: fetchOnce,
  };
}
