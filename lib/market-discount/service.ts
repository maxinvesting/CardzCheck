import { createServiceClient } from "@/lib/supabase/server";
import { searchEbayDualSignal, type EbaySearchParams } from "@/lib/ebay";
import type { ForSaleItem } from "@/lib/ebay/types";
import { scrapeEbaySoldListings } from "@/lib/ebay/scraper";
import { buildBucket, confidenceFromFactor, confidenceFromBucket } from "@/lib/market-discount/buckets";
import { buildMarketFingerprint, buildQueryText } from "@/lib/market-discount/fingerprint";
import { median, quantile, robustStats } from "@/lib/market-discount/robust-stats";
import type {
  CardMarketQueryInput,
  DiscountConfidence,
  ExpectedDiscount,
  MarketCmvComputation,
  MarketDiscountBucket,
  MarketDiscountBucketRecord,
  MarketDiscountFactorRecord,
  MarketQueryInput,
  MarketRefreshInput,
  MarketSnapshotRecord,
} from "@/lib/market-discount/types";

const MARKET_STALE_MS = 24 * 60 * 60 * 1000;
const SOLD_MIN_COUNT = 8;
const LISTING_MIN_COUNT = 8;
const DEFAULT_DISCOUNT_RATIO = 0.86;
const DEFAULT_DISCOUNT_P25 = 0.76;
const DEFAULT_DISCOUNT_P75 = 0.94;
const RATIO_CLIP_MIN = 0.4;
const RATIO_CLIP_MAX = 1.05;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function roundToCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / 100) * 100) / 100;
}

function clampRatio(value: number): number {
  return Math.max(RATIO_CLIP_MIN, Math.min(RATIO_CLIP_MAX, value));
}

function normalizeGrade(grade?: string | null): string | undefined {
  if (!grade) return undefined;
  const trimmed = grade.trim();
  if (!trimmed || /raw|ungraded/i.test(trimmed)) return undefined;
  return trimmed;
}

function extractNotesValue(notes: string | null | undefined, pattern: RegExp): string | undefined {
  if (!notes) return undefined;
  const match = notes.match(pattern);
  if (!match?.[1]) return undefined;
  const cleaned = match[1].replace(/\/\d{1,4}/g, "").trim();
  return cleaned || undefined;
}

function isAuctionListing(item: ForSaleItem): boolean {
  const text = `${item.condition ?? ""} ${item.title ?? ""}`.toLowerCase();
  return text.includes("auction") || text.includes("bid");
}

function listingTotalPriceCents(item: ForSaleItem): number | null {
  const base = isFinitePositive(item.price) ? item.price : null;
  if (base === null) return null;
  const shipping = isFinitePositive(item.shipping) ? item.shipping : 0;
  return roundToCents(base + shipping);
}

function toSnapshotRecord(row: any): MarketSnapshotRecord {
  return {
    id: row.id,
    card_fingerprint: row.card_fingerprint,
    query_text: row.query_text,
    snapshot_type: row.snapshot_type,
    observed_at: row.observed_at,
    prices_cents: Array.isArray(row.prices_cents) ? row.prices_cents : [],
    sample_size: typeof row.sample_size === "number" ? row.sample_size : 0,
    currency: row.currency ?? "USD",
    meta: typeof row.meta === "object" && row.meta ? row.meta : {},
  };
}

function normalizeBucket(bucket: unknown): MarketDiscountBucket {
  const raw = typeof bucket === "object" && bucket ? (bucket as Record<string, unknown>) : {};
  const normalized: MarketDiscountBucket = {
    priceTier: (raw.priceTier as MarketDiscountBucket["priceTier"]) ?? "0-50",
    liquidityBucket: (raw.liquidityBucket as MarketDiscountBucket["liquidityBucket"]) ?? "0-2",
    gradedFlag: (raw.gradedFlag as MarketDiscountBucket["gradedFlag"]) ?? "unknown",
  };
  if (typeof raw.auctionMix === "string") {
    normalized.auctionMix = raw.auctionMix as MarketDiscountBucket["auctionMix"];
  }
  return normalized;
}

function toFactorRecord(row: any): MarketDiscountFactorRecord {
  return {
    id: row.id,
    card_fingerprint: row.card_fingerprint,
    computed_at: row.computed_at,
    listing_median_cents: toNullableNumber(row.listing_median_cents),
    sold_median_cents: toNullableNumber(row.sold_median_cents),
    listing_count: toNullableNumber(row.listing_count),
    sold_count: toNullableNumber(row.sold_count),
    discount_ratio: toNullableNumber(row.discount_ratio),
    discount_ratio_clipped: toNullableNumber(row.discount_ratio_clipped),
    iqr_listing: toNullableNumber(row.iqr_listing),
    iqr_sold: toNullableNumber(row.iqr_sold),
    outliers_removed_listing:
      typeof row.outliers_removed_listing === "number" ? row.outliers_removed_listing : 0,
    outliers_removed_sold:
      typeof row.outliers_removed_sold === "number" ? row.outliers_removed_sold : 0,
    confidence: (row.confidence as DiscountConfidence) ?? "low",
    bucket: normalizeBucket(row.bucket),
    notes: typeof row.notes === "string" ? row.notes : null,
  };
}

