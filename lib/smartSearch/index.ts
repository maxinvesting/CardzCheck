import { searchEbayDualSignal } from "@/lib/ebay/index";
import { scrapeEbaySoldListings } from "@/lib/ebay";
import type { ForSaleItem } from "@/lib/ebay/types";
import type { Comp, ParsedSearch } from "@/types";
import { parseQuery } from "./parseQuery";
import { extractBrandAndLine, extractParallel, extractCardNumber, extractYear } from "./normalize";
import { bucketByConstraints } from "./filterCandidates";
import { scoreCandidates } from "./scoreCandidates";
import type {
  SmartSearchMode,
  SmartSearchCandidate,
  SmartSearchResult,
  SmartSearchDiagnostics,
} from "./types";

export type { SmartSearchMode, SmartSearchCandidate, SmartSearchResult } from "./types";

export interface SmartSearchOptions {
  /** Max number of candidates to keep (per bucket, after scoring) */
  limit?: number;
  /** Data source hint; currently informational */
  source?: "ebayWatchlist" | "ebayCollection" | "internal";
  /** If true, relaxes some constraints for broadened searches (used mainly by watchlist UI) */
  broaden?: boolean;
}

/**
 * Unified SmartSearch entry point.
 * - Parses the raw query into locked constraints
 * - Fetches candidates from the appropriate backing source (currently eBay)
 * - Applies hard constraints and scoring
 * - Returns Exact and Close buckets plus diagnostics
 */
export async function smartSearch(
  query: string,
  mode: SmartSearchMode,
  options: SmartSearchOptions = {}
): Promise<SmartSearchResult> {
  const parsed = parseQuery(query);
  const limit = options.limit ?? 20;

  const { candidates, sourceLabel, rawComps } = await fetchCandidatesForMode(query, parsed.original, mode, limit);

  // First, bucket by hard constraints (year/brand/line/cardNumber/parallel)
  const constraintResult = bucketByConstraints(parsed, candidates, mode);

  // If broaden requested and no exact matches exist, we will rely more heavily on Close + scoring
  const baseCandidates = options.broaden
    ? [...constraintResult.exact, ...constraintResult.close]
    : [...constraintResult.exact, ...constraintResult.close];

  const { scored, config } = scoreCandidates(parsed, baseCandidates, mode);

  const exactBucket: SmartSearchCandidate[] = [];
  const closeBucket: SmartSearchCandidate[] = [];

  for (const cand of scored) {
    if (cand.confidence >= config.exactThreshold && !cand.hasLockedConstraintMismatch) {
      if (exactBucket.length < limit) exactBucket.push(cand);
    } else if (cand.confidence >= config.closeMin) {
      if (closeBucket.length < limit) closeBucket.push(cand);
    }
  }

  const diagnostics: SmartSearchDiagnostics = {
    reasonCounts: constraintResult.diagnostics.droppedByConstraint,
    appliedConstraints: {
      ...parsed.locked,
      mode,
      thresholds: {
        exact: config.exactThreshold,
        closeMin: config.closeMin,
      },
    },
    source: sourceLabel,
    topExactConfidence: exactBucket[0]?.confidence,
    topCloseConfidence: closeBucket[0]?.confidence,
    noExactMatchesBeforeBroadening: constraintResult.diagnostics.noExactMatchesBeforeBroadening,
  };

  // Lightweight telemetry for tuning
  try {
    // eslint-disable-next-line no-console
    console.log("[SmartSearch]", {
      mode,
      query,
      locked: parsed.locked,
      exactCount: exactBucket.length,
      closeCount: closeBucket.length,
      topExactConfidence: diagnostics.topExactConfidence,
      noExactMatchesBeforeBroadening: diagnostics.noExactMatchesBeforeBroadening,
      broaden: options.broaden ?? false,
    });
  } catch {
    // ignore logging errors
  }

  return {
    exact: exactBucket,
    close: closeBucket,
    parsed: {
      locked: parsed.locked,
      tokens: parsed.tokens,
      original: parsed.original,
    },
    diagnostics,
    rawComps,
  };
}

async function fetchCandidatesForMode(
  query: string,
  parsed: ParsedSearch,
  mode: SmartSearchMode,
  limit: number
): Promise<{ candidates: SmartSearchCandidate[]; sourceLabel: string; rawComps?: Comp[] }> {
  if (mode === "watchlist") {
    const params = buildEbayParamsFromParsed(query, parsed, limit);
    const response = await searchEbayDualSignal(params);
    const items = response.forSale.items ?? [];
    return {
      candidates: items.map((item, idx) => mapForSaleItemToCandidate(item, idx)),
      sourceLabel: "ebayForSale",
    };
  }

  // collection mode: use sold listings via legacy wrapper
  const params = buildEbayParamsFromParsed(query, parsed, limit);
  const comps = await scrapeEbaySoldListings(params);
  return {
    candidates: comps.map((comp, idx) => mapCompToCandidate(comp, idx)),
    sourceLabel: "ebaySold",
    rawComps: comps,
  };
}

function buildEbayParamsFromParsed(
  query: string,
  parsed: ParsedSearch,
  limit: number
): import("@/lib/ebay").EbaySearchParams {
  // Always fall back to the raw query if parser couldn't find a player.
  const player = parsed.player_name?.trim() ? parsed.player_name : query;

  return {
    player,
    year: parsed.year,
    set: parsed.set_name,
    grade: parsed.grade,
    cardNumber: parsed.card_number,
    parallelType: parsed.parallel_type,
    serialNumber: parsed.serial_number,
    variation: parsed.variation,
    autograph: parsed.autograph,
    relic: parsed.relic,
    keywords: parsed.unparsed_tokens,
    limit,
  };
}

function mapForSaleItemToCandidate(item: ForSaleItem, index: number): SmartSearchCandidate {
  const year = extractYear(item.title) ?? undefined;
  const brandLine = extractBrandAndLine(item.title);
  const cardNumber = extractCardNumber(item.title) ?? undefined;
  const parallel = extractParallel(item.title) ?? undefined;

  return {
    id: item.itemId ?? `forSale-${index}`,
    title: item.title,
    year,
    brand: brandLine.brand,
    line: brandLine.line,
    playerName: undefined, // we don't reliably know from title, scoring will still use it if set elsewhere
    cardNumber,
    parallel,
    source: "ebayForSale",
    raw: item,
  };
}

function mapCompToCandidate(comp: Comp, index: number): SmartSearchCandidate {
  const year = extractYear(comp.title) ?? undefined;
  const brandLine = extractBrandAndLine(comp.title);
  const cardNumber = extractCardNumber(comp.title) ?? undefined;
  const parallel = extractParallel(comp.title) ?? undefined;

  return {
    id: `comp-${index}`,
    title: comp.title,
    year,
    brand: brandLine.brand,
    line: brandLine.line,
    playerName: undefined,
    cardNumber,
    parallel,
    source: "ebaySold",
    raw: comp,
  };
}

