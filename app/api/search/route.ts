import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeEbaySoldListings, calculateStats, buildSearchQuery, buildSearchUrl } from "@/lib/ebay";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const player = searchParams.get("player");
  const year = searchParams.get("year") || undefined;
  const set = searchParams.get("set") || undefined;
  const grade = searchParams.get("grade") || undefined;
  const cardNumber = searchParams.get("card_number") || undefined;
  const parallelType = searchParams.get("parallel_type") || undefined;
  const serialNumber = searchParams.get("serial_number") || undefined;
  const variation = searchParams.get("variation") || undefined;
  const autograph = searchParams.get("autograph") || undefined;
  const relic = searchParams.get("relic") || undefined;

  if (!player) {
    return NextResponse.json(
      { error: "Player name is required" },
      { status: 400 }
    );
  }

  // Build search params object outside try block so it's accessible in catch for fallback URL
  const searchParamsObj = {
    player,
    year,
    set,
    grade,
    cardNumber,
    parallelType,
    serialNumber,
    variation,
    autograph,
    relic,
  };

  try {
    // Bypass auth and limits in test mode
    if (isTestMode()) {
      console.log("🧪 TEST MODE: Bypassing search limits");
    } else {
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
    }

    // Scrape eBay sold listings
    console.log("🔍 Searching eBay with params:", searchParamsObj);

    const comps = await scrapeEbaySoldListings(searchParamsObj);
    const stats = calculateStats(comps);
    const query = buildSearchQuery(searchParamsObj);

    console.log(`📊 Found ${comps.length} comps for query: "${query}"`);

    return NextResponse.json({
      comps,
      stats,
      query,
    });
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("blocked")) {
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