function toBucketRecord(row: any): MarketDiscountBucketRecord {
  return {
    id: row.id,
    computed_at: row.computed_at,
    bucket: normalizeBucket(row.bucket),
    ratio_median: toNullableNumber(row.ratio_median) ?? DEFAULT_DISCOUNT_RATIO,
    ratio_p25: toNullableNumber(row.ratio_p25),
    ratio_p75: toNullableNumber(row.ratio_p75),
    n_cards: toNullableNumber(row.n_cards) ?? 0,
    n_samples: toNullableNumber(row.n_samples) ?? 0,
    confidence: (row.confidence as DiscountConfidence) ?? "low",
  };
}

function bucketKey(bucket: MarketDiscountBucket): string {
  const stable: Record<string, string> = {
    priceTier: bucket.priceTier,
    liquidityBucket: bucket.liquidityBucket,
    gradedFlag: bucket.gradedFlag,
  };
  if (bucket.auctionMix) {
    stable.auctionMix = bucket.auctionMix;
  }
  return JSON.stringify(stable);
}

function parseBucketKey(key: string): MarketDiscountBucket {
  return normalizeBucket(JSON.parse(key));
}

function isFresh(isoDate: string | null | undefined, maxAgeMs: number = MARKET_STALE_MS): boolean {
  if (!isoDate) return false;
  const ts = new Date(isoDate).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

function lowerConfidence(a: DiscountConfidence, b: DiscountConfidence): DiscountConfidence {
  const rank: Record<DiscountConfidence, number> = { low: 1, medium: 2, high: 3 };
  return rank[a] <= rank[b] ? a : b;
}

function ensureArrayOfNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
}

function factorToCmv(
  factor: MarketDiscountFactorRecord,
  expectedDiscount: ExpectedDiscount | null,
  queryText: string
): MarketCmvComputation {
  const listingCount = factor.listing_count ?? 0;
  const soldCount = factor.sold_count ?? 0;
  const listingMedian = fromCents(factor.listing_median_cents);
  const soldMedian = fromCents(factor.sold_median_cents);

  if (soldMedian !== null && soldCount >= SOLD_MIN_COUNT) {
    return {
      method: "sold_median",
      cmv: soldMedian,
      rangeLow: soldMedian,
      rangeHigh: soldMedian,
      confidence: factor.confidence,
      listingMedian,
      soldMedian,
      listingCount,
      soldCount,
      expectedDiscountRatio: expectedDiscount?.ratio ?? null,
      expectedDiscountP25: expectedDiscount?.p25 ?? null,
      expectedDiscountP75: expectedDiscount?.p75 ?? null,
      expectedDiscountConfidence: expectedDiscount?.confidence ?? null,
      cardFingerprint: factor.card_fingerprint,
      queryText,
    };
  }

  if (listingMedian !== null && listingCount >= LISTING_MIN_COUNT) {
    const ratio = expectedDiscount?.ratio ?? factor.discount_ratio_clipped ?? DEFAULT_DISCOUNT_RATIO;
    const cmv = Math.round(listingMedian * ratio * 100) / 100;
    const p25 = expectedDiscount?.p25 ?? null;
    const p75 = expectedDiscount?.p75 ?? null;
    const rangeLow = p25 !== null ? Math.round(listingMedian * p25 * 100) / 100 : null;
    const rangeHigh = p75 !== null ? Math.round(listingMedian * p75 * 100) / 100 : null;
    const confidence = expectedDiscount
      ? lowerConfidence(factor.confidence, expectedDiscount.confidence)
      : factor.confidence;

    return {
      method: "listing_adjusted",
      cmv,
      rangeLow,
      rangeHigh,
      confidence,
      listingMedian,
      soldMedian,
      listingCount,
      soldCount,
      expectedDiscountRatio: ratio,
      expectedDiscountP25: p25,
      expectedDiscountP75: p75,
      expectedDiscountConfidence: expectedDiscount?.confidence ?? null,
      cardFingerprint: factor.card_fingerprint,
      queryText,
    };
  }

  return {
    method: "insufficient_data",
    cmv: null,
    rangeLow: null,
    rangeHigh: null,
    confidence: "low",
    listingMedian,
    soldMedian,
    listingCount,
    soldCount,
    expectedDiscountRatio: expectedDiscount?.ratio ?? null,
    expectedDiscountP25: expectedDiscount?.p25 ?? null,
    expectedDiscountP75: expectedDiscount?.p75 ?? null,
    expectedDiscountConfidence: expectedDiscount?.confidence ?? null,
    cardFingerprint: factor.card_fingerprint,
    queryText,
  };
}

