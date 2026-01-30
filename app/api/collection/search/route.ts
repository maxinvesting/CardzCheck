import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { buildSearchUrl, calculateStats, buildSearchQuery } from "@/lib/ebay";
import { smartSearch } from "@/lib/smartSearch";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!q) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    // Bypass auth in test mode
    if (!isTestMode()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const smart = await smartSearch(q, "collection", {
      limit: 30,
      source: "ebayCollection",
    });

    const comps = smart.rawComps ?? [];
    const stats = calculateStats(comps);

    // Build legacy-style query string from the parsed/locked view for compatibility & display
    const primary = smart.parsed.original;
    const searchParamsObj = {
      player: primary.player_name?.trim() ? primary.player_name : q,
      year: primary.year,
      set: primary.set_name,
      grade: primary.grade,
      cardNumber: primary.card_number,
      parallelType: primary.parallel_type,
      serialNumber: primary.serial_number,
      variation: primary.variation,
      autograph: primary.autograph,
      relic: primary.relic,
      keywords: primary.unparsed_tokens,
    };
    const query = buildSearchQuery(searchParamsObj);

    return NextResponse.json({
      comps,
      stats,
      query,
      parsed: primary,
      smartSearch: smart,
    });
  } catch (error) {
    console.error("Collection search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    // We no longer have a specific blocked detection from smartSearch, but keep legacy shape
    return NextResponse.json(
      { error: "Failed to search", message },
      { status: 500 }
    );
  }
}

