import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { scrapeEbaySoldListings, calculateStats } from "@/lib/ebay";
import { logDebug, redactId } from "@/lib/logging";
import type { WatchlistItem, PriceHistoryEntry } from "@/types";

// Maximum number of items to process per cron run
const BATCH_SIZE = 50;

// Maximum price history entries to keep per item
const MAX_PRICE_HISTORY = 30;

/**
 * POST /api/watchlist/update-prices
 *
 * Cron endpoint to update watchlist prices daily.
 * Protected by CRON_SECRET header verification.
 *
 * This endpoint:
 * 1. Fetches watchlist items that haven't been checked in 24+ hours
 * 2. For each item, scrapes eBay for current sold listings
 * 3. Updates last_price, last_checked, and appends to price_history
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error("Unauthorized cron request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServiceClient();

    // Get items that need updating (not checked in 24+ hours)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: items, error: fetchError } = await supabase
      .from("watchlist")
      .select("*")
      .or(`last_checked.is.null,last_checked.lt.${twentyFourHoursAgo.toISOString()}`)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("Error fetching watchlist items:", fetchError);
      throw fetchError;
    }

    if (!items || items.length === 0) {
      logDebug("No watchlist items need updating");
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No items need updating",
      });
    }

    logDebug(`Processing ${items.length} watchlist items`);

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each item
    for (const item of items as WatchlistItem[]) {
      results.processed++;

      try {
        // Build search params from watchlist item
        const comps = await scrapeEbaySoldListings({
          player: item.player_name,
          year: item.year || undefined,
          set: item.set_brand || undefined,
          grade: item.condition || undefined,
          parallelType: item.parallel_variant || undefined,
          cardNumber: item.card_number || undefined,
        });

        // Calculate stats to get CMV (median price)
        const stats = calculateStats(comps);

        // Only update if we got results
        if (stats.count > 0 && stats.cmv !== null) {
          const now = new Date().toISOString();
          const newPrice = stats.cmv;

          // Build updated price history
          const currentHistory: PriceHistoryEntry[] = item.price_history || [];
          const newHistory: PriceHistoryEntry[] = [
            ...currentHistory,
            { price: newPrice, date: now.split("T")[0] },
          ].slice(-MAX_PRICE_HISTORY); // Keep only last 30 entries

          // Update the watchlist item
          const { error: updateError } = await supabase
            .from("watchlist")
            .update({
              last_price: newPrice,
              last_checked: now,
              price_history: newHistory,
            })
            .eq("id", item.id);

          if (updateError) {
            console.error(`Error updating item ${item.id}:`, updateError);
            results.failed++;
            results.errors.push(`${item.player_name}: ${updateError.message}`);
          } else {
            results.updated++;
            logDebug("Updated watchlist item pricing", {
              itemId: redactId(item.id),
              comps: stats.count,
            });
          }
        } else {
          // No comps found - update last_checked but keep old price
          await supabase
            .from("watchlist")
            .update({ last_checked: new Date().toISOString() })
            .eq("id", item.id);

          logDebug("No comps found for watchlist item", {
            itemId: redactId(item.id),
          });
        }

        // Add a small delay between requests to be nice to eBay
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        results.failed++;
        results.errors.push(
          `${item.player_name}: ${itemError instanceof Error ? itemError.message : "Unknown error"}`
        );

        // If eBay blocks us, stop processing
        if (
          itemError instanceof Error &&
          itemError.message.includes("blocked")
        ) {
          console.error("eBay blocked - stopping batch processing");
          break;
        }
      }
    }

    logDebug(
      `Cron complete: ${results.processed} processed, ${results.updated} updated, ${results.failed} failed`
    );

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("Watchlist price update cron error:", error);
    return NextResponse.json(
      {
        error: "Failed to update watchlist prices",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  // In development, allow GET requests for testing
  if (process.env.NODE_ENV === "development") {
    return POST(request);
  }

  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
