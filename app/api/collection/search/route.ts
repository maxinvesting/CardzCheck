import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { parseSmartSearch } from "@/lib/smart-search-parser";
import {
  scrapeEbaySoldListings,
  calculateStats,
  buildSearchQuery,
  buildSearchUrl,
} from "@/lib/ebay";

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

    const parsed = parseSmartSearch(q);

    // Always fall back to the raw query if parser couldn't find a player.
    const player = parsed.player_name?.trim() ? parsed.player_name : q;

    const searchParamsObj = {
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
    };

    const comps = await scrapeEbaySoldListings(searchParamsObj);
    const stats = calculateStats(comps);
    const query = buildSearchQuery(searchParamsObj);

    return NextResponse.json({
      comps,
      stats,
      query,
      parsed,
    });
  } catch (error) {
    console.error("Collection search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("blocked")) {
      const parsed = parseSmartSearch(q);
      const player = parsed.player_name?.trim() ? parsed.player_name : q;
      const searchParamsObj = {
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
      };

      return NextResponse.json(
        {
          error: "ebay_blocked",
          message,
          fallback_url: buildSearchUrl(searchParamsObj),
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Failed to search", message },
      { status: 500 }
    );
  }
}

