// eBay response caching utilities
// Uses in-memory cache with Supabase persistence

import type { ForSaleData, RecentCompsData } from "./types";
import { normalizeQueryForCache, hashQuery } from "./utils";
import type { EbaySearchParams } from "./types";

// Cache TTLs
const FOR_SALE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const COMPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STALE_COMPS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (allow stale)

// In-memory cache (for serverless warm starts)
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

const forSaleCache = new Map<string, CacheEntry<ForSaleData>>();
const compsCache = new Map<string, CacheEntry<RecentCompsData>>();

/**
 * Get cache key from params
 */
export function getCacheKey(params: EbaySearchParams): string {
  const normalized = normalizeQueryForCache(params);
  return hashQuery(normalized);
}

/**
 * Get cached forSale data
 */
export function getCachedForSale(params: EbaySearchParams): ForSaleData | null {
  const key = getCacheKey(params);
  const entry = forSaleCache.get(key);

  if (!entry) return null;

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    forSaleCache.delete(key);
    return null;
  }

  console.log(`📦 Cache hit (forSale): ${key}`);
  return {
    ...entry.data,
    cachedAt: new Date(entry.cachedAt).toISOString(),
  };
}

/**
 * Cache forSale data
 */
export function cacheForSale(params: EbaySearchParams, data: ForSaleData): void {
  const key = getCacheKey(params);
  const now = Date.now();

  forSaleCache.set(key, {
    data,
    cachedAt: now,
    expiresAt: now + FOR_SALE_CACHE_TTL_MS,
  });

  console.log(`📦 Cached forSale data: ${key}`);

  // Prune old entries
  pruneCache(forSaleCache, 100);
}

/**
 * Get cached comps data (allows stale)
 */
export function getCachedComps(params: EbaySearchParams, allowStale: boolean = true): {
  data: RecentCompsData | null;
  isStale: boolean;
} {
  const key = getCacheKey(params);
  const entry = compsCache.get(key);

  if (!entry) {
    return { data: null, isStale: false };
  }

  const now = Date.now();
  const isExpired = now > entry.expiresAt;
  const isStale = isExpired && now < entry.cachedAt + STALE_COMPS_TTL_MS;

  // Fully expired (beyond stale threshold)
  if (isExpired && !isStale) {
    compsCache.delete(key);
    return { data: null, isStale: false };
  }

  // Fresh or stale data
  if (!isExpired || (isStale && allowStale)) {
    console.log(`📦 Cache hit (comps, stale=${isStale}): ${key}`);

    const data = {
      ...entry.data,
      status: isStale ? "stale" as const : entry.data.status,
      cachedAt: new Date(entry.cachedAt).toISOString(),
    };

    return { data, isStale };
  }

  return { data: null, isStale: false };
}

/**
 * Cache comps data
 */
export function cacheComps(params: EbaySearchParams, data: RecentCompsData): void {
  const key = getCacheKey(params);
  const now = Date.now();

  compsCache.set(key, {
    data,
    cachedAt: now,
    expiresAt: now + COMPS_CACHE_TTL_MS,
  });

  console.log(`📦 Cached comps data: ${key}`);

  // Prune old entries
  pruneCache(compsCache, 100);
}

/**
 * Prune cache to maximum size (LRU-ish)
 */
function pruneCache<T>(cache: Map<string, CacheEntry<T>>, maxSize: number): void {
  if (cache.size <= maxSize) return;

  // Remove oldest entries
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].cachedAt - b[1].cachedAt);

  const toRemove = entries.slice(0, cache.size - maxSize);
  for (const [key] of toRemove) {
    cache.delete(key);
  }
}

/**
 * Clear all caches (for testing)
 */
export function clearCaches(): void {
  forSaleCache.clear();
  compsCache.clear();
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats(): { forSale: number; comps: number } {
  return {
    forSale: forSaleCache.size,
    comps: compsCache.size,
  };
}