function buildEphemeralExpectedDiscount(bucket: MarketDiscountBucket, ratio: number | null): ExpectedDiscount {
  const safeRatio = ratio ?? DEFAULT_DISCOUNT_RATIO;
  const p25 = Math.max(RATIO_CLIP_MIN, safeRatio - 0.08);
  const p75 = Math.min(RATIO_CLIP_MAX, safeRatio + 0.08);

  return {
    ratio: safeRatio,
    p25,
    p75,
    confidence: "low",
    bucket,
    source: "default",
  };
}

async function computeWithoutPersistence(input: MarketRefreshInput): Promise<{
  cmv: MarketCmvComputation;
  factor: MarketDiscountFactorRecord | null;
  expectedDiscount: ExpectedDiscount | null;
  activeSnapshot: MarketSnapshotRecord | null;
  soldSnapshot: MarketSnapshotRecord | null;
}> {
  const query = { ...input.query, limit: input.query.limit ?? 25 };
  const ebayParams = buildEbayParams(query);
  const queryText = input.queryTextOverride ?? buildQueryText(query);
  const cardFingerprint = input.cardFingerprint ?? buildMarketFingerprint(query);

  const activeItems =
    input.activeItemsOverride ?? (await searchEbayDualSignal(ebayParams)).forSale.items;
  const soldData = await scrapeEbaySoldListings(ebayParams);

  const activePricesCents = activeItems
    .map((item) => listingTotalPriceCents(item))
    .filter((value): value is number => typeof value === "number" && value > 0);

  const soldPricesCents = (soldData.items ?? [])
    .map((item) => (isFinitePositive(item.price) ? roundToCents(item.price) : null))
    .filter((value): value is number => value !== null);

  const auctionCount = activeItems.filter((item) => isAuctionListing(item)).length;
  const payload = computeFactorFromSnapshots({
    cardFingerprint,
    listingPricesCents: activePricesCents,
    soldPricesCents,
    grade: query.grade,
    auctionCount,
    listingRawCount: activeItems.length,
    soldRawCount: soldData.items?.length ?? 0,
  });

  const factor: MarketDiscountFactorRecord = {
    id: "ephemeral",
    computed_at: new Date().toISOString(),
    ...payload,
  };
  const expectedDiscount = buildEphemeralExpectedDiscount(
    factor.bucket,
    factor.discount_ratio_clipped
  );
  const cmv = factorToCmv(factor, expectedDiscount, queryText);

  return {
    cmv,
    factor,
    expectedDiscount,
    activeSnapshot: null,
    soldSnapshot: null,
  };
}

async function fetchLatestSnapshot(
  cardFingerprint: string,
  snapshotType: "active" | "sold"
): Promise<MarketSnapshotRecord | null> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("market_price_snapshots")
    .select("*")
    .eq("card_fingerprint", cardFingerprint)
    .eq("snapshot_type", snapshotType)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch market snapshot:", error.message);
    return null;
  }

  return data ? toSnapshotRecord(data) : null;
}

async function fetchLatestFactor(cardFingerprint: string): Promise<MarketDiscountFactorRecord | null> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("market_discount_factors")
    .select("*")
    .eq("card_fingerprint", cardFingerprint)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch market factor:", error.message);
    return null;
  }

  return data ? toFactorRecord(data) : null;
}

async function insertSnapshot(input: {
  cardFingerprint: string;
  queryText: string;
  snapshotType: "active" | "sold";
  pricesCents: number[];
  userId?: string | null;
  meta: Record<string, unknown>;
}): Promise<MarketSnapshotRecord | null> {
  const service = await createServiceClient();
  const now = new Date().toISOString();
  const payload = {
    user_id: input.userId ?? null,
    card_fingerprint: input.cardFingerprint,
    query_text: input.queryText,
    source: "ebay",
    snapshot_type: input.snapshotType,
    observed_at: now,
    prices_cents: input.pricesCents,
    sample_size: input.pricesCents.length,
    currency: "USD",
    meta: input.meta,
  };

  const { data, error } = await service
    .from("market_price_snapshots")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to insert market snapshot:", error.message);
    return null;
  }

  return toSnapshotRecord(data);
}

