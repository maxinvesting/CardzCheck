import { GRADING_OPTIONS } from "@/lib/card-data";
import { scrapeEbaySoldListings, searchEbayDualSignal } from "@/lib/ebay";
import { logDebug, redactId } from "@/lib/logging";
import type { CollectionItem, Comp, CmvConfidence, CmvStatus } from "@/types";

const CMV_LOOKBACK_DAYS = 90;
const CMV_STALE_DAYS = 7;
const CMV_FAILED_RETRY_MS = 5 * 60 * 1000;
const CMV_COMPUTE_TIMEOUT_MS = 12_000;

const CMV_ERROR = {
  timeout: "timeout",
  noComps: "no_comps",
  compute: "compute_error",
} as const;

type CmvErrorCode = (typeof CMV_ERROR)[keyof typeof CMV_ERROR];

export type CmvResult = {
  estimated_cmv: number | null;
  est_cmv: number | null;
  cmv_confidence: CmvConfidence;
  cmv_last_updated: string;
};

export type CmvPersistedResult = CmvResult & {
  cmv_status: CmvStatus;
  cmv_value: number | null;
  cmv_error: string | null;
  cmv_updated_at: string;
};

export type CmvComputeMeta = {
  source: "exact" | "adjacent" | "proxy" | "fallback" | "none";
  exactCompsCount: number;
  adjacentCompsCount: number;
  proxyCompsCount: number;
  fallbackForSaleCount: number;
  /** Best image URL from eBay listings (for backfilling cards with no image). */
  bestImageUrl?: string | null;
};

export type CmvComputationWithStatus = {
  payload: CmvPersistedResult;
  meta: CmvComputeMeta;
  durationMs: number;
  errorCode: CmvErrorCode | null;
};

type GradeInfo = {
  company: string;
  value: number;
};

const CMV_CONFIDENCE: Record<string, CmvConfidence> = {
  high: "high",
  medium: "medium",
  low: "low",
  unavailable: "unavailable",
};

const nowIso = (): string => new Date().toISOString();

class CmvTimeoutError extends Error {
  constructor() {
    super("CMV computation timed out");
    this.name = "CmvTimeoutError";
  }
}

const isTimeoutError = (error: unknown): boolean => error instanceof CmvTimeoutError;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new CmvTimeoutError()), timeoutMs);

      promise
        .then((value) => {
          resolve(value);
        })
        .catch((error) => {
          reject(error);
        });
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const coercePositiveNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
};

const toStoredError = (errorCode: CmvErrorCode): string | null => {
  if (process.env.NODE_ENV === "development") {
    return errorCode;
  }
  return null;
};

export const buildPendingCmvUpdate = (timestamp = nowIso()): CmvPersistedResult => ({
  estimated_cmv: null,
  est_cmv: null,
  cmv_confidence: CMV_CONFIDENCE.unavailable,
  cmv_last_updated: timestamp,
  cmv_status: "pending",
  cmv_value: null,
  cmv_error: null,
  cmv_updated_at: timestamp,
});

export const buildFailedCmvUpdate = (
  errorCode: CmvErrorCode,
  timestamp = nowIso()
): CmvPersistedResult => ({
  estimated_cmv: null,
  est_cmv: null,
  cmv_confidence: CMV_CONFIDENCE.unavailable,
  cmv_last_updated: timestamp,
  cmv_status: "failed",
  cmv_value: null,
  cmv_error: toStoredError(errorCode),
  cmv_updated_at: timestamp,
});

const buildReadyCmvUpdate = (
  result: CmvResult,
  cmvValue: number,
  timestamp = nowIso()
): CmvPersistedResult => ({
  estimated_cmv: cmvValue,
  est_cmv: cmvValue,
  cmv_confidence: result.cmv_confidence,
  cmv_last_updated: result.cmv_last_updated || timestamp,
  cmv_status: "ready",
  cmv_value: cmvValue,
  cmv_error: null,
  cmv_updated_at: timestamp,
});

export const toCmvPayloadFromResult = (
  result: CmvResult,
  timestamp = nowIso()
): { payload: CmvPersistedResult; errorCode: CmvErrorCode | null } => {
  const cmvValue = coercePositiveNumber(result.estimated_cmv ?? result.est_cmv);
  if (cmvValue !== null) {
    return {
      payload: buildReadyCmvUpdate(result, cmvValue, timestamp),
      errorCode: null,
    };
  }
  return {
    payload: buildFailedCmvUpdate(CMV_ERROR.noComps, timestamp),
    errorCode: CMV_ERROR.noComps,
  };
};

