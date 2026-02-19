import type {
  AuctionMix,
  DiscountConfidence,
  GradedFlag,
  LiquidityBucket,
  MarketDiscountBucket,
  PriceTier,
} from "@/lib/market-discount/types";

export function getPriceTier(priceDollars: number | null): PriceTier {
  const value = priceDollars ?? 0;
  if (value < 50) return "0-50";
  if (value < 150) return "50-150";
  if (value < 300) return "150-300";
  if (value < 600) return "300-600";
  if (value < 1200) return "600-1200";
  return "1200+";
}

export function getLiquidityBucket(soldCount: number): LiquidityBucket {
  if (soldCount <= 2) return "0-2";
  if (soldCount <= 5) return "3-5";
  if (soldCount <= 10) return "6-10";
  return "11+";
}

export function getGradedFlag(grade?: string | null): GradedFlag {
  if (!grade || !grade.trim()) return "unknown";
  const lower = grade.toLowerCase();
  if (lower.includes("raw") || lower.includes("ungraded")) return "raw";
  if (/(psa|bgs|sgc|cgc)\s*\d/.test(lower)) return "graded";
  return "unknown";
}

export function getAuctionMix(auctionCount: number, totalCount: number): AuctionMix | undefined {
  if (totalCount <= 0) return undefined;
  const ratio = auctionCount / totalCount;
  if (ratio >= 0.6) return "mostly_auction";
  if (ratio >= 0.2) return "mixed";
  return "mostly_bin";
}

export function buildBucket(input: {
  listingMedianDollars: number | null;
  soldCount: number;
  grade?: string | null;
  auctionCount?: number;
  listingCount?: number;
}): MarketDiscountBucket {
  const bucket: MarketDiscountBucket = {
    priceTier: getPriceTier(input.listingMedianDollars),
    liquidityBucket: getLiquidityBucket(input.soldCount),
    gradedFlag: getGradedFlag(input.grade),
  };

  if (
    typeof input.auctionCount === "number" &&
    typeof input.listingCount === "number" &&
    input.listingCount > 0
  ) {
    const mix = getAuctionMix(input.auctionCount, input.listingCount);
    if (mix) bucket.auctionMix = mix;
  }

  return bucket;
}

export function confidenceFromFactor(input: {
  soldCount: number;
  listingCount: number;
  outliersRemovedSold: number;
  outliersRemovedListing: number;
}): DiscountConfidence {
  const soldOutlierRate =
    input.soldCount > 0 ? input.outliersRemovedSold / input.soldCount : 1;
  const listingOutlierRate =
    input.listingCount > 0 ? input.outliersRemovedListing / input.listingCount : 1;

  if (
    input.soldCount >= 10 &&
    input.listingCount >= 10 &&
    soldOutlierRate <= 0.2 &&
    listingOutlierRate <= 0.2
  ) {
    return "high";
  }

  if (input.soldCount >= 5 && input.listingCount >= 8) {
    return "medium";
  }

  return "low";
}

export function confidenceFromBucket(input: {
  nCards: number;
  iqrWidth: number | null;
}): DiscountConfidence {
  if (input.nCards >= 20 && input.iqrWidth !== null && input.iqrWidth <= 0.1) {
    return "high";
  }
  if (input.nCards >= 8) {
    return "medium";
  }
  return "low";
}
