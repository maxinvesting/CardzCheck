import { searchEbayDualSignal } from "@/lib/ebay";
import {
  getMarketCmvForCollectionCard,
  type MarketCmvComputation,
} from "@/lib/market-discount";
import type { CollectionItem, CmvConfidence } from "@/types";

const CMV_STALE_DAYS = 7;
const CMV_RETRY_UNAVAILABLE = true;

type CmvResult = {
  estimated_cmv: number | null;
  est_cmv: number | null;
  cmv_confidence: CmvConfidence;
  cmv_last_updated: string;
};

export type DetailedCmvResult = CmvResult & {
  method: MarketCmvComputation["method"];
  range_low: number | null;
  range_high: number | null;
  listing_count: number;
  sold_count: number;
  expected_discount_ratio: number | null;
  card_fingerprint: string;
  query_text: string;
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

function toRoundedCmv(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function mapConfidence(method: MarketCmvComputation["method"], confidence: MarketCmvComputation["confidence"]): CmvConfidence {
  if (method === "insufficient_data") return CMV_CONFIDENCE.unavailable;
  return CMV_CONFIDENCE[confidence] ?? CMV_CONFIDENCE.low;
}

function fromMarketComputation(
  market: MarketCmvComputation,
  timestamp: string
): DetailedCmvResult {
  const value = toRoundedCmv(market.cmv);
  const confidence = mapConfidence(market.method, market.confidence);

  return {
    estimated_cmv: value,
    est_cmv: value,
    cmv_confidence: confidence,
    cmv_last_updated: timestamp,
    method: market.method,
    range_low: toRoundedCmv(market.rangeLow),
    range_high: toRoundedCmv(market.rangeHigh),
    listing_count: market.listingCount,
    sold_count: market.soldCount,
    expected_discount_ratio: market.expectedDiscountRatio,
    card_fingerprint: market.cardFingerprint,
    query_text: market.queryText,
  };
}

async function fallbackFromActiveListings(
  card: CollectionItem,
  timestamp: string
): Promise<DetailedCmvResult> {
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
      cardNumber: card.card_number || undefined,
      parallelType: card.parallel_type || undefined,
      limit: 25,
    });

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
      return {
        estimated_cmv: fallbackCmv,
        est_cmv: fallbackCmv,
        cmv_confidence: CMV_CONFIDENCE.low,
        cmv_last_updated: timestamp,
        method: "listing_adjusted",
        range_low: null,
        range_high: null,
        listing_count: dualResult.forSale.count,
        sold_count: 0,
        expected_discount_ratio: null,
        card_fingerprint: "",
        query_text: dualResult.query,
      };
    }
  } catch (error) {
    console.error("⚠️ Active-listing fallback CMV failed:", error);
  }

  return {
    estimated_cmv: null,
    est_cmv: null,
    cmv_confidence: CMV_CONFIDENCE.unavailable,
    cmv_last_updated: timestamp,
    method: "insufficient_data",
    range_low: null,
    range_high: null,
    listing_count: 0,
    sold_count: 0,
    expected_discount_ratio: null,
    card_fingerprint: "",
    query_text: "",
  };
}

export async function calculateCardCmvDetailed(card: CollectionItem): Promise<DetailedCmvResult> {
  const timestamp = nowIso();

  try {
    const market = await getMarketCmvForCollectionCard({ card });
    return fromMarketComputation(market.cmv, timestamp);
  } catch (error) {
    console.error("⚠️ Market discount CMV failed, using fallback:", error);
    return fallbackFromActiveListings(card, timestamp);
  }
}

export async function calculateCardCmv(card: CollectionItem): Promise<CmvResult> {
  const detailed = await calculateCardCmvDetailed(card);
  return {
    estimated_cmv: detailed.estimated_cmv,
    est_cmv: detailed.est_cmv,
    cmv_confidence: detailed.cmv_confidence,
    cmv_last_updated: detailed.cmv_last_updated,
  };
}