async function insertFactor(input: Omit<MarketDiscountFactorRecord, "id" | "computed_at">): Promise<MarketDiscountFactorRecord | null> {
  const service = await createServiceClient();
  const payload = {
    card_fingerprint: input.card_fingerprint,
    listing_median_cents: input.listing_median_cents,
    sold_median_cents: input.sold_median_cents,
    listing_count: input.listing_count,
    sold_count: input.sold_count,
    discount_ratio: input.discount_ratio,
    discount_ratio_clipped: input.discount_ratio_clipped,
    iqr_listing: input.iqr_listing,
    iqr_sold: input.iqr_sold,
    outliers_removed_listing: input.outliers_removed_listing,
    outliers_removed_sold: input.outliers_removed_sold,
    confidence: input.confidence,
    bucket: input.bucket,
    notes: input.notes,
  };

  const { data, error } = await service
    .from("market_discount_factors")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error("Failed to insert market factor:", error.message);
    return null;
  }

  return toFactorRecord(data);
}

function buildEbayParams(query: MarketQueryInput): EbaySearchParams {
  return {
    player: query.player,
    year: query.year,
    set: query.set,
    grade: query.grade,
    cardNumber: query.cardNumber,
    parallelType: query.parallelType,
    serialNumber: query.serialNumber,
    variation: query.variation,
    autograph: query.autograph,
    relic: query.relic,
    keywords: query.keywords,
    limit: query.limit,
  };
}

function computeFactorFromSnapshots(input: {
  cardFingerprint: string;
  listingPricesCents: number[];
  soldPricesCents: number[];
  grade?: string;
  auctionCount: number;
  listingRawCount: number;
  soldRawCount: number;
}): Omit<MarketDiscountFactorRecord, "id" | "computed_at"> {
  const listingStats = robustStats(input.listingPricesCents);
  const soldStats = robustStats(input.soldPricesCents);

  const listingMedian = listingStats.medianAfterTrim;
  const soldMedian = soldStats.medianAfterTrim;

  const ratio =
    listingMedian !== null && soldMedian !== null && listingMedian > 0
      ? soldMedian / listingMedian
      : null;

  const ratioClipped = typeof ratio === "number" ? clampRatio(ratio) : null;

  const listingMedianDollars =
    typeof listingMedian === "number" ? Math.max(0, listingMedian / 100) : null;

  const bucket = buildBucket({
    listingMedianDollars,
    soldCount: soldStats.cleanedCount,
    grade: input.grade,
    auctionCount: input.auctionCount,
    listingCount: input.listingRawCount,
  });

  const confidence = confidenceFromFactor({
    soldCount: soldStats.cleanedCount,
    listingCount: listingStats.cleanedCount,
    outliersRemovedSold: soldStats.outliersRemoved,
    outliersRemovedListing: listingStats.outliersRemoved,
  });

  const notes: string[] = [];
  if (input.soldRawCount > 0) {
    notes.push("sold prices may include unknown accepted best offers");
  }

  return {
    card_fingerprint: input.cardFingerprint,
    listing_median_cents: listingMedian !== null ? Math.round(listingMedian) : null,
    sold_median_cents: soldMedian !== null ? Math.round(soldMedian) : null,
    listing_count: listingStats.cleanedCount,
    sold_count: soldStats.cleanedCount,
    discount_ratio: ratio,
    discount_ratio_clipped: ratioClipped,
    iqr_listing:
      typeof listingStats.iqr === "number" ? Math.round(listingStats.iqr) : null,
    iqr_sold: typeof soldStats.iqr === "number" ? Math.round(soldStats.iqr) : null,
    outliers_removed_listing: listingStats.outliersRemoved,
    outliers_removed_sold: soldStats.outliersRemoved,
    confidence,
    bucket,
    notes: notes.length > 0 ? notes.join("; ") : null,
  };
}

async function recomputeDiscountBuckets(): Promise<void> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("market_discount_factors")
    .select("*")
    .order("computed_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Failed to recompute market buckets:", error.message);
    return;
  }

  const latestByCard = new Map<string, MarketDiscountFactorRecord>();
  for (const row of data ?? []) {
    const factor = toFactorRecord(row);
    if (!latestByCard.has(factor.card_fingerprint)) {
      latestByCard.set(factor.card_fingerprint, factor);
    }
  }

  const grouped = new Map<string, MarketDiscountFactorRecord[]>();
  for (const factor of latestByCard.values()) {
    if (!isFinitePositive(factor.discount_ratio_clipped)) continue;
    const key = bucketKey(factor.bucket);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(factor);
  }

  const rows = Array.from(grouped.entries()).map(([key, factors]) => {
    const ratios = factors
      .map((factor) => factor.discount_ratio_clipped)
      .filter((value): value is number => isFinitePositive(value))
      .sort((a, b) => a - b);

    const ratioMedian = median(ratios) ?? DEFAULT_DISCOUNT_RATIO;
    const ratioP25 = quantile(ratios, 0.25);
    const ratioP75 = quantile(ratios, 0.75);
    const width =
      ratioP25 !== null && ratioP75 !== null ? Math.max(0, ratioP75 - ratioP25) : null;

    return {
      bucket: parseBucketKey(key),
      ratio_median: ratioMedian,
      ratio_p25: ratioP25,
      ratio_p75: ratioP75,
      n_cards: factors.length,
      n_samples: factors.reduce(
        (sum, factor) => sum + (factor.listing_count ?? 0) + (factor.sold_count ?? 0),
        0
      ),
      confidence: confidenceFromBucket({ nCards: factors.length, iqrWidth: width }),
      computed_at: new Date().toISOString(),
    };
  });

  if (rows.length === 0) return;

  const { error: upsertError } = await service
    .from("market_discount_buckets")
    .upsert(rows, { onConflict: "bucket" });

  if (upsertError) {
    console.error("Failed to upsert market discount buckets:", upsertError.message);
  }
}

