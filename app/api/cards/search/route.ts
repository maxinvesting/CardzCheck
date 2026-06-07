import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  parseCardSearchPayload,
  runCardSearch,
  type CardCatalogRow,
  type CardSearchFilters,
} from "@/lib/cards/search";
import { normalizeCardNumber } from "@/lib/cards/format";
import { isTestMode } from "@/lib/test-mode";
import { buildSearchQuery } from "@/lib/ebay";
import { searchBrowseAPIWithFallbacks } from "@/lib/ebay/browse-api";
import {
  extractCardNumber,
  extractGraderAndGrade,
  extractParallel,
  extractYear,
} from "@/lib/smartSearch/normalize";
import type { ForSaleItem } from "@/lib/ebay/types";

const BASE_QUERY_LIMIT = 500;
const CARD_RESOLVER_DEBUG =
  process.env.CARD_RESOLVER_DEBUG === "1" || process.env.NODE_ENV !== "production";

type SourceStatus = {
  used: boolean;
  available: boolean;
  source: string;
  reason?: string;
  query?: unknown;
  returned?: number;
};

type ResolverSources = {
  internalCatalog: SourceStatus;
  ebayBrowse: SourceStatus;
  psaLookup: SourceStatus;
  cmvComps: SourceStatus;
  staleLocalTable: SourceStatus;
};

