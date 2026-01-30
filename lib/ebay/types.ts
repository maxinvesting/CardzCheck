// eBay Dual-Signal Types

export interface EbaySearchParams {
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
  /** Max items to return (e.g. 1 for watchlist single-comp search). Default 20. */
  limit?: number;
}

export interface ForSaleItem {
  title: string;
  price: number;
  shipping?: number;
  condition?: string;
  url: string;
  image?: string;
  itemId?: string;
}

export interface ForSaleData {
  count: number;
  low: number;
  median: number;
  high: number;
  items: ForSaleItem[];
  cachedAt?: string;
}

export interface CompItem {
  title: string;
  price: number;
  date: string;
  url: string;
  image?: string;
}

export interface RecentCompsData {
  status: "ok" | "unavailable" | "stale";
  count: number;
  low: number;
  median: number;
  high: number;
  items: CompItem[];
  cachedAt?: string;
  error?: string;
}

export interface PriceInsights {
  askVsCompPct?: number;      // % difference between median ask vs median comp
  spreadTightness?: "tight" | "moderate" | "wide";
  confidence: "high" | "medium" | "low";
}

export interface EbayDualSignalResponse {
  query: string;
  normalizedQuery: string;
  forSale: ForSaleData;
  recentComps: RecentCompsData;
  insights: PriceInsights;
  disclaimers: string[];
}

// Cache entry types
export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
}

// OAuth token
export interface EbayOAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Rate limit tracking
export interface RateLimitState {
  lastRequestTime: number;
  blockedUntil?: number;
  consecutiveErrors: number;
}
