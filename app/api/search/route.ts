import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSearchQuery } from "@/lib/ebay";
import { searchEbayDualSignal, buildSoldListingsUrl } from "@/lib/ebay/index";
import { getMarketCmvForQuery } from "@/lib/market-discount";
import { buildCompEvaluation, convertEvaluatedCompToApiComp } from "@/lib/comps/evaluation";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? 0;
}

function summarizeForSale(items: Array<{ price: number }>): {
  count: number;
  low: number;
  median: number;
  high: number;
} {
  if (!items.length) {
    return { count: 0, low: 0, median: 0, high: 0 };
  }
  const prices = items.map((item) => item.price).sort((a, b) => a - b);
  return {
    count: items.length,
    low: prices[0] ?? 0,
    median: median(prices),
    high: prices[prices.length - 1] ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const player = searchParams.get("player");
  const year = searchParams.get("year") || undefined;
  const set = searchParams.get("set") || undefined;
  const game = searchParams.get("game") || undefined;
  const sport = searchParams.get("sport") || undefined;
  const grade = searchParams.get("grade") || undefined;
  const cardNumber = searchParams.get("card_number") || undefined;
  const parallelType = searchParams.get("parallel_type") || undefined;
  const serialNumber = searchParams.get("serial_number") || undefined;
  const variation = searchParams.get("variation") || undefined;
  const autograph = searchParams.get("autograph") || undefined;
  const relic = searchParams.get("relic") || undefined;
  const cardId = searchParams.get("card_id");

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
    game,
    sport,
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
    let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
    let userId: string | null = null;

    // Bypass auth and limits in test mode
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing search limits");
    } else {
      // Check user auth and limits
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;

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

    if (result.status === "failed" && result.reason === "api_error") {
      return NextResponse.json(
        {
          error: "ebay_connection_error",
          message: "eBay connection error",
          fallback_url: buildSoldListingsUrl(searchParamsObj),
        },
        { status: 503 }
      );
    }

    if (result.status === "failed") {
      if (useNewFormat) {
        return NextResponse.json(result);
      }
      return NextResponse.json({
        status: "failed",
        reason: result.reason ?? "no_valid_listings",
        query: result.query,
        forSale: result.forSale,
        comps: [],
        stats: {
          count: 0,
          cmv: null,
          avg: 0,
          low: 0,
          high: 0,
        },
      });
    }

    const market = await getMarketCmvForQuery({
      query: {
        ...searchParamsObj,
        limit: 25,
      },
      activeItemsOverride: result.forSale.items,
    });

    const compEvaluation = buildCompEvaluation({
      items: result.forSale.items,
      query: {
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
      },
      passUsed: result.passUsed,
      marketMethod: market.cmv.method,
      soldCount: market.cmv.soldCount,
    });

    const includedEvaluatedComps = [
      ...compEvaluation.exactComps,
      ...compEvaluation.similarComps,
      ...compEvaluation.supportComps,
    ];
    const includedForSaleItems = includedEvaluatedComps.map((comp) => comp.item);
    const forSaleStats = summarizeForSale(includedForSaleItems);
    const filteredForSale = {
      ...result.forSale,
      count: forSaleStats.count,
      low: forSaleStats.low,
      median: forSaleStats.median,
      high: forSaleStats.high,
      items: includedForSaleItems,
    };
    const fallbackCompMode =
      (result.passUsed === "broad" || result.passUsed === "minimal") &&
      market.cmv.method !== "sold_median";
    const directionalMidpointFromEstimate =
      result.estimatedSaleRange.pricingAvailable && result.estimatedSaleRange.estimatedSaleRange
        ? Math.round(
            ((result.estimatedSaleRange.estimatedSaleRange.low +
              result.estimatedSaleRange.estimatedSaleRange.high) /
              2) *
              100
          ) / 100
        : null;
    const directionalMidpoint =
      compEvaluation.midpoint ?? directionalMidpointFromEstimate ?? null;
    const combinedDisclaimers = Array.from(
      new Set([
        ...result.disclaimers,
        ...compEvaluation.disclaimerMessages,
        ...(fallbackCompMode
          ? [
              "Fallback search results were needed and are treated as directional support only.",
            ]
          : []),
      ])
    );

    // New format: Return full pricing response
    if (useNewFormat) {
      logDebug(
        `📊 forSale=${result.forSale.count}, estimate=${result.estimatedSaleRange.pricingAvailable ? "available" : "unavailable"}`
      );
      return NextResponse.json({
        ...result,
        forSale: filteredForSale,
        disclaimers: combinedDisclaimers,
        _marketDiscount: market.cmv,
        _compEvaluation: {
          exactComps: compEvaluation.exactComps.map(convertEvaluatedCompToApiComp),
          similarComps: compEvaluation.similarComps.map(convertEvaluatedCompToApiComp),
          supportComps: compEvaluation.supportComps.map(convertEvaluatedCompToApiComp),
          rejectedComps: compEvaluation.rejectedComps.map(convertEvaluatedCompToApiComp),
          confidenceScore: compEvaluation.confidenceScore,
          confidenceBand: compEvaluation.confidenceBand,
          confidenceExplanation: compEvaluation.confidenceExplanation,
          valuationSource: compEvaluation.valuationSource,
          usedCompCount: compEvaluation.usedCompCount,
          exactCompCount: compEvaluation.exactCompCount,
          similarCompCount: compEvaluation.similarCompCount,
          supportCompCount: compEvaluation.supportCompCount,
          rejectedCompCount: compEvaluation.rejectedCompCount,
          spreadPct: compEvaluation.spreadPct,
          rangeLow: compEvaluation.rangeLow,
          rangeHigh: compEvaluation.rangeHigh,
          midpoint: compEvaluation.midpoint,
          disclaimerStates: compEvaluation.disclaimerStates,
          disclaimerMessages: compEvaluation.disclaimerMessages,
          includeReasonSummary: compEvaluation.includeReasonSummary,
          excludeReasonSummary: compEvaluation.excludeReasonSummary,
        },
      });
    }

    // Legacy format: Convert to old response shape
    const comps = includedEvaluatedComps.map((comp) =>
      convertEvaluatedCompToApiComp(comp)
    );

    // Calculate CMV from sold-first/listing-adjusted discount model.
    let cmv =
      fallbackCompMode
        ? null
        : market.cmv.cmv ?? compEvaluation.midpoint ?? filteredForSale.median;
    let estimatedLow = 0;
    let estimatedHigh = 0;

    if (
      !fallbackCompMode &&
      market.cmv.rangeLow !== null &&
      market.cmv.rangeHigh !== null
    ) {
      estimatedLow = market.cmv.rangeLow;
      estimatedHigh = market.cmv.rangeHigh;
    } else if (
      compEvaluation.rangeLow !== null &&
      compEvaluation.rangeHigh !== null
    ) {
      estimatedLow = compEvaluation.rangeLow;
      estimatedHigh = compEvaluation.rangeHigh;
    } else if (result.estimatedSaleRange.pricingAvailable) {
      const { low, high } = result.estimatedSaleRange.estimatedSaleRange;
      if (market.cmv.cmv === null && !fallbackCompMode) {
        cmv = Math.round(((low + high) / 2) * 100) / 100;
      }
      estimatedLow = low;
      estimatedHigh = high;
    }

    if (fallbackCompMode && directionalMidpoint !== null) {
      cmv = null;
      estimatedLow = compEvaluation.rangeLow ?? estimatedLow;
      estimatedHigh = compEvaluation.rangeHigh ?? estimatedHigh;
    }

    const avg = filteredForSale.count > 0
      ? Math.round((comps.reduce((sum, c) => sum + c.price, 0) / comps.length) * 100) / 100
      : 0;

    const query = buildSearchQuery(searchParamsObj);
    logDebug(`📊 Found ${comps.length} listings for query: "${query}"`);

    if (cardId && supabase && userId) {
      const cmvValue =
        typeof cmv === "number" && Number.isFinite(cmv) && cmv > 0
          ? cmv
          : null;

      if (cmvValue !== null) {
        const cmvConfidence =
          market.cmv.method === "insufficient_data"
            ? "unavailable"
            : market.cmv.confidence;
        const { error: updateError } = await supabase
          .from("collection_items")
          .update({
            estimated_cmv: cmvValue,
            est_cmv: cmvValue,
            cmv_confidence: cmvConfidence,
            cmv_last_updated: new Date().toISOString(),
          })
          .eq("id", cardId)
          .eq("user_id", userId);

        if (updateError) {
          logDebug("⚠️ Failed to persist CMV for card", {
            cardId,
            message: updateError.message,
          });
        } else {
          logDebug("✅ Persisted CMV for card", { cardId, cmv: cmvValue });
        }
      }
    }

    // Return legacy format with new fields for frontend migration
    return NextResponse.json({
      comps,
      stats: {
        cmv, // Estimated sale price (midpoint of range)
        avg,
        low: filteredForSale.low,
        high: filteredForSale.high,
        count: filteredForSale.count,
      },
      query,
      // New fields for frontend migration
      _forSale: filteredForSale,
      _estimatedSaleRange: result.estimatedSaleRange,
      _disclaimers: combinedDisclaimers,
      _passUsed: result.passUsed,
      _totalPasses: result.totalPasses,
      _marketDiscount: market.cmv,
      _compEvaluation: {
        exactComps: compEvaluation.exactComps.map(convertEvaluatedCompToApiComp),
        similarComps: compEvaluation.similarComps.map(convertEvaluatedCompToApiComp),
        supportComps: compEvaluation.supportComps.map(convertEvaluatedCompToApiComp),
        rejectedComps: compEvaluation.rejectedComps.map(convertEvaluatedCompToApiComp),
        confidenceScore: compEvaluation.confidenceScore,
        confidenceBand: compEvaluation.confidenceBand,
        confidenceExplanation: compEvaluation.confidenceExplanation,
        valuationSource: compEvaluation.valuationSource,
        usedCompCount: compEvaluation.usedCompCount,
        exactCompCount: compEvaluation.exactCompCount,
        similarCompCount: compEvaluation.similarCompCount,
        supportCompCount: compEvaluation.supportCompCount,
        rejectedCompCount: compEvaluation.rejectedCompCount,
        spreadPct: compEvaluation.spreadPct,
        rangeLow: compEvaluation.rangeLow,
        rangeHigh: compEvaluation.rangeHigh,
        midpoint: compEvaluation.midpoint,
        disclaimerStates: compEvaluation.disclaimerStates,
        disclaimerMessages: compEvaluation.disclaimerMessages,
        includeReasonSummary: compEvaluation.includeReasonSummary,
        excludeReasonSummary: compEvaluation.excludeReasonSummary,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("blocked") ||
      lowerMessage.includes("rate limit") ||
      lowerMessage.includes("ebay_client_id") ||
      lowerMessage.includes("ebay_client_secret")
    ) {
      return NextResponse.json(
        {
          error: "ebay_connection_error",
          message: "eBay connection error",
          fallback_url: buildSoldListingsUrl(searchParamsObj),
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "ebay_connection_error", message: "eBay connection error" },
      { status: 500 }
    );
  }
}
