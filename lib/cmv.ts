import { GRADING_OPTIONS } from "@/lib/card-data";
import { scrapeEbaySoldListings, searchEbayDualSignal } from "@/lib/ebay";
import type { CollectionItem, Comp, CmvConfidence } from "@/types";

const CMV_LOOKBACK_DAYS = 90;
const CMV_STALE_DAYS = 7;
const CMV_RETRY_UNAVAILABLE = true;

type CmvResult = {
  estimated_cmv: number | null;
  est_cmv: number | null;
  cmv_confidence: CmvConfidence;
  cmv_last_updated: string;
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

export function isCmvStale(item: CollectionItem): boolean {
  if (!item.cmv_last_updated || !item.cmv_confidence) {
    return true;
  }
  if (CMV_RETRY_UNAVAILABLE && item.cmv_confidence === CMV_CONFIDENCE.unavailable) {
    return true;
  }
  const lastUpdated = new Date(item.cmv_last_updated).getTime();
  const ageMs = Date.now() - lastUpdated;
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

export async function calculateCardCmv(card: CollectionItem): Promise<CmvResult> {
  const lastUpdated = nowIso();

  const exactComps = filterRecentComps(await fetchCompsForCard(card));
  const exactPrices = exactComps.map((comp) => comp.price);
  const exactMedian = median(exactPrices);
  if (exactMedian !== null && exactComps.length >= 3) {
    const val = Math.round(exactMedian * 100) / 100;
    return {
      estimated_cmv: val,
      est_cmv: val,
      cmv_confidence: CMV_CONFIDENCE.high,
      cmv_last_updated: lastUpdated,
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
        return {
          estimated_cmv: val,
          est_cmv: val,
          cmv_confidence: CMV_CONFIDENCE.medium,
          cmv_last_updated: lastUpdated,
        };
      }
    }
  }

  const proxyComps = filterRecentComps(
    await fetchCompsForCard({ ...card, grade: null })
  );
  if (proxyComps.length >= 3) {
    const proxyMedian = median(proxyComps.map((comp) => comp.price));
    if (proxyMedian !== null) {
      const adjusted = proxyMedian * rarityAdjustment(card.notes);
      const val = Math.round(adjusted * 100) / 100;
      return {
        estimated_cmv: val,
        est_cmv: val,
        cmv_confidence: CMV_CONFIDENCE.low,
        cmv_last_updated: lastUpdated,
      };
    }
  }

  if (exactMedian !== null && exactComps.length > 0) {
    const val = Math.round(exactMedian * 100) / 100;
    return {
      estimated_cmv: val,
      est_cmv: val,
      cmv_confidence: CMV_CONFIDENCE.low,
      cmv_last_updated: lastUpdated,
    };
  }

  // ── Fallback: use Browse API (active listings) when sold comps unavailable ──
  // This mirrors the Comps page engine (searchEbayDualSignal) so Collection
  // shows the same CMV that the user sees when searching on the Comps tab.
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

    // Mirror search API logic: estimated sale range midpoint → forSale median
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
      console.log(`📊 CMV from active listings fallback: $${fallbackCmv} for ${card.player_name}`);
      return {
        estimated_cmv: fallbackCmv,
        est_cmv: fallbackCmv,
        cmv_confidence: CMV_CONFIDENCE.low,
        cmv_last_updated: lastUpdated,
      };
    }
  } catch (e) {
    console.error("⚠️ Dual-signal CMV fallback failed:", e);
  }

  return {
    estimated_cmv: null,
    est_cmv: null,
    cmv_confidence: CMV_CONFIDENCE.unavailable,
    cmv_last_updated: lastUpdated,
  };
}
