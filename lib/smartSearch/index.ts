import { searchEbayDualSignal } from "@/lib/ebay/index";
import { scrapeEbaySoldListings } from "@/lib/ebay";
import type { ForSaleItem } from "@/lib/ebay/types";
import type { Comp, ParsedSearch } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logDebug } from "@/lib/logging";
import { parseQuery } from "./parseQuery";
import {
  extractBrandAndLine,
  extractParallel,
  extractCardNumber,
  extractYear,
  extractGraderAndGrade,
  expandSynonyms,
  normalizeText,
} from "./normalize";
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
  /** Max number of candidates to retrieve before scoring */
  candidateLimit?: number;
  /** Data source hint; currently informational */
  source?: "ebayWatchlist" | "ebayCollection" | "internal";
  /** If true, relaxes some constraints for broadened searches (used mainly by watchlist UI) */
  broaden?: boolean;
  /** Include debug metadata (dev-only) */
  debug?: boolean;
  /** Optional Supabase client */
  supabase?: SupabaseClient;
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
  const candidateLimit = options.candidateLimit ?? 200;

  const { candidates, sourceLabel, rawComps } = await fetchCandidatesForMode(
    query,
    parsed.original,
    mode,
    candidateLimit,
    options
  );

  // First, bucket by hard constraints (year/brand/line/cardNumber/parallel)
  const constraintResult = bucketByConstraints(parsed, candidates, mode);

  // If broaden requested and no exact matches exist, we will rely more heavily on Close + scoring
  const baseCandidates = options.broaden
    ? [...constraintResult.exact, ...constraintResult.close]
    : [...constraintResult.exact, ...constraintResult.close];

  const { scored, config } = scoreCandidates(parsed, baseCandidates, mode);

  const exactBucket: SmartSearchCandidate[] = [];
  const closeBucket: SmartSearchCandidate[] = [];

  const bestScore = scored[0]?.score ?? 0;
  const bestConfidence = scored[0]?.confidence ?? 0;

  if (bestScore >= config.closeScoreMin) {
    for (const cand of scored) {
      if (cand.score >= config.exactScoreThreshold) {
        if (exactBucket.length < limit) exactBucket.push(cand);
      } else if (cand.score >= config.closeScoreMin) {
        if (closeBucket.length < limit) closeBucket.push(cand);
      }
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
    bestScore,
    bestConfidence,
    noExactMatchesBeforeBroadening: constraintResult.diagnostics.noExactMatchesBeforeBroadening,
    noResultsReason:
      bestScore < config.closeScoreMin
        ? "below_relevance_threshold"
        : undefined,
  };

  const debugEnabled = options.debug && process.env.NODE_ENV !== "production";
  const topResults = scored.slice(0, 5).map((cand) => ({
    id: cand.id,
    title: cand.title,
    score: cand.score,
    confidence: cand.confidence ?? 0,
    breakdown: cand.scoreBreakdown ?? {},
  }));

  logDebug("[SmartSearch]", {
    mode,
    query,
    tokens: parsed.tokens,
    candidateCount: candidates.length,
    bestScore,
    thresholds: {
      exactScore: config.exactScoreThreshold,
      closeScore: config.closeScoreMin,
      exactConfidence: config.exactThreshold,
      closeConfidence: config.closeMin,
      maxScore: config.maxScore,
    },
    topResults,
  });

  return {
    exact: exactBucket,
    close: closeBucket,
    exactMatches: exactBucket,
    closeMatches: closeBucket,
    parsed: {
      locked: parsed.locked,
      tokens: parsed.tokens,
      original: parsed.original,
      signals: parsed.signals,
    },
    diagnostics,
    debug: debugEnabled
      ? {
          parsedTokens: parsed.tokens,
          candidateCount: candidates.length,
          thresholds: {
            exactScore: config.exactScoreThreshold,
            closeScore: config.closeScoreMin,
            exactConfidence: config.exactThreshold,
            closeConfidence: config.closeMin,
            maxScore: config.maxScore,
          },
          bestScore,
          bestConfidence,
          topResults,
        }
      : undefined,
    rawComps,
  };
}