export function isCmvStale(item: CollectionItem, nowMs = Date.now()): boolean {
  const status = item.cmv_status ?? null;

  // Check whether a CMV value actually exists in ANY of the value columns.
  const hasCmvValue =
    (typeof item.cmv_value === "number" && Number.isFinite(item.cmv_value) && item.cmv_value > 0) ||
    (typeof item.estimated_cmv === "number" && Number.isFinite(item.estimated_cmv) && item.estimated_cmv > 0) ||
    (typeof (item as any).est_cmv === "number" && Number.isFinite((item as any).est_cmv) && (item as any).est_cmv > 0);

  // If status is explicitly "ready" AND a value exists, only refresh after stale window.
  if (status === "ready" && hasCmvValue) {
    const lastUpdatedRaw = item.cmv_updated_at ?? item.cmv_last_updated;
    if (!lastUpdatedRaw) return true;
    const lastUpdated = new Date(lastUpdatedRaw).getTime();
    if (!Number.isFinite(lastUpdated)) return true;
    const ageMs = nowMs - lastUpdated;
    return ageMs > CMV_STALE_DAYS * 24 * 60 * 60 * 1000;
  }

  // If no value exists yet — regardless of status or timestamps — it's stale.
  if (!hasCmvValue) {
    return true;
  }

  // Pending always needs computation.
  if (status === "pending") {
    return true;
  }

  // Failed: retry after a short cooldown (5 min).
  if (status === "failed") {
    const lastUpdatedRaw = item.cmv_updated_at ?? item.cmv_last_updated;
    if (!lastUpdatedRaw) return true;
    const lastUpdated = new Date(lastUpdatedRaw).getTime();
    if (!Number.isFinite(lastUpdated)) return true;
    const ageMs = nowMs - lastUpdated;
    return ageMs > CMV_FAILED_RETRY_MS;
  }

  // Legacy rows without explicit status but with a value — use standard stale window.
  const lastUpdatedRaw = item.cmv_updated_at ?? item.cmv_last_updated;
  if (!lastUpdatedRaw) {
    return true;
  }

  const lastUpdated = new Date(lastUpdatedRaw).getTime();
  if (!Number.isFinite(lastUpdated)) {
    return true;
  }

  const ageMs = nowMs - lastUpdated;

  if (item.cmv_confidence === CMV_CONFIDENCE.unavailable) {
    return ageMs > CMV_FAILED_RETRY_MS;
  }

  return ageMs > CMV_STALE_DAYS * 24 * 60 * 60 * 1000;
}