async function fetchBucketRowsMatching(partial: Partial<MarketDiscountBucket>): Promise<MarketDiscountBucketRecord[]> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("market_discount_buckets")
    .select("*")
    .contains("bucket", partial)
    .order("computed_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to fetch bucket rows:", error.message);
    return [];
  }

  return (data ?? []).map((row) => toBucketRecord(row));
}

async function computeGlobalFallbackDiscount(bucket: MarketDiscountBucket): Promise<ExpectedDiscount> {
  const service = await createServiceClient();
  const { data, error } = await service
    .from("market_discount_factors")
    .select("discount_ratio_clipped")
    .order("computed_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("Failed to compute global discount fallback:", error.message);
    return {
      ratio: DEFAULT_DISCOUNT_RATIO,
      p25: DEFAULT_DISCOUNT_P25,
      p75: DEFAULT_DISCOUNT_P75,
      confidence: "low",
      bucket,
      source: "default",
    };
  }

  const ratios = (data ?? [])
    .map((row) => toNullableNumber(row.discount_ratio_clipped))
    .filter((value): value is number => isFinitePositive(value))
    .sort((a, b) => a - b);

  if (ratios.length === 0) {
    return {
      ratio: DEFAULT_DISCOUNT_RATIO,
      p25: DEFAULT_DISCOUNT_P25,
      p75: DEFAULT_DISCOUNT_P75,
      confidence: "low",
      bucket,
      source: "default",
    };
  }

  return {
    ratio: median(ratios) ?? DEFAULT_DISCOUNT_RATIO,
    p25: quantile(ratios, 0.25),
    p75: quantile(ratios, 0.75),
    confidence: ratios.length >= 100 ? "medium" : "low",
    bucket,
    source: "global",
  };
}

export async function getExpectedDiscount(
  bucket: MarketDiscountBucket
): Promise<ExpectedDiscount> {
  const strictPartial: Partial<MarketDiscountBucket> = {
    priceTier: bucket.priceTier,
    liquidityBucket: bucket.liquidityBucket,
    gradedFlag: bucket.gradedFlag,
  };

  if (bucket.auctionMix) {
    strictPartial.auctionMix = bucket.auctionMix;
    const strictRows = await fetchBucketRowsMatching(strictPartial);
    const strict = strictRows.find((row) => bucketKey(row.bucket) === bucketKey(bucket));
    if (strict) {
      return {
        ratio: strict.ratio_median,
        p25: strict.ratio_p25,
        p75: strict.ratio_p75,
        confidence: strict.confidence,
        bucket: strict.bucket,
        source: "bucket",
      };
    }
  }

  const withoutAuction = await fetchBucketRowsMatching({
    priceTier: bucket.priceTier,
    liquidityBucket: bucket.liquidityBucket,
    gradedFlag: bucket.gradedFlag,
  });
  if (withoutAuction.length > 0) {
    const row = withoutAuction[0]!;
    return {
      ratio: row.ratio_median,
      p25: row.ratio_p25,
      p75: row.ratio_p75,
      confidence: row.confidence,
      bucket: row.bucket,
      source: "fallback_bucket",
    };
  }

  const relaxedLiquidity = await fetchBucketRowsMatching({
    priceTier: bucket.priceTier,
    gradedFlag: bucket.gradedFlag,
  });
  if (relaxedLiquidity.length > 0) {
    const row = relaxedLiquidity[0]!;
    return {
      ratio: row.ratio_median,
      p25: row.ratio_p25,
      p75: row.ratio_p75,
      confidence: row.confidence,
      bucket: row.bucket,
      source: "fallback_bucket",
    };
  }

  const priceOnly = await fetchBucketRowsMatching({
    priceTier: bucket.priceTier,
  });
  if (priceOnly.length > 0) {
    const row = priceOnly[0]!;
    return {
      ratio: row.ratio_median,
      p25: row.ratio_p25,
      p75: row.ratio_p75,
      confidence: row.confidence,
      bucket: row.bucket,
      source: "fallback_bucket",
    };
  }

  return computeGlobalFallbackDiscount(bucket);
}

