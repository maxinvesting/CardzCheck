// Deprecated: use POST /api/cards/search with CardPicker.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { smartSearch } from "@/lib/smartSearch";

/**
 * Watchlist Smart Search API
 * Parses a query string and returns ranked candidates grouped into Exact / Close buckets.
 * Used for adding cards to watchlist with strict matching on locked fields.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const broaden = request.nextUrl.searchParams.get("broaden") === "true";
  const debug = request.nextUrl.searchParams.get("debug") === "1" && process.env.NODE_ENV !== "production";

  if (!q) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    // Bypass auth in test mode
    let supabase: Awaited<ReturnType<typeof createClient>> | undefined;
    if (!isTestMode()) {
      supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await smartSearch(q, "watchlist", {
      limit: 20,
      source: "ebayWatchlist",
      broaden,
      debug,
      supabase,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Watchlist search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to search", message },
      { status: 500 }
    );
  }
}