function filterRecentComps(comps: Comp[], days: number = CMV_LOOKBACK_DAYS): Comp[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return comps.filter((comp) => {
    const ts = new Date(comp.date).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function weightedMedian(values: number[], weights: number[]): number | null {
  if (values.length === 0 || values.length !== weights.length) return null;
  const pairs = values
    .map((value, index) => ({ value, weight: weights[index] }))
    .sort((a, b) => a.value - b.value);
  const totalWeight = pairs.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  let cumulative = 0;
  for (const pair of pairs) {
    cumulative += pair.weight;
    if (cumulative >= totalWeight / 2) {
      return pair.value;
    }
  }
  return pairs[pairs.length - 1]?.value ?? null;
}

function parseGradeInfo(grade: string | null): GradeInfo | null {
  if (!grade) return null;
  const normalized = grade.trim();
  if (!normalized || normalized.toLowerCase().includes("raw")) {
    return null;
  }
  const match = normalized.match(/^(PSA|BGS|SGC|CGC)\s+([\d.]+)/i);
  if (!match) return null;
  const company = match[1].toUpperCase();
  const value = parseFloat(match[2]);
  if (!Number.isFinite(value)) return null;
  return { company, value };
}

function getAdjacentGrades(grade: string | null): string[] {
  const info = parseGradeInfo(grade);
  if (!info) return [];
  const options = GRADING_OPTIONS.map((option) => option.value);
  const companyGrades = options.filter((value) => value.startsWith(info.company));
  const parsed = companyGrades
    .map((value) => {
      const num = parseFloat(value.replace(info.company, "").trim());
      return Number.isFinite(num) ? { value, num } : null;
    })
    .filter((value): value is { value: string; num: number } => value !== null)
    .sort((a, b) => a.num - b.num);

  return parsed
    .filter((entry) => entry.value !== grade && Math.abs(entry.num - info.value) <= 1)
    .map((entry) => entry.value);
}

function adjustPriceForGrade(
  price: number,
  compGrade: GradeInfo,
  targetGrade: GradeInfo
): { adjusted: number; weight: number } {
  const diff = targetGrade.value - compGrade.value;
  const adjustment = 1 + diff * 0.1;
  const adjusted = Math.max(price * adjustment, 0);
  const weight = 1 / (1 + Math.abs(diff));
  return { adjusted, weight };
}

function rarityAdjustment(notes?: string | null): number {
  if (!notes) return 1;
  const lower = notes.toLowerCase();
  if (lower.includes("1/1")) return 2;
  const serialMatch = lower.match(/\/(\d{1,4})/);
  if (!serialMatch) return 1;
  const serial = parseInt(serialMatch[1], 10);
  if (!Number.isFinite(serial)) return 1;
  if (serial <= 10) return 1.5;
  if (serial <= 25) return 1.3;
  if (serial <= 50) return 1.2;
  if (serial <= 99) return 1.1;
  if (serial <= 199) return 1.05;
  return 1;
}

async function fetchCompsForCard(
  card: CollectionItem,
  overrides: Partial<{ grade: string | null }> = {}
): Promise<Comp[]> {
  const hasGradeOverride = Object.prototype.hasOwnProperty.call(overrides, "grade");
  const rawGrade = hasGradeOverride ? overrides.grade : card.grade;
  const grade =
    rawGrade && typeof rawGrade === "string" && /raw|ungraded/i.test(rawGrade)
      ? undefined
      : rawGrade || undefined;

  const parallelFromNotes = (() => {
    if (!card.notes) return undefined;
    const match = card.notes.match(/Parallel:\s*([^|]+)/i);
    if (!match) return undefined;
    const cleaned = match[1].replace(/\/\d{1,4}/g, "").trim();
    return cleaned || undefined;
  })();

  const insertFromNotes = (() => {
    if (!card.notes) return undefined;
    const match =
      card.notes.match(/Insert:\s*([^|]+)/i) ||
      card.notes.match(/\[INSERT:([^\]]+)\]/i);
    if (!match) return undefined;
    const cleaned = match[1].trim();
    return cleaned || undefined;
  })();

  return scrapeEbaySoldListings({
    player: card.player_name,
    year: card.year || undefined,
    set: card.set_name || undefined,
    grade,
    parallelType: parallelFromNotes,
    keywords: insertFromNotes ? [insertFromNotes] : undefined,
  });
}

const emptyMeta = (): CmvComputeMeta => ({
  source: "none",
  exactCompsCount: 0,
  adjacentCompsCount: 0,
  proxyCompsCount: 0,
  fallbackForSaleCount: 0,
});

async function calculateCardCmvDetailed(
  card: CollectionItem
): Promise<{ result: CmvResult; meta: CmvComputeMeta }> {
  const lastUpdated = nowIso();
  const meta = emptyMeta();

  const exactComps = filterRecentComps(await fetchCompsForCard(card));
  meta.exactCompsCount = exactComps.length;
  // Capture best image URL from comps for image-less cards
  const firstImageComp = exactComps.find((c) => c.image);
  if (firstImageComp?.image) {
    meta.bestImageUrl = firstImageComp.image;
  }
  const exactPrices = exactComps.map((comp) => comp.price);
  const exactMedian = median(exactPrices);
  if (exactMedian !== null && exactComps.length >= 3) {
    const val = Math.round(exactMedian * 100) / 100;
    meta.source = "exact";
    return {
      result: {
        estimated_cmv: val,
        est_cmv: val,
        cmv_confidence: CMV_CONFIDENCE.high,
        cmv_last_updated: lastUpdated,
      },
      meta,
    };
  }

  const targetGrade = parseGradeInfo(card.grade);
  if (targetGrade) {
    const adjacentGrades = getAdjacentGrades(card.grade);
    const adjustedPrices: number[] = [];
    const adjustedWeights: number[] = [];
    for (const adj of adjacentGrades) {
      const adjInfo = parseGradeInfo(adj);
      if (!adjInfo) continue;
      const comps = filterRecentComps(await fetchCompsForCard(card, { grade: adj }));
      meta.adjacentCompsCount += comps.length;
      for (const comp of comps) {
        const { adjusted, weight } = adjustPriceForGrade(comp.price, adjInfo, targetGrade);
        adjustedPrices.push(adjusted);
        adjustedWeights.push(weight);
      }
    }
    if (adjustedPrices.length >= 3) {
      const weighted = weightedMedian(adjustedPrices, adjustedWeights);
      if (weighted !== null) {
        const val = Math.round(weighted * 100) / 100;
        meta.source = "adjacent";
        return {
          result: {
            estimated_cmv: val,
            est_cmv: val,
            cmv_confidence: CMV_CONFIDENCE.medium,
            cmv_last_updated: lastUpdated,
          },
          meta,
        };
      }
    }
  }

  const proxyComps = filterRecentComps(await fetchCompsForCard({ ...card, grade: null }));
  meta.proxyCompsCount = proxyComps.length;
  if (proxyComps.length >= 3) {
    const proxyMedian = median(proxyComps.map((comp) => comp.price));
    if (proxyMedian !== null) {
      const adjusted = proxyMedian * rarityAdjustment(card.notes);
      const val = Math.round(adjusted * 100) / 100;
      meta.source = "proxy";
      return {
        result: {
          estimated_cmv: val,
          est_cmv: val,
          cmv_confidence: CMV_CONFIDENCE.low,
          cmv_last_updated: lastUpdated,
        },
        meta,
      };
    }
  }

  if (exactMedian !== null && exactComps.length > 0) {
    const val = Math.round(exactMedian * 100) / 100;
    meta.source = "exact";
    return {
      result: {
        estimated_cmv: val,
        est_cmv: val,
        cmv_confidence: CMV_CONFIDENCE.low,
        cmv_last_updated: lastUpdated,
      },
      meta,
    };
  }

  // Fallback: use Browse API (active listings) when sold comps unavailable.
  try {
    const rawGrade = card.grade;
    const grade =
      rawGrade && typeof rawGrade === "string" && /raw|ungraded/i.test(rawGrade)
        ? undefined
        : rawGrade || undefined;

    const dualResult = await searchEbayDualSignal({
      player: card.player_name,
      year: card.year || undefined,
      set: card.set_name || undefined,
      grade,
    });

    meta.fallbackForSaleCount = dualResult.forSale.count;

    // Capture image from fallback listings if not already set
    if (!meta.bestImageUrl && dualResult.forSale.items.length > 0) {
      const imgItem = dualResult.forSale.items.find((i) => i.image);
      if (imgItem?.image) {
        meta.bestImageUrl = imgItem.image;
      }
    }

    let fallbackCmv: number | null = null;

    if (dualResult.estimatedSaleRange.pricingAvailable) {
      const { low, high } = dualResult.estimatedSaleRange.estimatedSaleRange;
      const mid = Math.round(((low + high) / 2) * 100) / 100;
      if (Number.isFinite(mid) && mid > 0) {
        fallbackCmv = mid;
      }
    }

    if (fallbackCmv === null && dualResult.forSale.median > 0) {
      fallbackCmv = Math.round(dualResult.forSale.median * 100) / 100;
    }

    if (fallbackCmv !== null) {
      meta.source = "fallback";
      return {
        result: {
          estimated_cmv: fallbackCmv,
          est_cmv: fallbackCmv,
          cmv_confidence: CMV_CONFIDENCE.low,
          cmv_last_updated: lastUpdated,
        },
        meta,
      };
    }
  } catch (error) {
    logDebug("cmv_compute_fallback_error", {
      cardId: redactId(card.id),
      player: card.player_name,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    result: {
      estimated_cmv: null,
      est_cmv: null,
      cmv_confidence: CMV_CONFIDENCE.unavailable,
      cmv_last_updated: lastUpdated,
    },
    meta,
  };
}

export async function calculateCardCmv(card: CollectionItem): Promise<CmvResult> {
  const { result } = await calculateCardCmvDetailed(card);
  return result;
}

export async function calculateCardCmvWithStatus(
  card: CollectionItem,
  options?: { timeoutMs?: number }
): Promise<CmvComputationWithStatus> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? CMV_COMPUTE_TIMEOUT_MS;

  logDebug("cmv_compute_start", {
    cardId: redactId(card.id),
    player: card.player_name,
    timeoutMs,
  });

  let payload = buildPendingCmvUpdate();
  let meta = emptyMeta();
  let errorCode: CmvErrorCode | null = null;

  try {
    const computed = await withTimeout(calculateCardCmvDetailed(card), timeoutMs);
    meta = computed.meta;
    const resolved = toCmvPayloadFromResult(computed.result);
    payload = resolved.payload;
    errorCode = resolved.errorCode;
  } catch (error) {
    errorCode = isTimeoutError(error) ? CMV_ERROR.timeout : CMV_ERROR.compute;
    payload = buildFailedCmvUpdate(errorCode);
  }

  const durationMs = Date.now() - startedAt;

  logDebug("cmv_compute_end", {
    cardId: redactId(card.id),
    player: card.player_name,
    durationMs,
    cmvStatus: payload.cmv_status,
    cmvValue: payload.cmv_value,
    errorCode,
    resultCounts: {
      source: meta.source,
      exactComps: meta.exactCompsCount,
      adjacentComps: meta.adjacentCompsCount,
      proxyComps: meta.proxyCompsCount,
      fallbackForSale: meta.fallbackForSaleCount,
    },
  });

  return {
    payload,
    meta,
    durationMs,
    errorCode,
  };
}
