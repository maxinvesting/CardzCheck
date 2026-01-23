import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeEbaySoldListings, calculateStats, buildSearchQuery } from "@/lib/ebay";
import { LIMITS } from "@/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const player = searchParams.get("player");
  const year = searchParams.get("year") || undefined;
  const set = searchParams.get("set") || undefined;
  const grade = searchParams.get("grade") || undefined;

  if (!player) {
    return NextResponse.json(
      { error: "Player name is required" },
      { status: 400 }
    );
  }

  try {
    // Check user auth and limits
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Get user record
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (userError && userError.code !== "PGRST116") {
        console.error("Error fetching user:", userError);
      }

      // Check free search limit
      if (userData && !userData.is_paid) {
        if (userData.free_searches_used >= LIMITS.FREE_SEARCHES) {
          return NextResponse.json(
            {
              error: "limit_reached",
              type: "search",
              message: "You've used all 3 free searches. Upgrade for unlimited access.",
            },
            { status: 403 }
          );
        }

        // Increment search count
        await supabase
          .from("users")
          .update({ free_searches_used: userData.free_searches_used + 1 })
          .eq("id", user.id);
      }
    }

    // Scrape eBay sold listings
    const comps = await scrapeEbaySoldListings({ player, year, set, grade });
    const stats = calculateStats(comps);
    const query = buildSearchQuery({ player, year, set, grade });

    return NextResponse.json({
      comps,
      stats,
      query,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
