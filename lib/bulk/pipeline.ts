/**
 * Bulk Mode — Full Processing Pipeline
 *
 * Orchestrates identification → pricing → shipping → strategy → draft
 * for a single bulk batch item.
 *
 * Called by the /api/bulk/batches/[batchId]/process route.
 * Each step is persisted to the DB as it completes so partial progress
 * is not lost on failure.
 */

import { createClient } from "@/lib/supabase/server";
import { identifyCard } from "./identification";
import { estimateBulkPrice } from "./pricing";
import { computeShippingAndMargin } from "./shipping";
import { recommendStrategy } from "./strategy";
import { buildListingDraft } from "./drafts";
import type {
  BulkBatchItem,
  IdentificationResult,
  PricingResult,
  ShippingResult,
} from "@/types/bulk";

// ----------------------------------------------------------------
// Internal: count duplicates for a card within the same batch
// "duplicate" = same player + year + set_name + card_number
// ----------------------------------------------------------------

async function countDuplicates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  id: IdentificationResult,
): Promise<number> {
  if (!id.player) return 1;

  // Join items to their identifications to count matching fingerprints
  const { count, error } = await supabase
    .from("bulk_item_identifications")
    .select(
      `id, bulk_batch_items!inner(batch_id)`,
      { count: "exact", head: true }
    )
    .eq("bulk_batch_items.batch_id", batchId)
    .eq("player", id.player)
    .eq("year", id.year ?? "")
    .eq("set_name", id.setName ?? "")
    .eq("card_number", id.cardNumber ?? "");

  if (error) {
    console.warn("[bulk/pipeline] countDuplicates error:", error.message);
    return 1;
  }

  return count ?? 1;
}

// ----------------------------------------------------------------
// Internal: persist identification result
// ----------------------------------------------------------------

