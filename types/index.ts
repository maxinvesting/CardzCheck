export interface User {
  id: string;
  email: string;
  name?: string | null; // User's display name
  is_paid: boolean;
  stripe_customer_id: string | null;
  free_searches_used: number;
  analyst_queries_used?: number; // Number of AI analyst queries used (Pro feature, limit 100)
  created_at: string;
  plan_selected?: boolean; // Whether user has selected a plan (prevents modal from showing again)
  subscription?: Subscription; // New subscription record
  usage?: Usage; // New usage tracking record
}

// Subscription record for Pro tier management
export interface Subscription {
  id: string;
  user_id: string;
  tier: "free" | "pro";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  activation_paid: boolean;
  current_period_end: string | null;
  status: "active" | "past_due" | "canceled" | "unpaid";
  created_at: string;
  updated_at: string;
}

// Usage tracking for free tier limits
export interface Usage {
  id: string;
  user_id: string;
  searches_used: number;
  ai_messages_used: number;
  period_start: string;
  last_reset: string;
}

// Price history entry for watchlist
export interface PriceHistoryEntry {
  price: number;
  date: string;
}

// Watchlist item for tracking cards user wants to watch
export interface WatchlistItem {
  id: string;
  user_id: string;
  player_name: string;
  year: string | null;
  set_brand: string | null;
  card_number: string | null;
  parallel_variant: string | null;
  condition: string | null;
  target_price: number | null;
  last_price: number | null;
  last_checked: string | null;
  price_history: PriceHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  player_name: string; // Primary player (for backward compatibility)
  players?: string[] | null; // All players (for multi-player cards) - stored as JSON array in DB
  year: string | null;
  set_name: string | null;
  insert?: string | null; // Insert type (e.g., "Downtown")
  grade: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  image_url: string | null;
  notes: string | null;
  estimated_cmv: number | null;
  cmv_confidence: CmvConfidence;
  cmv_last_updated: string | null;
  created_at: string;
  /**
   * Estimated current market value (CMV) for this card.
   * Backed by comps / pricing engine when available.
   * Nullable because many cards may not have pricing yet.
   */
  est_cmv?: number | null;
}

export interface Comp {
  title: string;
  price: number;
  date: string;
  link: string;
  image?: string;
  source: "ebay";
}

export interface CompsStats {
  cmv: number | null; // Current Market Value (median)
  avg: number;
  low: number;
  high: number;
  count: number;
}

// For Sale item from Browse API
export interface ForSaleItem {
  title: string;
  price: number;
  shipping?: number;
  condition?: string;
  url: string;
  image?: string;
}

// For Sale data from Browse API
export interface ForSaleData {
  count: number;
  low: number;
  median: number;
  high: number;
  items: ForSaleItem[];
  cachedAt?: string;
}

// Estimated Sale Range (Beta) - calculated from active listings
export interface EstimatedSaleRange {
  pricingAvailable: boolean;
  marketAsk?: {
    count: number;
    medianAsk: number;
    p20: number;
    p80: number;
  };
  estimatedSaleRange?: {
    low: number;
    high: number;
    discountApplied: number;
    confidence: "high" | "medium" | "low";
    spreadPct: number;
  };
  notes?: string[];
  reason?: string;
}

export interface SearchResult {
  comps: Comp[];
  stats: CompsStats;
  query: string;
  // New fields for dual-signal data
  _forSale?: ForSaleData;
  _estimatedSaleRange?: EstimatedSaleRange;
  _disclaimers?: string[];
}

// Grade estimation from AI analysis
export interface GradeEstimate {
  estimated_grade_low: number;
  estimated_grade_high: number;
  centering: string;
  corners: string;
  surface: string;
  edges: string;
  grade_notes: string;
}

export interface CardIdentification {
  player_name: string; // Primary player (for backward compatibility)
  players?: string[]; // All players (for multi-player cards)
  year: string;
  set_name: string;
  insert?: string; // Insert type (e.g., "Downtown")
  variant: string; // Parallel/variant (not used for inserts)
  grade: string;
  confidence: "high" | "medium" | "low";
}