async function refreshMarketData(input: MarketRefreshInput): Promise<{
  factor: MarketDiscountFactorRecord | null;
  activeSnapshot: MarketSnapshotRecord | null;
  soldSnapshot: MarketSnapshotRecord | null;
}> {
  const ebayParams = buildEbayParams({ ...input.query, limit: input.query.limit ?? 25 });
  const queryText = input.queryTextOverride ?? buildQueryText(input.query);
  const cardFingerprint = input.cardFingerprint ?? buildMarketFingerprint(input.query);

  const activeItems =
    input.activeItemsOverride ??
    (
      await searchEbayDualSignal(ebayParams)
    ).forSale.items;

  const soldData = await scrapeEbaySoldListings(ebayParams);

  const activePricesCents = activeItems
    .map((item) => listingTotalPriceCents(item))
    .filter((value): value is number => typeof value === "number" && value > 0);

  const soldPricesCents = (soldData.items ?? [])
    .map((item) => (isFinitePositive(item.price) ? roundToCents(item.price) : null))
    .filter((value): value is number => value !== null);

  const auctionCount = activeItems.filter((item) => isAuctionListing(item)).length;

  const activeSnapshot = await insertSnapshot({
    cardFingerprint,
    queryText,
    snapshotType: "active",
    pricesCents: activePricesCents,
    userId: input.userId,
    meta: {
      queryParams: ebayParams,
      auctionCount,
      listingCount: activeItems.length,
      pricingMode: "price_plus_shipping",
    },
  });

  const soldSnapshot = await insertSnapshot({
    cardFingerprint,
    queryText,
    snapshotType: "sold",
    pricesCents: soldPricesCents,
    userId: input.userId,
    meta: {
      queryParams: ebayParams,
      bestOfferUnknown: true,
      soldCount: soldData.items?.length ?? 0,
      soldStatus: soldData.status,
      soldError: soldData.error ?? null,
    },
  });

  const factorPayload = computeFactorFromSnapshots({
    cardFingerprint,
    listingPricesCents: activePricesCents,
    soldPricesCents,
    grade: input.query.grade,
    auctionCount,
    listingRawCount: activeItems.length,
    soldRawCount: soldData.items?.length ?? 0,
  });

  const factor = await insertFactor(factorPayload);
  await recomputeDiscountBuckets();

  return {
    factor,
    activeSnapshot,
    soldSnapshot,
  };
}

export async function getMarketCmvForQuery(
  input: MarketRefreshInput
): Promise<{
  cmv: MarketCmvComputation;
  factor: MarketDiscountFactorRecord | null;
  expectedDiscount: ExpectedDiscount | null;
  activeSnapshot: MarketSnapshotRecord | null;
  soldSnapshot: MarketSnapshotRecord | null;
}> {
  const cardFingerprint = input.cardFingerprint ?? buildMarketFingerprint(input.query);
  const queryText = input.queryTextOverride ?? buildQueryText(input.query);

  try {
    let factor = await fetchLatestFactor(cardFingerprint);
    let activeSnapshot = await fetchLatestSnapshot(cardFingerprint, "active");
    let soldSnapshot = await fetchLatestSnapshot(cardFingerprint, "sold");

    const shouldRefresh =
      input.force === true ||
      !factor ||
      !isFresh(factor.computed_at) ||
      !activeSnapshot ||
      !soldSnapshot ||
      !isFresh(activeSnapshot.observed_at) ||
      !isFresh(soldSnapshot.observed_at);

    if (shouldRefresh) {
      const refreshed = await refreshMarketData({
        ...input,
        cardFingerprint,
        queryTextOverride: queryText,
      });
      factor = refreshed.factor;
      activeSnapshot = refreshed.activeSnapshot ?? activeSnapshot;
      soldSnapshot = refreshed.soldSnapshot ?? soldSnapshot;
    }

    if (!factor) {
      return {
        cmv: {
          method: "insufficient_data",
          cmv: null,
          rangeLow: null,
          rangeHigh: null,
          confidence: "low",
          listingMedian: null,
          soldMedian: null,
          listingCount: 0,
          soldCount: 0,
          expectedDiscountRatio: null,
          expectedDiscountP25: null,
          expectedDiscountP75: null,
          expectedDiscountConfidence: null,
          cardFingerprint,
          queryText,
        },
        factor: null,
        expectedDiscount: null,
        activeSnapshot,
        soldSnapshot,
      };
    }

    const expectedDiscount = await getExpectedDiscount(factor.bucket);
    const cmv = factorToCmv(factor, expectedDiscount, queryText);

    return {
      cmv,
      factor,
      expectedDiscount,
      activeSnapshot,
      soldSnapshot,
    };
  } catch (error) {
    console.error("Market discount persistence unavailable; using on-demand fallback:", error);
    return computeWithoutPersistence({
      ...input,
      cardFingerprint,
      queryTextOverride: queryText,
    });
  }
}