export async function POST(request: NextRequest) {
  // Require a signed-in user outside test mode — this resolver can fan out to
  // the external eBay Browse API, so leaving it open invites abuse. The
  // test-mode mock path below stays usable for local development.
  if (!isTestMode()) {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  resolverLog("request payload", payload);

  const parsed = parseCardSearchPayload(payload);
  if (!parsed.ok) {
    resolverLog("request rejected", parsed);
    return NextResponse.json(
      { error: parsed.error, missing: parsed.missing },
      { status: 400 }
    );
  }

  const { filters, limit, relaxOptional } = parsed.value;
  const sources = buildInitialSourceStatus();

  try {
    if (isTestMode()) {
      const mock: CardCatalogRow = {
        id: "test-card",
        player_name: filters.playerId,
        set_name: filters.setSlug,
        year: filters.year ?? null,
        variant: filters.parallel ?? null,
        grader: filters.grader ?? null,
        grade: filters.grade ?? null,
        card_number: filters.cardNumber ?? null,
        source: "test",
      };
      const result = runCardSearch([mock], filters, {
        relaxOptional,
        limit: Math.max(limit, 1),
      });
      logResolverResult(result);
      return NextResponse.json({
        results: result.results,
        count: result.results.length,
        relaxed: result.relaxed,
        canRelax: result.canRelax,
        sources,
        diagnostics: result.diagnostics,
      });
    }

    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await createServiceClient()
      : await createClient();

    const catalogRows = await fetchInternalCatalogRows(supabase, filters, sources);
    resolverLog(
      "internal candidates before filtering",
      catalogRows.map(summarizeCandidateForLog)
    );

    let rows = catalogRows;
    let result = runCardSearch(rows, filters, { relaxOptional, limit });
    logResolverResult(result);

    if (shouldTryExternalFallback(result.results)) {
      const externalRows = await fetchExternalRows(filters, sources);
      resolverLog(
        "external candidates before filtering",
        externalRows.map(summarizeCandidateForLog)
      );
      if (externalRows.length > 0) {
        rows = dedupeRows([...catalogRows, ...externalRows]);
        result = runCardSearch(rows, filters, { relaxOptional, limit });
        logResolverResult(result);
      }
    }

    resolverLog("source status", sources);

    return NextResponse.json({
      results: result.results,
      count: result.results.length,
      relaxed: result.relaxed,
      canRelax: result.canRelax,
      sources,
      diagnostics: result.diagnostics,
      externalLookupUnavailable:
        sources.ebayBrowse.used && !sources.ebayBrowse.available,
    });
  } catch (error) {
    console.error("Card search error:", error);
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}

async function fetchInternalCatalogRows(
  supabase: Awaited<ReturnType<typeof createClient>> | Awaited<ReturnType<typeof createServiceClient>>,
  filters: CardSearchFilters,
  sources: ResolverSources
): Promise<CardCatalogRow[]> {
  const rows = new Map<string, CardCatalogRow>();
  const rpcQueries = uniqueStrings([
    buildCatalogQueryText(filters, "full"),
    buildCatalogQueryText(filters, "core"),
  ]);

  for (const queryText of rpcQueries) {
    if (!queryText) continue;
    const rpcArgs = {
      query_text: queryText,
      result_limit: BASE_QUERY_LIMIT,
    };
    sources.internalCatalog.used = true;
    sources.internalCatalog.query = {
      rpc: "search_cards",
      args: rpcArgs,
    };
    resolverLog("database query", sources.internalCatalog.query);
    const { data, error } = await supabase.rpc("search_cards", rpcArgs);
    if (error) {
      resolverLog("database query error", {
        rpc: "search_cards",
        error: error.message,
      });
      if (isMissingCardsTable(error.message?.toLowerCase() ?? "")) {
        sources.internalCatalog.available = false;
        sources.internalCatalog.reason = error.message;
        return [];
      }
      continue;
    }
    sources.internalCatalog.available = true;
    for (const row of ((data ?? []) as CardCatalogRow[]).map(markCatalogRow)) {
      rows.set(row.id, row);
    }
  }

  const playerPattern = `%${escapeIlikePattern(filters.playerId)}%`;
  const fallbackQuery = {
    table: "cards",
    select: "*",
    filters: [{ column: "player_name", op: "ilike", value: playerPattern }],
    limit: BASE_QUERY_LIMIT,
  };
  sources.internalCatalog.used = true;
  sources.internalCatalog.query = fallbackQuery;
  resolverLog("database query", fallbackQuery);

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .ilike("player_name", playerPattern)
    .limit(BASE_QUERY_LIMIT);

  if (error) {
    resolverLog("database query error", {
      table: "cards",
      error: error.message,
    });
    if (isMissingCardsTable(error.message?.toLowerCase() ?? "")) {
      sources.internalCatalog.available = false;
      sources.internalCatalog.reason = error.message;
    }
  } else {
    sources.internalCatalog.available = true;
    for (const row of ((data ?? []) as CardCatalogRow[]).map(markCatalogRow)) {
      rows.set(row.id, row);
    }
  }

  sources.internalCatalog.returned = rows.size;
  return Array.from(rows.values());
}

async function fetchExternalRows(
  filters: CardSearchFilters,
  sources: ResolverSources
): Promise<CardCatalogRow[]> {
  sources.ebayBrowse.used = true;

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    sources.ebayBrowse.available = false;
    sources.ebayBrowse.reason = "EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are not configured";
    resolverLog("external lookup unavailable", sources.ebayBrowse.reason);
    return [];
  }

  const grade = [filters.grader, filters.grade].filter(Boolean).join(" ") || undefined;
  const params = {
    player: filters.playerId,
    year: filters.year,
    set: filters.setSlug,
    parallelType: filters.parallel,
    grade,
    cardNumber: filters.cardNumber,
    limit: 25,
  };
  sources.ebayBrowse.query = {
    api: "eBay Browse API",
    params,
    query: buildSearchQuery(params),
  };
  resolverLog("external api query", sources.ebayBrowse.query);

  try {
    const result = await searchBrowseAPIWithFallbacks(params);
    sources.ebayBrowse.available = true;
    sources.ebayBrowse.returned = result.items.length;
    sources.ebayBrowse.reason = result.passUsed
      ? `returned via ${result.passUsed} pass`
      : undefined;
    return result.items.map((item, index) => mapEbayItemToCatalogRow(item, filters, index));
  } catch (error) {
    sources.ebayBrowse.available = false;
    sources.ebayBrowse.reason =
      error instanceof Error ? error.message : "External lookup failed";
    resolverLog("external lookup unavailable", sources.ebayBrowse.reason);
    return [];
  }
}

function shouldTryExternalFallback(results: Array<{ confidence?: string }>): boolean {
  if (results.length === 0) return true;
  return !results.some(
    (result) => result.confidence === "Exact" || result.confidence === "Strong"
  );
}

function mapEbayItemToCatalogRow(
  item: ForSaleItem,
  filters: CardSearchFilters,
  index: number
): CardCatalogRow {
  const title = item.title || "";
  const parsedGrade = extractGraderAndGrade(title);
  return {
    id: `ebay-${item.itemId ?? index}`,
    title,
    year: extractYear(title) ?? filters.year ?? null,
    brand: null,
    set_name: filters.setSlug,
    player_name: filters.playerId,
    variant: extractParallel(title) ?? null,
    grader: parsedGrade.grader ?? null,
    grade: parsedGrade.grade ?? null,
    card_number: normalizeCardNumber(extractCardNumber(title)) ?? filters.cardNumber ?? null,
    image_url: item.image ?? null,
    user_image_url: null,
    source: "ebayBrowse",
  };
}

function buildCatalogQueryText(
  filters: CardSearchFilters,
  mode: "full" | "core"
): string {
  const grade = [filters.grader, filters.grade].filter(Boolean).join(" ");
  const parts =
    mode === "core"
      ? [filters.playerId, filters.setSlug]
      : [
          filters.playerId,
          filters.setSlug,
          filters.year,
          filters.parallel,
          grade,
          filters.cardNumber,
        ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function markCatalogRow(row: CardCatalogRow): CardCatalogRow {
  return {
    ...row,
    source: row.source ?? "cardCatalog",
  };
}

function dedupeRows(rows: CardCatalogRow[]): CardCatalogRow[] {
  const seen = new Map<string, CardCatalogRow>();
  for (const row of rows) {
    seen.set(`${row.source ?? "cardCatalog"}:${row.id}`, row);
  }
  return Array.from(seen.values());
}

function summarizeCandidateForLog(row: CardCatalogRow) {
  return {
    id: row.id,
    source: row.source ?? "cardCatalog",
    title: row.title,
    year: row.year,
    player_name: row.player_name,
    set_name: row.set_name,
    card_number: row.card_number,
    variant: row.variant,
    grader: row.grader,
    grade: row.grade,
    similarity: row.similarity,
  };
}

function logResolverResult(result: ReturnType<typeof runCardSearch>) {
  resolverLog("resolver returned candidates", {
    count: result.results.length,
    candidates: result.results.map((candidate) => ({
      id: candidate.id,
      source: candidate.source,
      confidence: candidate.confidence,
      reason: candidate.reason,
      reasonCodes: candidate.reasonCodes,
      matchPass: candidate.matchPass,
      score: candidate.score,
    })),
  });
  for (const rejection of result.rejections) {
    resolverLog("resolver rejection", rejection);
  }
}

function buildInitialSourceStatus(): ResolverSources {
  return {
    internalCatalog: {
      used: false,
      available: true,
      source: "public.cards via search_cards RPC plus cards table fallback",
    },
    ebayBrowse: {
      used: false,
      available: false,
      source: "eBay Browse API",
      reason: "not needed yet",
    },
    psaLookup: {
      used: false,
      available: false,
      source: "PSA/card lookup",
      reason: "not connected to CardPicker Add Card search flow",
    },
    cmvComps: {
      used: false,
      available: false,
      source: "CardzCheck CMV/comps pipeline",
      reason: "not used for card identity resolution in this endpoint",
    },
    staleLocalTable: {
      used: false,
      available: false,
      source: "legacy/stale local table",
      reason: "not used",
    },
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function isMissingCardsTable(message: string): boolean {
  return (
    message.includes("could not find the table") ||
    (message.includes("does not exist") && message.includes("cards"))
  );
}

function resolverLog(message: string, data?: unknown) {
  if (!CARD_RESOLVER_DEBUG) return;
  if (data === undefined) {
    console.info(`[CardResolver] ${message}`);
  } else {
    console.info(`[CardResolver] ${message}`, data);
  }
}