export interface CardIdentificationError {
  error: string;
  reason: string;
}

export type CardIdentificationResponse =
  | CardIdentification
  | CardIdentificationError;

export interface SearchFormData {
  player_name: string;
  players?: string[]; // All players (for multi-player cards)
  year?: string;
  set_name?: string;
  insert?: string; // Insert type (e.g., "Downtown")
  grade?: string;
  card_number?: string;
  parallel_type?: string;
  serial_number?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
}

// Extended result from card identification including image URL
export interface CardIdentificationResult extends SearchFormData {
  imageUrl: string;
  confidence: "high" | "medium" | "low";
  players?: string[]; // All players (for multi-player cards)
  insert?: string; // Insert type (e.g., "Downtown")
  // gradeEstimate removed - only available via explicit grade-estimate API
}

// Condition options for the add to collection modal
export const CONDITION_OPTIONS = [
  { label: "Raw (Ungraded)", value: "Raw" },
  { label: "PSA 10 - Gem Mint", value: "PSA 10" },
  { label: "PSA 9 - Mint", value: "PSA 9" },
  { label: "PSA 8 - Near Mint-Mint", value: "PSA 8" },
  { label: "PSA 7 - Near Mint", value: "PSA 7" },
  { label: "PSA 6 - Excellent-Mint", value: "PSA 6" },
  { label: "BGS 10 - Black Label", value: "BGS 10" },
  { label: "BGS 9.5 - Gem Mint", value: "BGS 9.5" },
  { label: "BGS 9 - Mint", value: "BGS 9" },
  { label: "BGS 8.5 - Near Mint-Mint+", value: "BGS 8.5" },
  { label: "BGS 8 - Near Mint-Mint", value: "BGS 8" },
  { label: "SGC 10 - Gem Mint", value: "SGC 10" },
  { label: "SGC 9.5 - Mint+", value: "SGC 9.5" },
  { label: "SGC 9 - Mint", value: "SGC 9" },
  { label: "CGC 10 - Pristine", value: "CGC 10" },
  { label: "CGC 9.5 - Gem Mint", value: "CGC 9.5" },
  { label: "CGC 9 - Mint", value: "CGC 9" },
] as const;

export const LIMITS = {
  FREE_SEARCHES: 3,
  FREE_COLLECTION: 5,
  FREE_WATCHLIST: 0, // Watchlist is Pro-only
  FREE_AI_MESSAGES: 3, // Free users get 3 AI messages
} as const;

export function isCardIdentificationError(
  response: CardIdentificationResponse
): response is CardIdentificationError {
  return "error" in response;
}

export interface ParsedSearch {
  player_name: string;
  year?: string;
  set_name?: string;
  grade?: string;
  card_number?: string;
  parallel_type?: string;
  serial_number?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
  confidence: "high" | "medium" | "low";
  unparsed_tokens: string[];
}

export interface RecentSearch {
  query: string;
  parsed: ParsedSearch;
  timestamp: number;
  resultCount?: number;
  cmv?: number | null;
}

export type CmvConfidence = "high" | "medium" | "low" | "unavailable";

// CardzCheck Analyst types
export interface CardContext {
  playerName?: string;
  year?: string;
  setName?: string;
  grade?: string;
  recentSales?: Array<{ price: number; date: string }>;
  avgPrice?: number;
  priceChange30d?: number;
}

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}

// Persistent analyst chat types
export interface AnalystThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AnalystThreadMessage {
  id: string;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface AnalystRequest {
  message: string;
  cardContext?: CardContext;
}

export interface AnalystResponse {
  response: string;
}

export interface AnalystError {
  error: string;
  message?: string;
  used?: number;
  limit?: number;
}

export const ANALYST_LIMITS = {
  QUERIES_PER_USER: 100,
} as const;