async function fetchCandidatesForMode(
  query: string,
  parsed: ParsedSearch,
  mode: SmartSearchMode,
  candidateLimit: number,
  options: SmartSearchOptions
): Promise<{ candidates: SmartSearchCandidate[]; sourceLabel: string; rawComps?: Comp[] }> {
  const searchText = buildQuerySearchText(query, parsed);

  // Prefer internal catalog search if available
  const catalogCandidates = await fetchCatalogCandidates(searchText, candidateLimit, options.supabase);
  if (catalogCandidates.length > 0) {
    if (mode === "collection") {
      const { comps, sourceLabel } = await fetchEbaySoldCandidates(query, parsed, candidateLimit);
      return {
        candidates: catalogCandidates,
        sourceLabel: `cardCatalog+${sourceLabel}`,
        rawComps: comps,
      };
    }
    return {
      candidates: catalogCandidates,
      sourceLabel: "cardCatalog",
    };
  }

  // Fallback: use eBay data if catalog is unavailable
  if (mode === "watchlist") {
    const { items, sourceLabel } = await fetchEbayCandidates(query, parsed, candidateLimit);
    return {
      candidates: items.map((item, idx) => mapForSaleItemToCandidate(item, idx)),
      sourceLabel,
    };
  }

  // collection mode: use sold listings via legacy wrapper
  const { comps, sourceLabel } = await fetchEbaySoldCandidates(query, parsed, candidateLimit);
  return {
    candidates: comps.map((comp, idx) => mapCompToCandidate(comp, idx)),
    sourceLabel,
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
  const graderGrade = extractGraderAndGrade(item.title);
  const setName =
    brandLine.brand && brandLine.line ? `${brandLine.brand} ${brandLine.line}` : brandLine.brand || brandLine.line;

  return {
    id: item.itemId ?? `forSale-${index}`,
    title: item.title,
    year,
    brand: brandLine.brand,
    line: brandLine.line,
    setName,
    playerName: undefined, // we don't reliably know from title, scoring will still use it if set elsewhere
    cardNumber,
    parallel,
    variant: parallel,
    grader: graderGrade.grader,
    grade: graderGrade.grade,
    searchText: normalizeText(item.title),
    source: "ebayForSale",
    raw: item,
  };
}

function mapCompToCandidate(comp: Comp, index: number): SmartSearchCandidate {
  const year = extractYear(comp.title) ?? undefined;
  const brandLine = extractBrandAndLine(comp.title);
  const cardNumber = extractCardNumber(comp.title) ?? undefined;
  const parallel = extractParallel(comp.title) ?? undefined;
  const graderGrade = extractGraderAndGrade(comp.title);
  const setName =
    brandLine.brand && brandLine.line ? `${brandLine.brand} ${brandLine.line}` : brandLine.brand || brandLine.line;

  return {
    id: `comp-${index}`,
    title: comp.title,
    year,
    brand: brandLine.brand,
    line: brandLine.line,
    setName,
    playerName: undefined,
    cardNumber,
    parallel,
    variant: parallel,
    grader: graderGrade.grader,
    grade: graderGrade.grade,
    searchText: normalizeText(comp.title),
    source: "ebaySold",
    raw: comp,
  };
}

interface CardCatalogRow {
  id: string;
  year?: string | null;
  brand?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  variant?: string | null;
  grader?: string | null;
  grade?: string | null;
  card_number?: string | null;
  search_text?: string | null;
  similarity?: number | null;
}

async function fetchCatalogCandidates(
  queryText: string,
  limit: number,
  supabase?: SupabaseClient
): Promise<SmartSearchCandidate[]> {
  try {
    const client = supabase ?? (await createClient());
    const { data, error } = await client.rpc("search_cards", {
      query_text: queryText,
      result_limit: limit,
    });

    if (error) {
      logDebug("[SmartSearch] catalog search failed", { error: error.message });
      return [];
    }

    const rows = (data ?? []) as CardCatalogRow[];
    return rows.map((row) => mapCatalogRowToCandidate(row));
  } catch (error) {
    logDebug("[SmartSearch] catalog search error", { error });
    return [];
  }
}

function mapCatalogRowToCandidate(row: CardCatalogRow): SmartSearchCandidate {
  const brandLine = extractBrandAndLine(row.set_name ?? "");
  const setName = row.set_name ?? undefined;
  const title = buildCandidateTitle({
    year: row.year ?? undefined,
    brand: row.brand ?? brandLine.brand,
    setName,
    playerName: row.player_name ?? undefined,
    variant: row.variant ?? undefined,
    grader: row.grader ?? undefined,
    grade: row.grade ?? undefined,
    cardNumber: row.card_number ?? undefined,
  });

  return {
    id: row.id,
    title,
    year: row.year ?? undefined,
    brand: row.brand ?? brandLine.brand,
    line: brandLine.line,
    setName,
    playerName: row.player_name ?? undefined,
    cardNumber: row.card_number ?? undefined,
    parallel: row.variant ?? undefined,
    variant: row.variant ?? undefined,
    grader: row.grader ?? undefined,
    grade: row.grade ?? undefined,
    searchText: row.search_text ?? undefined,
    searchSimilarity: row.similarity ?? undefined,
    source: "cardCatalog",
    raw: row,
  };
}

function buildCandidateTitle(input: {
  year?: string;
  brand?: string;
  setName?: string;
  playerName?: string;
  variant?: string;
  grader?: string;
  grade?: string;
  cardNumber?: string;
}): string {
  const parts = [
    input.year,
    input.brand,
    input.setName && input.brand && input.setName.startsWith(input.brand) ? input.setName.replace(input.brand, "").trim() : input.setName,
    input.playerName,
    input.variant,
    input.grader && input.grade ? `${input.grader} ${input.grade}` : undefined,
    input.cardNumber ? `#${String(input.cardNumber).replace(/^#/, "")}` : undefined,
  ].filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function buildQuerySearchText(rawQuery: string, parsed: ParsedSearch): string {
  const parts = [
    parsed.player_name || rawQuery,
    parsed.year,
    parsed.set_name,
    parsed.parallel_type,
    parsed.variation,
    parsed.grade,
    parsed.card_number,
    parsed.serial_number,
    parsed.autograph,
    parsed.relic,
    ...(parsed.unparsed_tokens ?? []),
  ].filter(Boolean);

  return expandSynonyms(parts.join(" "));
}

async function fetchEbayCandidates(
  query: string,
  parsed: ParsedSearch,
  limit: number
): Promise<{ items: ForSaleItem[]; sourceLabel: string }> {
  const strictParams = buildEbayParamsFromParsed(query, parsed, limit);
  const strictResponse = await searchEbayDualSignal(strictParams);
  if (strictResponse.forSale.items?.length) {
    return { items: strictResponse.forSale.items, sourceLabel: "ebayForSale" };
  }

  const relaxedParams = buildEbayParamsFromParsed(query, {
    ...parsed,
    year: undefined,
    grade: undefined,
    card_number: undefined,
    parallel_type: undefined,
  }, limit);
  const relaxedResponse = await searchEbayDualSignal(relaxedParams);
  if (relaxedResponse.forSale.items?.length) {
    return { items: relaxedResponse.forSale.items ?? [], sourceLabel: "ebayForSaleRelaxed" };
  }

  const broadParams = buildEbayParamsFromParsed(query, {
    ...parsed,
    year: undefined,
    grade: undefined,
    card_number: undefined,
    parallel_type: undefined,
    set_name: undefined,
  }, limit);
  const broadResponse = await searchEbayDualSignal(broadParams);
  return { items: broadResponse.forSale.items ?? [], sourceLabel: "ebayForSaleBroad" };
}

async function fetchEbaySoldCandidates(
  query: string,
  parsed: ParsedSearch,
  limit: number
): Promise<{ comps: Comp[]; sourceLabel: string }> {
  const strictParams = buildEbayParamsFromParsed(query, parsed, limit);
  const strictComps = await scrapeEbaySoldListings(strictParams);
  if (strictComps.length) {
    return { comps: strictComps, sourceLabel: "ebaySold" };
  }

  const relaxedParams = buildEbayParamsFromParsed(query, {
    ...parsed,
    year: undefined,
    grade: undefined,
    card_number: undefined,
    parallel_type: undefined,
  }, limit);
  const relaxedComps = await scrapeEbaySoldListings(relaxedParams);
  if (relaxedComps.length) {
    return { comps: relaxedComps, sourceLabel: "ebaySoldRelaxed" };
  }

  const broadParams = buildEbayParamsFromParsed(query, {
    ...parsed,
    year: undefined,
    grade: undefined,
    card_number: undefined,
    parallel_type: undefined,
    set_name: undefined,
  }, limit);
  const broadComps = await scrapeEbaySoldListings(broadParams);
  return { comps: broadComps, sourceLabel: "ebaySoldBroad" };
}
