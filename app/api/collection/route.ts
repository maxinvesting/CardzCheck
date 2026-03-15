import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, type AcquisitionType, type CollectionItem } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { calculateCardCmv, isCmvStale } from "@/lib/cmv";
import { logDebug, redactId } from "@/lib/logging";
import { normalizeHttpUrl, resolveStoredImagePath, uniqueHttpUrls } from "@/lib/collection-images";
import { hasBusinessAccess } from "@/lib/access";

// ---------------------------------------------------------------------------
// Simple async concurrency limiter — avoids hammering external APIs (eBay,
// Anthropic) when many collection items are CMV-stale at the same time.
// ---------------------------------------------------------------------------
function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrent: number
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = new Array(tasks.length);
    let started = 0;
    let completed = 0;
    let failed = false;

    function runNext() {
      if (failed) return;
      if (started >= tasks.length) return;

      const index = started++;
      tasks[index]()
        .then((result) => {
          results[index] = result;
          completed++;
          if (completed === tasks.length) {
            resolve(results);
          } else {
            runNext();
          }
        })
        .catch((err) => {
          failed = true;
          reject(err);
        });
    }

    const initialBatch = Math.min(maxConcurrent, tasks.length);
    for (let i = 0; i < initialBatch; i++) {
      runNext();
    }
  });
}

const CMV_MAX_CONCURRENT = 3;

const ACQUISITION_TYPES: readonly AcquisitionType[] = [
  "pulled",
  "bought",
  "trade",
  "gift",
  "unknown",
];

function parseAcquisitionType(value: unknown): AcquisitionType {
  const normalized =
    typeof value === "string" ? (value.trim().toLowerCase() as AcquisitionType) : "unknown";
  return ACQUISITION_TYPES.includes(normalized) ? normalized : "unknown";
}

function parsePurchasePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value.replace(/[$,]/g, "").trim())
      : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function parseQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value.trim())
      : Number.NaN;

  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1) return null;
  return parsed;
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  return typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return fallback;
}

function extractMissingColumn(error: unknown): string | null {
  const message = getErrorMessage(error, "");
  if (!message) return null;

  const quoted = message.match(/Could not find the '([^']+)' column/i);
  if (quoted?.[1]) return quoted[1];

  const postgres = message.match(/column \"([^\"]+)\" of relation/i);
  if (postgres?.[1]) return postgres[1];

  return null;
}

const COLLECTION_VISIBLE_ITEM_KIND_FILTER =
  "item_kind.is.null,item_kind.eq.owned,item_kind.eq.inventory";

function deriveBusinessTitle(input: {
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
}): string {
  const display = [input.year, input.player_name, input.set_name, input.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
  return display || input.player_name || "Untitled card";
}

type InsertedRow = Record<string, unknown>;

async function insertCollectionItemWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  insertPayload: Record<string, unknown>
): Promise<{ item: InsertedRow | null; error: unknown | null; removedColumns: string[] }> {
  const payload = { ...insertPayload };
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase
      .from("collection_items")
      .insert(payload)
      .select()
      .single();

    if (!error) {
      return { item: data, error: null, removedColumns };
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in payload)) {
      return { item: null, error, removedColumns };
    }

    delete payload[missingColumn];
    removedColumns.push(missingColumn);
  }

  return {
    item: null,
    error: new Error("Insert failed after retrying schema fallback"),
    removedColumns,
  };
}

