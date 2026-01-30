// eBay Integration - Main Entry Point
// Re-exports all public APIs

export type {
  EbaySearchParams,
  ForSaleData,
  ForSaleItem,
} from "./types";

export type {
  EbayPricingResponse,
} from "./dual-signal";

export type {
  PriceEstimate,
  PriceEstimateResult,
  PriceEstimateUnavailable,
  MarketAsk,
  EstimatedSaleRange,
  EstimateParams,
} from "./price-estimator";

export {
  searchEbayDualSignal,
  searchEbayLegacy,
} from "./dual-signal";

export {
  estimateSaleRange,
} from "./price-estimator";

export {
  buildSearchQuery,
  buildActiveListingsUrl,
  buildSoldListingsUrl,
  normalizeQueryForCache,
} from "./utils";

export {
  getCacheStats,
  clearCaches,
} from "./cache";

export {
  getRateLimitState,
  resetRateLimitState,
} from "./rate-limiter";
