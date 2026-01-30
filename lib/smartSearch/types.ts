import type { ParsedSearch, Comp } from "@/types";

export type SmartSearchMode = "watchlist" | "collection";

export interface LockedConstraints {
  year?: string;
  brand?: string;
  line?: string;
  player?: string;
  cardNumber?: string;
  parallel?: string;
}

export interface ParsedQuery {
  /** Original parsed structure from the existing smart-search parser */
  original: ParsedSearch;
  /** Locked constraints derived from the raw query + parsed fields */
  locked: LockedConstraints;
  /** All normalized tokens from the raw query */
  tokens: string[];
}

export interface SmartSearchCandidate {
  /** Stable id if available (e.g., itemId); otherwise a synthetic one */
  id: string;
  /** Raw listing title or human-readable label */
  title: string;

  /** Normalized attributes extracted from the listing or dataset */
  year?: string;
  brand?: string;
  line?: string;
  playerName?: string;
  cardNumber?: string;
  parallel?: string;

  /** Optional display fields */
  subtitle?: string;

  /** Confidence score in 0–1, filled in by the scorer */
  confidence?: number;

  /** True if this candidate violates at least one locked constraint */
  hasLockedConstraintMismatch?: boolean;

  /** Which specific constraints were mismatched for this candidate */
  mismatchedConstraints?: LockedConstraints;

  /** Optional source tag (e.g., 'ebayForSale', 'ebaySold', 'internalDb') */
  source?: string;

  /** Underlying raw object (e.g., ForSaleItem or Comp), for consumers that need it */
  raw?: unknown;
}

export interface SmartSearchDiagnostics {
  reasonCounts: Record<string, number>;
  appliedConstraints: LockedConstraints & {
    mode: SmartSearchMode;
    thresholds: { exact: number; closeMin: number };
  };
  source: string;
  topExactConfidence?: number;
  topCloseConfidence?: number;
  /** True when no candidates survived hard constraints before broadening */
  noExactMatchesBeforeBroadening?: boolean;
}

export interface SmartSearchResult {
  exact: SmartSearchCandidate[];
  close: SmartSearchCandidate[];
  parsed: {
    locked: LockedConstraints;
    tokens: string[];
    original: ParsedSearch;
  };
  diagnostics: SmartSearchDiagnostics;
  /**
   * Optional raw comps array for collection mode (sold listings),
   * useful for calculating stats and showing legacy views.
   */
  rawComps?: Comp[];
}