// GET - List collection items
export async function GET() {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing collection auth");
      return NextResponse.json({ items: [] });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: items, error } = await supabase
      .from("collection_items")
      .select("*")
      .eq("user_id", user.id)
      .or(COLLECTION_VISIBLE_ITEM_KIND_FILTER)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Fetch primary images for all cards in a single query
    const cardIds = (items || []).map((item: CollectionItem) => item.id);
    const { data: primaryImages } = await supabase
      .from("card_images")
      .select("*")
      .in("card_id", cardIds)
      .eq("position", 0);

    type CardImage = { card_id: string; storage_path: string; [key: string]: unknown };

    // Create a map of card_id -> primary_image
    const primaryImageMap = new Map<string, CardImage & { url: string | null }>();
    (primaryImages || []).forEach((img: CardImage) => {
      const resolvedUrl = resolveStoredImagePath(
        img.storage_path,
        (path) => supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl
      );
      primaryImageMap.set(img.card_id, {
        ...img,
        url: resolvedUrl,
      });
    });

    const updatedItems = await withConcurrency(
      (items || []).map((item: CollectionItem) => async () => {
        const itemWithImage = {
          ...item,
          primary_image: primaryImageMap.get(item.id) || null,
        };

        const stale = isCmvStale(item);
        logDebug("🔍 CMV staleness check", {
          id: redactId(item.id),
          player: item.player_name,
          stale,
          cmv_confidence: item.cmv_confidence ?? "MISSING",
          cmv_last_updated: item.cmv_last_updated ?? "MISSING",
          estimated_cmv: item.estimated_cmv ?? "MISSING",
          est_cmv: item.est_cmv ?? "MISSING",
        });

        if (!stale) {
          return itemWithImage;
        }

        try {
          const cmvResult = await calculateCardCmv(item);
          logDebug("🔄 CMV recalculated", {
            id: redactId(item.id),
            result_estimated_cmv: cmvResult.estimated_cmv,
            result_confidence: cmvResult.cmv_confidence,
          });

          const { data: updated, error: updateError } = await supabase
            .from("collection_items")
            .update(cmvResult)
            .eq("id", item.id)
            .eq("user_id", user.id)
            .select("*")
            .single();

          if (updateError) {
            console.error("Failed to update CMV for item:", redactId(item.id), updateError);
            return itemWithImage;
          }
          return {
            ...updated,
            primary_image: primaryImageMap.get(item.id) || null,
          };
        } catch (cmvError) {
          console.error("CMV calculation failed for item:", redactId(item.id), cmvError);
          return itemWithImage;
        }
      }),
      CMV_MAX_CONCURRENT
    );

    if (updatedItems.length > 0) {
      const first = updatedItems[0] as CollectionItem;
      logDebug("💰 GET collection first row CMV", {
        id: redactId(first.id),
        player: first.player_name,
        estimated_cmv: first.estimated_cmv ?? "MISSING",
        est_cmv: first.est_cmv ?? "MISSING",
        cmv_confidence: first.cmv_confidence ?? "MISSING",
      });
    }

    return NextResponse.json({ items: updatedItems });
  } catch (error) {
    console.error("Collection fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

// POST - Add item to collection
export async function POST(request: NextRequest) {
  try {
    // Bypass auth and limits in test mode
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing collection limits");
      const body = await request.json();
      const quantity = parseQuantity((body as { quantity?: unknown }).quantity) ?? 1;
      return NextResponse.json({
        item: {
          ...body,
          quantity,
          acquisition_type: parseAcquisitionType((body as { acquisition_type?: unknown }).acquisition_type),
          id: `test-${Date.now()}`,
          user_id: "test-user-id",
          estimated_cmv: null,
          cmv_confidence: "unavailable",
          cmv_last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user limits
    const { data: userData } = await supabase
      .from("users")
      .select("is_paid")
      .eq("id", user.id)
      .single();

    const isBusinessUser = await hasBusinessAccess(user.id);

    const { count } = await supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .or(COLLECTION_VISIBLE_ITEM_KIND_FILTER);

    if (!userData?.is_paid && (count || 0) >= LIMITS.FREE_COLLECTION) {
      return NextResponse.json(
        { error: "limit_reached", type: "collection" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      player_name,
      players,
      year,
      set_name,
      insert,
      parallel_type,
      card_number,
      grade,
      est_cmv,
      estimated_cmv,
      acquisition_type,
      purchase_price,
      purchase_date,
      image_url,
      user_image_url,
      stock_image_url,
      ebay_image_url,
      image_urls,
      notes,
      quantity,
    } = body;

    if (!player_name) {
      return NextResponse.json(
        { error: "Player name is required" },
        { status: 400 }
      );
    }

    const acquisitionType = parseAcquisitionType(acquisition_type);
    const normalizedPurchasePrice = parsePurchasePrice(purchase_price);
    const hasPurchasePriceInput =
      purchase_price !== null &&
      purchase_price !== undefined &&
      (typeof purchase_price !== "string" || purchase_price.trim().length > 0);

    if (acquisitionType !== "pulled" && hasPurchasePriceInput && normalizedPurchasePrice === null) {
      return NextResponse.json(
        { error: "Purchase price must be a valid positive number" },
        { status: 400 }
      );
    }

    const normalizedPurchaseDate =
      typeof purchase_date === "string" && purchase_date.trim().length > 0
        ? purchase_date.trim()
        : null;
    const parsedQuantity = parseQuantity(quantity);
    const normalizedQuantity = parsedQuantity ?? 1;
    const hasQuantityInput =
      quantity !== null &&
      quantity !== undefined &&
      (typeof quantity !== "string" || quantity.trim().length > 0);

    if (hasQuantityInput && parsedQuantity === null) {
      return NextResponse.json(
        { error: "Quantity must be a whole number of 1 or greater" },
        { status: 400 }
      );
    }

    const normalizedUserImageUrl = normalizeHttpUrl(user_image_url) || null;
    const normalizedStockImageUrl = normalizeHttpUrl(stock_image_url) || null;
    const normalizedEbayImageUrl = normalizeHttpUrl(ebay_image_url) || null;
    const normalizedImageUrl = normalizeHttpUrl(image_url) || null;
    const normalizedImageUrls = Array.isArray(image_urls)
      ? uniqueHttpUrls(image_urls)
      : [];
    const canonicalImageUrl =
      normalizedUserImageUrl ||
      normalizedStockImageUrl ||
      normalizedEbayImageUrl ||
      normalizedImageUrl ||
      normalizedImageUrls[0] ||
      null;

    // players and insert_type now have first-class columns (migration 20260314).
    // The schema-fallback retry loop in insertCollectionItemWithFallback will
    // gracefully drop them if the migration hasn't been applied yet.
    const combinedNotes = notes || null;

    logDebug("📦 Inserting collection item", {
      userId: redactId(user.id),
      hasPlayers: Array.isArray(players),
      playersCount: players?.length ?? 0,
      hasNotes: Boolean(notes),
    });

    const coerceCmv = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
      }
      if (typeof value === "string") {
        const cleaned = value.replace(/[$,]/g, "").trim();
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
      return null;
    };

    const incomingCmv = coerceCmv(estimated_cmv) ?? coerceCmv(est_cmv);

    logDebug("💰 CMV POST payload", {
      raw_estimated_cmv: estimated_cmv ?? null,
      raw_est_cmv: est_cmv ?? null,
      coerced: incomingCmv,
    });

    const cmvPayload =
      incomingCmv !== null
        ? {
            est_cmv: incomingCmv,
            estimated_cmv: incomingCmv,
            cmv_confidence: "medium" as const,
            cmv_last_updated: new Date().toISOString(),
          }
        : {};

    logDebug("💰 CMV DB write fields", cmvPayload);

    const insertPayload = {
      user_id: user.id,
      item_kind: isBusinessUser ? "inventory" : "owned",
      player_name,
      players: Array.isArray(players) && players.length > 1 ? players : null,
      insert_type: typeof insert === "string" && insert.trim() ? insert.trim() : null,
      title: isBusinessUser
        ? deriveBusinessTitle({ player_name, year: year || null, set_name: set_name || null, grade: grade || null })
        : null,
      year: year || null,
      set_name: set_name || null,
      parallel_type: parallel_type || null,
      card_number: card_number || null,
      grade: grade || null,
      acquisition_type: acquisitionType,
      purchase_price: acquisitionType === "pulled" ? null : normalizedPurchasePrice,
      purchase_date: normalizedPurchaseDate,
      image_url: canonicalImageUrl,
      user_image_url: normalizedUserImageUrl,
      stock_image_url: normalizedStockImageUrl,
      ebay_image_url: normalizedEbayImageUrl,
      notes: combinedNotes,
      quantity: normalizedQuantity,
      acquisition_date: isBusinessUser ? normalizedPurchaseDate : undefined,
      cost_basis_total_cents:
        isBusinessUser && normalizedPurchasePrice !== null
          ? Math.round(normalizedPurchasePrice * 100)
          : undefined,
      tax_cents: isBusinessUser ? 0 : undefined,
      shipping_cents: isBusinessUser ? 0 : undefined,
      fees_paid_cents: isBusinessUser ? 0 : undefined,
      condition_status: isBusinessUser ? (grade ? "graded" : "raw") : undefined,
      channel: isBusinessUser ? "other" : undefined,
      status: isBusinessUser ? "unlisted" : undefined,
      current_market_value_cents:
        isBusinessUser && incomingCmv !== null
          ? Math.round(incomingCmv * 100)
          : undefined,
      ...cmvPayload,
    };

    // Insert with schema fallback so older DBs without new columns still work.
    const insertResult = await insertCollectionItemWithFallback(supabase, insertPayload);
    // Cast to CollectionItem: the schema-fallback function returns the raw Supabase row
    // which matches the CollectionItem shape once inserted successfully.
    const item = insertResult.item as CollectionItem | null;
    const error = insertResult.error;

    if (error || !item) {
      console.error("❌ Supabase insert error:", error);
      logDebug("❌ Insert payload that failed", {
        columns: Object.keys(insertPayload),
        droppedColumns: insertResult.removedColumns,
        hasCmv: "estimated_cmv" in insertPayload,
        errorCode: getErrorCode(error),
        errorMessage: getErrorMessage(error, "Unknown insert error"),
      });
      throw error;
    }

    if (insertResult.removedColumns.length > 0) {
      logDebug("⚠️ Collection insert fallback removed unsupported columns", {
        droppedColumns: insertResult.removedColumns,
      });
    }

    // Verify the row has CMV after insert
    logDebug("✅ Inserted row CMV check", {
      id: redactId(item.id),
      estimated_cmv: item.estimated_cmv ?? "MISSING",
      est_cmv: item.est_cmv ?? "MISSING",
      cmv_confidence: item.cmv_confidence ?? "MISSING",
      cmv_last_updated: item.cmv_last_updated ?? "MISSING",
    });

    // Persist user + fallback image URLs for stable rendering across refreshes.
    const persistedImageUrls = uniqueHttpUrls([
      normalizedUserImageUrl,
      ...normalizedImageUrls,
      normalizedStockImageUrl,
      normalizedEbayImageUrl,
      canonicalImageUrl,
    ]);

    if (persistedImageUrls.length > 0) {
      const imageRecords = persistedImageUrls.map((url: string, index: number) => ({
        card_id: item.id,
        user_id: user.id,
        // Accept both Supabase storage paths and full legacy URLs.
        storage_path: url,
        position: index,
      }));

      const { error: imagesError } = await supabase
        .from("card_images")
        .insert(imageRecords);

      if (imagesError) {
        console.error("⚠️ Failed to insert card images:", imagesError);
        // Don't fail the whole operation, just log it
      } else {
        logDebug("📸 Created card_images records", {
          cardId: redactId(item.id),
          imageCount: persistedImageUrls.length,
        });
      }
    }

    logDebug("✅ Successfully added to collection", {
      userId: redactId(user.id),
      itemId: redactId(item.id),
    });
    return NextResponse.json({
      item,
      destination: isBusinessUser ? "inventory" : "collection",
    });
  } catch (error) {
    console.error("❌ Collection add error:", error);
    const errorMessage = getErrorMessage(error, "Failed to add to collection");
    const errorCode = getErrorCode(error);

    return NextResponse.json(
      {
        error: errorMessage,
        ...(errorCode ? { code: errorCode } : {}),
      },
      { status: 500 }
    );
  }
}

// DELETE - Remove item from collection
export async function DELETE(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing collection delete auth");
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("collection_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Collection delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}

// PATCH - Update item
export async function PATCH(request: NextRequest) {
  try {
    // Bypass auth in test mode
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing collection update auth");
      const body = await request.json();
      return NextResponse.json({ item: body });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from("collection_items")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const cmvRelevantFields = [
      "player_name",
      "year",
      "set_name",
      "grade",
      "card_number",
      "parallel_type",
      "notes",
    ];
    const shouldRecalculate = cmvRelevantFields.some((field) => field in updates);

    if (!shouldRecalculate) {
      return NextResponse.json({ item });
    }

    const cmvResult = await calculateCardCmv(item);
    const { data: updatedItem, error: updateError } = await supabase
      .from("collection_items")
      .update(cmvResult)
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    console.error("Collection update error:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}
