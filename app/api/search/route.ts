import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSearchQuery, buildSearchUrl } from "@/lib/ebay";
import { searchEbayDualSignal, buildSoldListingsUrl } from "@/lib/ebay/index";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

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

  // Check for response format
  const format = searchParams.get("format");
  const useNewFormat = format === "v2" || format === "dual";

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
      logDebug("🧪 TEST MODE: Bypassing search limits");
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

    logDebug("🔍 Searching eBay with params:", searchParamsObj);

    // Get data from eBay
    const result = await searchEbayDualSignal(searchParamsObj);

    // New format: Return full pricing response
    if (useNewFormat) {
      logDebug(
        `📊 forSale=${result.forSale.count}, estimate=${result.estimatedSaleRange.pricingAvailable ? "available" : "unavailable"}`
      );
      return NextResponse.json(result);
    }

    // Legacy format: Convert to old response shape
    const comps = result.forSale.items.map(item => ({
      title: item.title,
      price: item.price,
      date: new Date().toISOString().split("T")[0],
      link: item.url,
      image: item.image,
      source: "ebay" as const,
    }));

    // Calculate CMV from estimated sale range if available
    let cmv = result.forSale.median;
    let estimatedLow = 0;
    let estimatedHigh = 0;

    if (result.estimatedSaleRange.pricingAvailable) {
      const { low, high } = result.estimatedSaleRange.estimatedSaleRange;
      cmv = Math.round(((low + high) / 2) * 100) / 100;
      estimatedLow = low;
      estimatedHigh = high;
    }

    const avg = result.forSale.count > 0
      ? Math.round((comps.reduce((sum, c) => sum + c.price, 0) / comps.length) * 100) / 100
      : 0;

    const query = buildSearchQuery(searchParamsObj);
    logDebug(`📊 Found ${comps.length} listings for query: "${query}"`);

    // Return legacy format with new fields for frontend migration
    return NextResponse.json({
      comps,
      stats: {
        cmv, // Estimated sale price (midpoint of range)
        avg,
        low: result.forSale.low,
        high: result.forSale.high,
        count: result.forSale.count,
      },
      query,
      // New fields for frontend migration
      _forSale: result.forSale,
      _estimatedSaleRange: result.estimatedSaleRange,
      _disclaimers: result.disclaimers,
    });
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("blocked") || message.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        {
          error: "ebay_blocked",
          message,
          fallback_url: buildSoldListingsUrl(searchParamsObj),
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
