import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, type AcquisitionType, type CollectionItem } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { calculateCardCmv, isCmvStale } from "@/lib/cmv";
import { logDebug, redactId } from "@/lib/logging";
import { normalizeHttpUrl, resolveStoredImagePath, uniqueHttpUrls } from "@/lib/collection-images";

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

    // Create a map of card_id -> primary_image
    const primaryImageMap = new Map();
    (primaryImages || []).forEach((img: any) => {
      const resolvedUrl = resolveStoredImagePath(
        img.storage_path,
        (path) => supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl
      );
      primaryImageMap.set(img.card_id, {
        ...img,
        url: resolvedUrl,
      });
    });

    const updatedItems = await Promise.all(
      (items || []).map(async (item: CollectionItem) => {
        const itemWithImage = {
          ...item,
          primary_image: primaryImageMap.get(item.id) || null,
        };

        const stale = isCmvStale(item);
        logDebug("🔍 CMV staleness check", {
          id: redactId(item.id),
          player: item.player_name,
          stale,
          cmv_confidence: (item as any).cmv_confidence ?? "MISSING",
          cmv_last_updated: (item as any).cmv_last_updated ?? "MISSING",
          estimated_cmv: (item as any).estimated_cmv ?? "MISSING",
          est_cmv: (item as any).est_cmv ?? "MISSING",
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
      })
    );

    if (updatedItems.length > 0) {
      const first = updatedItems[0] as any;
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
      return NextResponse.json({
        item: {
          ...body,
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

    const { count } = await supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

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

    // Store players array and insert in notes if DB columns don't exist yet
    // TODO: Add migration for players (JSONB) and insert (text) columns
    const notesParts: string[] = [];
    if (notes) notesParts.push(notes);
    if (insert) notesParts.push(`[INSERT:${insert}]`);
    if (players && players.length > 1) {
      notesParts.push(`[PLAYERS:${JSON.stringify(players)}]`);
    }
    const combinedNotes = notesParts.length > 0 ? notesParts.join(" | ") : null;

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
      player_name,
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
      ...cmvPayload,
    };

    // Insert only columns that exist in collection_items (est_cmv added via migration when needed)
    const { data: item, error } = await supabase
      .from("collection_items")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("❌ Supabase insert error:", error);
      logDebug("❌ Insert payload that failed", {
        columns: Object.keys(insertPayload),
        hasCmv: "estimated_cmv" in insertPayload,
        errorCode: (error as any).code,
        errorMessage: (error as any).message,
      });
      throw error;
    }

    // Verify the row has CMV after insert
    logDebug("✅ Inserted row CMV check", {
      id: redactId(item.id),
      estimated_cmv: (item as any).estimated_cmv ?? "MISSING",
      est_cmv: (item as any).est_cmv ?? "MISSING",
      cmv_confidence: (item as any).cmv_confidence ?? "MISSING",
      cmv_last_updated: (item as any).cmv_last_updated ?? "MISSING",
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
    return NextResponse.json({ item });
  } catch (error) {
    console.error("❌ Collection add error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to add to collection";
    const errorDetails = error instanceof Error && 'code' in error ? { code: (error as any).code } : {};
    
    return NextResponse.json(
      { 
        error: errorMessage,
        ...errorDetails,
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

    const cmvRelevantFields = ["player_name", "year", "set_name", "grade", "notes"];
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