async function saveIdentification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  id: IdentificationResult,
): Promise<void> {
  const { error } = await supabase
    .from("bulk_item_identifications")
    .upsert(
      {
        item_id: itemId,
        title_candidate: id.titleCandidate,
        player: id.player,
        brand: id.brand,
        set_name: id.setName,
        year: id.year,
        card_number: id.cardNumber,
        rookie_flag: id.rookieFlag,
        insert_parallel_notes: id.insertParallelNotes,
        confidence: id.confidence,
        needs_review: id.needsReview,
        raw_response_json: id.rawResponseJson,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

  if (error) {
    throw new Error(`Failed to save identification for item ${itemId}: ${error.message}`);
  }
}

// ----------------------------------------------------------------
// Internal: persist pricing result
// ----------------------------------------------------------------

async function savePricing(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  pricing: PricingResult,
): Promise<void> {
  const { error } = await supabase
    .from("bulk_item_pricing")
    .upsert(
      {
        item_id: itemId,
        suggested_listing_price: pricing.suggestedListingPrice,
        estimated_sale_price: pricing.estimatedSalePrice,
        pricing_confidence: pricing.pricingConfidence,
        pricing_notes: pricing.pricingNotes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

  if (error) {
    throw new Error(`Failed to save pricing for item ${itemId}: ${error.message}`);
  }
}

// ----------------------------------------------------------------
// Internal: persist strategy result
// ----------------------------------------------------------------

async function saveStrategy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  shipping: ShippingResult,
  strategy: { recommendedStrategy: string; rationale: string },
): Promise<void> {
  const { error } = await supabase
    .from("bulk_item_strategy")
    .upsert(
      {
        item_id: itemId,
        recommended_strategy: strategy.recommendedStrategy,
        estimated_shipping_cost: shipping.estimatedShippingCost,
        estimated_ebay_fee: shipping.estimatedEbayFee,
        estimated_net_profit: shipping.estimatedNetProfit,
        ese_eligible: shipping.eseEligible,
        not_worth_listing: shipping.notWorthListing,
        rationale: strategy.rationale,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

  if (error) {
    throw new Error(`Failed to save strategy for item ${itemId}: ${error.message}`);
  }
}

// ----------------------------------------------------------------
// Internal: persist draft payload
// ----------------------------------------------------------------

async function saveDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  payload: object,
): Promise<void> {
  const { error } = await supabase
    .from("bulk_listing_drafts")
    .upsert(
      {
        item_id: itemId,
        draft_status: "draft",
        listing_payload_json: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" }
    );

  if (error) {
    throw new Error(`Failed to save draft for item ${itemId}: ${error.message}`);
  }
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Process a single bulk batch item through the full pipeline.
 *
 * Returns true on success, false on failure (error is logged).
 * Each stage is persisted independently so partial results survive failures.
 */
export async function processItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  item: BulkBatchItem,
  batchId: string,
): Promise<boolean> {
  const itemId = item.id;

  try {
    // Step 1: Identify the card
    const identification = await identifyCard({
      primaryImageUrl: item.primary_image_url!,
      secondaryImageUrl: item.secondary_image_url ?? undefined,
    });

    await saveIdentification(supabase, itemId, identification);

    // Mark item as identified
    await supabase
      .from("bulk_batch_items")
      .update({ status: "identified", updated_at: new Date().toISOString() })
      .eq("id", itemId);

    // Step 2: Estimate price
    const pricing = await estimateBulkPrice({ identification });
    await savePricing(supabase, itemId, pricing);

    // Step 3: Compute shipping & margin
    const shipping = computeShippingAndMargin({
      suggestedListingPrice: pricing.suggestedListingPrice,
      estimatedSalePrice: pricing.estimatedSalePrice,
    });

    // Step 4: Count duplicates in the batch for strategy decisions
    const duplicateCount = await countDuplicates(supabase, batchId, identification);

    // Step 5: Recommend strategy
    const strategy = recommendStrategy({ identification, pricing, shipping, duplicateCount });
    await saveStrategy(supabase, itemId, shipping, strategy);

    // Step 6: Build and save listing draft
    const imageUrls: string[] = [];
    if (item.primary_image_url)   imageUrls.push(item.primary_image_url);
    if (item.secondary_image_url) imageUrls.push(item.secondary_image_url);

    const draft = buildListingDraft(
      identification,
      pricing,
      shipping,
      strategy,
      imageUrls,
      duplicateCount,
    );
    await saveDraft(supabase, itemId, draft);

    // Mark item as fully priced
    await supabase
      .from("bulk_batch_items")
      .update({ status: "priced", updated_at: new Date().toISOString() })
      .eq("id", itemId);

    return true;
  } catch (err) {
    console.error(`[bulk/pipeline] processItem failed for item ${itemId}:`, err);
    return false;
  }
}

/**
 * Process all pending items in a batch sequentially.
 *
 * Returns summary counts. Designed to run as a background process
 * triggered by the /api/bulk/batches/[batchId]/process endpoint.
 *
 * Note: sequential (not parallel) to avoid overloading the AI API
 * with burst requests. Parallelism can be added later with a queue.
 */
export async function processBatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let skipped = 0;

  // Fetch all pending items in the batch
  const { data: items, error } = await supabase
    .from("bulk_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["pending", "identified"])   // retry identified-but-not-priced too
    .order("position", { ascending: true });

  if (error) {
    return { processed: 0, skipped: 0, errors: [error.message] };
  }

  if (!items || items.length === 0) {
    return { processed: 0, skipped: 0, errors: [] };
  }

  // Update batch status to processing
  await supabase
    .from("bulk_batches")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  for (const item of items) {
    if (!item.primary_image_url) {
      skipped++;
      errors.push(`Item ${item.id}: no primary image; skipped`);
      continue;
    }

    const ok = await processItem(supabase, item, batchId);
    if (ok) {
      processed++;
    } else {
      skipped++;
      errors.push(`Item ${item.id}: processing failed`);
    }
  }

  // Update batch status to ready
  await supabase
    .from("bulk_batches")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", batchId);

  return { processed, skipped, errors };
}
