import type { ForSaleItem } from "@/lib/ebay/types";

export type ListingTier = "exact" | "likely" | "close";

export interface QueryIntent {
  raw: string;
  normalized: string;
  year?: string;
  /** Player name tokens in order, e.g. ["jayden", "daniels"] */
  playerTokens: string[];
  /** Product line tokens like prizm, optic, select, mosaic, donruss, chronicles */
  productTokens: string[];
  /** Insert / family tokens like rated rookie, downtown, my house */
  insertTokens: string[];
  /** Parallel / color tokens like silver, holo, red, blue, pulsar, checkerboard */
  parallelTokens: string[];
  /** True when query explicitly mentions rookie/rc */
  hasRookieKeyword: boolean;
  /** True when query explicitly mentions draft/college/NCaa/university names */
  hasDraftOrCollegeSignal: boolean;
  /** Tokens that were explicitly noise (card, rc, psa, lot, etc) */
  noiseTokens: string[];
  /** Remaining generic tokens after extracting all structured signals */
  genericTokens: string[];
  /** Convenience flag: did user clearly specify a product line? */
  productSpecified: boolean;
  /** Normalized product lines requested, e.g. ["optic"], ["prizm"] */
  requestedProductLines: string[];
}

export interface ScoredListing {
  id: string;
  title: string;
  price: number;
  url: string;
  image?: string;
  condition?: string;
  shipping?: number;
  /** Extracted 4-digit year from title, when present */
  year?: string;
  /** Simple brand+line label, e.g. "Donruss Optic" or "Panini Prizm" */
  productLine?: string;
  /** 0–100 score */
  score: number;
  tier: ListingTier;
  reasons: string[];
  /** Underlying raw eBay object for future extensions */
  raw: ForSaleItem;
}

export interface WatchlistSearchResponse {
  query: string;
  intent: QueryIntent;
  exact: ScoredListing[];
  likely: ScoredListing[];
  close: ScoredListing[];
  /** Count of candidates that were scored but fell below the Close threshold */
  hiddenCount: number;
  /** Optional helper message for the UI (e.g. when there are no exact matches) */
  message?: string;
}