export function buildMarketQueryFromCollectionCard(
  input: CardMarketQueryInput["card"]
): MarketQueryInput {
  const grade = normalizeGrade(input.grade);
  const parallelFromNotes = extractNotesValue(input.notes, /Parallel:\s*([^|]+)/i);
  const insertFromNotes =
    extractNotesValue(input.notes, /Insert:\s*([^|]+)/i) ??
    extractNotesValue(input.notes, /\[INSERT:([^\]]+)\]/i);

  return {
    player: input.player_name,
    year: input.year ?? undefined,
    set: input.set_name ?? undefined,
    grade,
    cardNumber: input.card_number ?? undefined,
    parallelType: input.parallel_type ?? parallelFromNotes,
    keywords: insertFromNotes ? [insertFromNotes] : undefined,
    limit: 25,
  };
}

export async function getMarketCmvForCollectionCard(
  input: CardMarketQueryInput
): Promise<{
  cmv: MarketCmvComputation;
  factor: MarketDiscountFactorRecord | null;
  expectedDiscount: ExpectedDiscount | null;
}> {
  const query = buildMarketQueryFromCollectionCard(input.card);
  const cardFingerprint = buildMarketFingerprint(query);
  const result = await getMarketCmvForQuery({
    query,
    cardFingerprint,
    force: input.force,
  });

  return {
    cmv: result.cmv,
    factor: result.factor,
    expectedDiscount: result.expectedDiscount,
  };
}

export async function refreshMarketByFingerprint(
  cardFingerprint: string,
  force: boolean = true
): Promise<MarketCmvComputation | null> {
  const activeSnapshot = await fetchLatestSnapshot(cardFingerprint, "active");
  const soldSnapshot = await fetchLatestSnapshot(cardFingerprint, "sold");
  const metaCandidate =
    (activeSnapshot?.meta?.queryParams as Record<string, unknown> | undefined) ??
    (soldSnapshot?.meta?.queryParams as Record<string, unknown> | undefined);

  if (!metaCandidate || typeof metaCandidate.player !== "string") {
    return null;
  }

  const query: MarketQueryInput = {
    player: String(metaCandidate.player),
    year: typeof metaCandidate.year === "string" ? metaCandidate.year : undefined,
    set: typeof metaCandidate.set === "string" ? metaCandidate.set : undefined,
    grade: typeof metaCandidate.grade === "string" ? metaCandidate.grade : undefined,
    cardNumber:
      typeof metaCandidate.cardNumber === "string" ? metaCandidate.cardNumber : undefined,
    parallelType:
      typeof metaCandidate.parallelType === "string"
        ? metaCandidate.parallelType
        : undefined,
    serialNumber:
      typeof metaCandidate.serialNumber === "string"
        ? metaCandidate.serialNumber
        : undefined,
    variation:
      typeof metaCandidate.variation === "string" ? metaCandidate.variation : undefined,
    autograph:
      typeof metaCandidate.autograph === "string" ? metaCandidate.autograph : undefined,
    relic: typeof metaCandidate.relic === "string" ? metaCandidate.relic : undefined,
    keywords: Array.isArray(metaCandidate.keywords)
      ? metaCandidate.keywords.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    limit: typeof metaCandidate.limit === "number" ? metaCandidate.limit : 25,
  };

  const refreshed = await getMarketCmvForQuery({
    query,
    cardFingerprint,
    force,
  });

  return refreshed.cmv;
}

