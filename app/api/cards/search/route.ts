import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  parseCardSearchPayload,
  runCardSearch,
  type CardCatalogRow,
} from "@/lib/cards/search";
import { isTestMode } from "@/lib/test-mode";

const BASE_QUERY_LIMIT = 500;

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCardSearchPayload(payload);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, missing: parsed.missing },
      { status: 400 }
    );
  }

  const { filters, limit, relaxOptional } = parsed.value;

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
      };
      const result = runCardSearch([mock], filters, {
        relaxOptional,
        limit: Math.max(limit, 1),
      });
      return NextResponse.json({
        results: result.results,
        count: result.results.length,
        relaxed: result.relaxed,
        canRelax: result.canRelax,
      });
    }

    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await createServiceClient()
      : await createClient();
    const queryText = [
      filters.playerId,
      filters.setSlug,
      filters.year,
      filters.parallel,
      filters.grader,
      filters.grade,
      filters.cardNumber,
    ]
      .filter(Boolean)
      .join(" ");

    const { data: rpcData, error: rpcError } = await supabase.rpc("search_cards", {
      query_text: queryText,
      result_limit: BASE_QUERY_LIMIT,
    });

    let rows = (rpcData ?? []) as CardCatalogRow[];
    if (rpcError) {
      console.error("Card search RPC error:", rpcError);
      const rpcMessage = rpcError.message?.toLowerCase() ?? "";
      if (isMissingCardsTable(rpcMessage)) {
        const fallback = buildFallbackRows(filters);
        const result = runCardSearch(fallback, filters, {
          relaxOptional,
          limit,
        });
        return NextResponse.json({
          results: result.results,
          count: result.results.length,
          relaxed: result.relaxed,
          canRelax: result.canRelax,
        });
      }
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .ilike("player_name", `%${filters.playerId}%`)
        .ilike("set_name", `%${filters.setSlug}%`)
        .limit(BASE_QUERY_LIMIT);

      if (error) {
        console.error("Card search query error:", error);
        const errorMessage = error.message?.toLowerCase() ?? "";
        if (isMissingCardsTable(errorMessage)) {
          const fallback = buildFallbackRows(filters);
          const result = runCardSearch(fallback, filters, {
            relaxOptional,
            limit,
          });
          return NextResponse.json({
            results: result.results,
            count: result.results.length,
            relaxed: result.relaxed,
            canRelax: result.canRelax,
          });
        }
        return NextResponse.json(
          {
            error:
              process.env.NODE_ENV !== "production"
                ? `Failed to search cards: ${error.message}`
                : "Failed to search cards",
          },
          { status: 500 }
        );
      }

      rows = (data ?? []) as CardCatalogRow[];
    }

    const playerNeedle = filters.playerId.toLowerCase();
    const setNeedle = normalizeSetName(filters.setSlug);
    const requiredFiltered = rows.filter((row) => {
      const player = (row.player_name ?? "").toLowerCase();
      const setName = normalizeSetName(row.set_name ?? "");
      if (!setName || setName !== setNeedle) return false;
      return player.includes(playerNeedle);
    });
    const result = runCardSearch(requiredFiltered, filters, {
      relaxOptional,
      limit,
    });

    return NextResponse.json({
      results: result.results,
      count: result.results.length,
      relaxed: result.relaxed,
      canRelax: result.canRelax,
    });
  } catch (error) {
    console.error("Card search error:", error);
    return NextResponse.json(
      { error: "Failed to search cards" },
      { status: 500 }
    );
  }
}

function isMissingCardsTable(message: string): boolean {
  return (
    message.includes("could not find the table") ||
    (message.includes("does not exist") && message.includes("cards"))
  );
}

function buildFallbackRows(filters: {
  playerId: string;
  setSlug: string;
  year?: string;
  parallel?: string;
  grader?: string;
  grade?: string;
  cardNumber?: string;
}): CardCatalogRow[] {
  return [
    {
      id: `fallback-${filters.playerId}-${filters.setSlug}`.replace(/\s+/g, "-"),
      year: filters.year ?? null,
      brand: null,
      set_name: filters.setSlug,
      player_name: filters.playerId,
      variant: filters.parallel ?? null,
      grader: filters.grader ?? null,
      grade: filters.grade ?? null,
      card_number: filters.cardNumber ?? null,
    },
  ];
}

function normalizeSetName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
