import type { ForSaleItem } from "@/lib/ebay/types";
import type { CollectionItem } from "@/types";

export type DiscountConfidence = "low" | "medium" | "high";
export type GradedFlag = "raw" | "graded" | "unknown";
export type LiquidityBucket = "0-2" | "3-5" | "6-10" | "11+";
export type PriceTier =
  | "0-50"
  | "50-150"
  | "150-300"
  | "300-600"
  | "600-1200"
  | "1200+";
export type AuctionMix = "mostly_auction" | "mixed" | "mostly_bin";

export interface MarketDiscountBucket {
  priceTier: PriceTier;
  liquidityBucket: LiquidityBucket;
  gradedFlag: GradedFlag;
  auctionMix?: AuctionMix;
}

export interface MarketSnapshotRecord {
  id: string;
  card_fingerprint: string;
  query_text: string;
  snapshot_type: "active" | "sold";
  observed_at: string;
  prices_cents: number[];
  sample_size: number;
  currency: string;
  meta: Record<string, unknown>;
}

export interface MarketDiscountFactorRecord {
  id: string;
  card_fingerprint: string;
  computed_at: string;
  listing_median_cents: number | null;
  sold_median_cents: number | null;
  listing_count: number | null;
  sold_count: number | null;
  discount_ratio: number | null;
  discount_ratio_clipped: number | null;
  iqr_listing: number | null;
  iqr_sold: number | null;
  outliers_removed_listing: number;
  outliers_removed_sold: number;
  confidence: DiscountConfidence;
  bucket: MarketDiscountBucket;
  notes: string | null;
}

export interface MarketDiscountBucketRecord {
  id: string;
  computed_at: string;
  bucket: MarketDiscountBucket;
  ratio_median: number;
  ratio_p25: number | null;
  ratio_p75: number | null;
  n_cards: number;
  n_samples: number;
  confidence: DiscountConfidence;
}

export interface ExpectedDiscount {
  ratio: number;
  p25: number | null;
  p75: number | null;
  confidence: DiscountConfidence;
  bucket: MarketDiscountBucket;
  source: "bucket" | "fallback_bucket" | "global" | "default";
}

export type CmvMethod = "sold_median" | "listing_adjusted" | "insufficient_data";

export interface MarketCmvComputation {
  method: CmvMethod;
  cmv: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  confidence: DiscountConfidence;
  listingMedian: number | null;
  soldMedian: number | null;
  listingCount: number;
  soldCount: number;
  expectedDiscountRatio: number | null;
  expectedDiscountP25: number | null;
  expectedDiscountP75: number | null;
  expectedDiscountConfidence: DiscountConfidence | null;
  cardFingerprint: string;
  queryText: string;
}

export interface MarketQueryInput {
  player: string;
  year?: string;
  set?: string;
  grade?: string;
  cardNumber?: string;
  parallelType?: string;
  serialNumber?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
  keywords?: string[];
  limit?: number;
}

export interface MarketRefreshInput {
  query: MarketQueryInput;
  cardFingerprint?: string;
  force?: boolean;
  userId?: string | null;
  queryTextOverride?: string;
  activeItemsOverride?: ForSaleItem[];
}

export interface CardMarketQueryInput {
  card: Pick<
    CollectionItem,
    | "player_name"
    | "year"
    | "set_name"
    | "grade"
    | "card_number"
    | "parallel_type"
    | "notes"
  >;
  force?: boolean;
}