export async function getMarketDiscountDebugData(input: {
  query?: string;
  fingerprint?: string;
  limit?: number;
}): Promise<{
  latestFactors: MarketDiscountFactorRecord[];
  selectedFactor: MarketDiscountFactorRecord | null;
  selectedSnapshots: {
    active: MarketSnapshotRecord | null;
    sold: MarketSnapshotRecord | null;
  };
  selectedExpectedDiscount: ExpectedDiscount | null;
  selectedCmv: MarketCmvComputation | null;
  selectedBucketRows: MarketDiscountBucketRecord[];
  topDeltas: Array<{
    cardFingerprint: string;
    queryText: string;
    oldListingMedian: number | null;
    newCmv: number | null;
    deltaPct: number | null;
    method: string;
    confidence: DiscountConfidence;
  }>;
}> {
  const service = await createServiceClient();
  const limit = Math.max(5, Math.min(100, input.limit ?? 30));

  const { data: factorRows, error: factorError } = await service
    .from("market_discount_factors")
    .select("*")
    .order("computed_at", { ascending: false })
    .limit(500);

  if (factorError) {
    console.error("Failed to fetch debug factors:", factorError.message);
    return {
      latestFactors: [],
      selectedFactor: null,
      selectedSnapshots: { active: null, sold: null },
      selectedExpectedDiscount: null,
      selectedCmv: null,
      selectedBucketRows: [],
      topDeltas: [],
    };
  }

  const latestByFingerprint = new Map<string, MarketDiscountFactorRecord>();
  for (const row of factorRows ?? []) {
    const factor = toFactorRecord(row);
    if (!latestByFingerprint.has(factor.card_fingerprint)) {
      latestByFingerprint.set(factor.card_fingerprint, factor);
    }
  }

  let latestFactors = Array.from(latestByFingerprint.values());

  if (input.query && input.query.trim()) {
    const q = input.query.trim().toLowerCase();

    const { data: snapshotMatches } = await service
      .from("market_price_snapshots")
      .select("card_fingerprint, query_text")
      .ilike("query_text", `%${q}%`)
      .order("observed_at", { ascending: false })
      .limit(200);

    const fingerprintMatch = new Set(
      (snapshotMatches ?? []).map((row) => String(row.card_fingerprint))
    );

    latestFactors = latestFactors.filter(
      (factor) =>
        factor.card_fingerprint.toLowerCase().includes(q) ||
        fingerprintMatch.has(factor.card_fingerprint)
    );
  }

  latestFactors = latestFactors.slice(0, limit);

  const selectedFingerprint = input.fingerprint ?? latestFactors[0]?.card_fingerprint ?? null;
  const selectedFactor =
    selectedFingerprint !== null
      ? latestByFingerprint.get(selectedFingerprint) ?? null
      : null;

  const selectedActive =
    selectedFingerprint !== null
      ? await fetchLatestSnapshot(selectedFingerprint, "active")
      : null;
  const selectedSold =
    selectedFingerprint !== null
      ? await fetchLatestSnapshot(selectedFingerprint, "sold")
      : null;

  const selectedExpectedDiscount = selectedFactor
    ? await getExpectedDiscount(selectedFactor.bucket)
    : null;

  const selectedQueryText = selectedActive?.query_text ?? selectedSold?.query_text ?? "";
  const selectedCmv =
    selectedFactor && selectedExpectedDiscount
      ? factorToCmv(selectedFactor, selectedExpectedDiscount, selectedQueryText)
      : selectedFactor
      ? factorToCmv(selectedFactor, null, selectedQueryText)
      : null;

  const selectedBucketRows = selectedFactor
    ? await fetchBucketRowsMatching(selectedFactor.bucket)
    : [];

  const topDeltas = await Promise.all(
    latestFactors.slice(0, 15).map(async (factor) => {
      const active = await fetchLatestSnapshot(factor.card_fingerprint, "active");
      const expected = await getExpectedDiscount(factor.bucket);
      const cmv = factorToCmv(factor, expected, active?.query_text ?? "");
      const oldListingMedian = fromCents(factor.listing_median_cents);
      const deltaPct =
        oldListingMedian !== null && cmv.cmv !== null && oldListingMedian > 0
          ? Math.round((((cmv.cmv - oldListingMedian) / oldListingMedian) * 100) * 100) / 100
          : null;

      return {
        cardFingerprint: factor.card_fingerprint,
        queryText: active?.query_text ?? "",
        oldListingMedian,
        newCmv: cmv.cmv,
        deltaPct,
        method: cmv.method,
        confidence: cmv.confidence,
      };
    })
  );

  return {
    latestFactors,
    selectedFactor,
    selectedSnapshots: {
      active: selectedActive,
      sold: selectedSold,
    },
    selectedExpectedDiscount,
    selectedCmv,
    selectedBucketRows,
    topDeltas,
  };
}

export function computeRobustSnapshotDebug(pricesCents: unknown): {
  raw: number[];
  trimmed: number[];
  outliersRemoved: number;
  medianRaw: number | null;
  medianTrimmed: number | null;
} {
  const prices = ensureArrayOfNumbers(pricesCents);
  const stats = robustStats(prices);
  return {
    raw: stats.sortedRaw,
    trimmed: stats.sortedCleaned,
    outliersRemoved: stats.outliersRemoved,
    medianRaw: fromCents(stats.medianBeforeTrim),
    medianTrimmed: fromCents(stats.medianAfterTrim),
  };
}
