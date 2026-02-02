import type { GradeCmv } from "@/types";

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
  expiresAt: number;
};

const gradeCmvCache = new Map<string, CacheEntry<GradeCmv>>();
const GRADE_CMV_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedGradeCmv(key: string): GradeCmv | null {
  const entry = gradeCmvCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    gradeCmvCache.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheGradeCmv(key: string, data: GradeCmv): void {
  const now = Date.now();
  gradeCmvCache.set(key, {
    data,
    cachedAt: now,
    expiresAt: now + GRADE_CMV_TTL_MS,
  });
}

export function clearGradeCmvCache(): void {
  gradeCmvCache.clear();
}
