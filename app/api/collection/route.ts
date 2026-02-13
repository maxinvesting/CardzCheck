import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, type CollectionItem } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import {
  buildPendingCmvUpdate,
  calculateCardCmvWithStatus,
  isCmvStale,
} from "@/lib/cmv";
import {
  pickFirstHttpsImageUrl,
  resolveStoredCardImageUrl,
} from "@/lib/collection/image-url";
import { logDebug, redactId } from "@/lib/logging";
import {
  OPTIONAL_COLLECTION_INSERT_COLUMNS,
  buildCollectionInsertPayload,
  extractMissingColumnFromPostgrestMessage,
  normalizeCollectionAddInput,
  validateCollectionAddInput,
  type CollectionInsertPayload,
} from "@/lib/collection/add-normalization";

type InsertErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
  status?: number;
};

const isCollectionAddDebugEnabled = (): boolean =>
  process.env.DEBUG_COLLECTION_ADD === "true";

const logCollectionAddDebug = (
  message: string,
  meta?: Record<string, unknown>
) => {
  if (!isCollectionAddDebugEnabled()) {
    return;
  }

  if (meta) {
    console.log(`[collection:add] ${message}`, meta);
  } else {
    console.log(`[collection:add] ${message}`);
  }
};

const getInsertErrorStatus = (error: InsertErrorLike): number => {
  if (
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 600
  ) {
    return error.status;
  }

  const code = error.code ?? "";
  if (code.startsWith("PGRST") || code.startsWith("22") || code.startsWith("23")) {
    return 400;
  }
  return 500;
};

const toErrorPayload = (
  error: InsertErrorLike,
  fallbackMessage = "Failed to add to collection"
) => ({
  error: error.message || fallbackMessage,
  ...(error.code ? { code: error.code } : {}),
  ...(error.details ? { details: error.details } : {}),
});

const summarizeIncomingBody = (body: unknown): Record<string, unknown> => {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return {
    ...record,
    image_urls_count: Array.isArray(record.image_urls)
      ? record.image_urls.length
      : Array.isArray(record.imageUrls)
      ? record.imageUrls.length
      : 0,
    image_urls: Array.isArray(record.image_urls) ? "[omitted]" : record.image_urls,
    imageUrls: Array.isArray(record.imageUrls) ? "[omitted]" : record.imageUrls,
  };
};

const getPrimaryImageUrl = (
  supabase: Awaited<ReturnType<typeof createClient>>,
  image: { storage_path?: string | null } | null | undefined
): string | null => {
  if (!image?.storage_path) return null;
  return resolveStoredCardImageUrl(supabase, image.storage_path);
};

const attachImageFields = (
  item: CollectionItem | Record<string, unknown>,
  primaryImage: Record<string, unknown> | null | undefined,
  supabase: Awaited<ReturnType<typeof createClient>>
) => {
  const primaryImageUrl = getPrimaryImageUrl(
    supabase,
    primaryImage as { storage_path?: string | null } | null | undefined
  );

  const thumbnailUrl = pickFirstHttpsImageUrl([
    (item as any).thumbnail_url,
    primaryImageUrl,
    (item as any).image_url,
  ]);

  return {
    ...item,
    primary_image:
      primaryImage && primaryImageUrl
        ? { ...primaryImage, url: primaryImageUrl }
        : null,
    thumbnail_url: thumbnailUrl,
  };
};

/**
 * Resilient update: retries by stripping columns that PostgREST says are missing.
 * Mirrors the optional-column fallback used for inserts.
 */
async function updateCollectionItemResilient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<{
  data: Record<string, unknown> | null;
  error: InsertErrorLike | null;
  strippedColumns: string[];
}> {
  const workingPayload: Record<string, unknown> = { ...payload };
  const strippedColumns: string[] = [];
  const MAX_RETRIES = Object.keys(workingPayload).length;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { data, error } = await supabase
      .from("collection_items")
      .update(workingPayload)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (!error) {
      return { data: data as Record<string, unknown>, error: null, strippedColumns };
    }

    const missingColumn = extractMissingColumnFromPostgrestMessage(
      (error as InsertErrorLike).message
    );
    if (!missingColumn || !(missingColumn in workingPayload)) {
      return { data: null, error: error as InsertErrorLike, strippedColumns };
    }

    delete workingPayload[missingColumn];
    strippedColumns.push(missingColumn);
    logDebug("⚠️ CMV update: stripping missing column", {
      missingColumn,
      strippedColumns: [...strippedColumns],
    });

    // If we've stripped everything, nothing to update
    if (Object.keys(workingPayload).length === 0) {
      return {
        data: null,
        error: {
          message: "All CMV columns stripped — migration required",
          code: "CMV_ALL_COLUMNS_MISSING",
        },
        strippedColumns,
      };
    }
  }

  return {
    data: null,
    error: { message: "Exhausted column-strip retries", code: "CMV_UPDATE_EXHAUSTED" },
    strippedColumns,
  };
}

async function insertCollectionItemWithOptionalFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: CollectionInsertPayload
): Promise<{
  item: Record<string, unknown> | null;
  error: InsertErrorLike | null;
  strippedColumns: string[];
  finalPayload: CollectionInsertPayload;
}> {
  const workingPayload: CollectionInsertPayload = { ...payload };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt <= OPTIONAL_COLLECTION_INSERT_COLUMNS.size; attempt += 1) {
    const { data: item, error } = await supabase
      .from("collection_items")
      .insert(workingPayload)
      .select()
      .single();

    if (!error) {
      return {
        item: item as Record<string, unknown>,
        error: null,
        strippedColumns,
        finalPayload: workingPayload,
      };
    }

    const insertError = error as InsertErrorLike;
    const missingColumn = extractMissingColumnFromPostgrestMessage(insertError.message);
    if (
      !missingColumn ||
      !OPTIONAL_COLLECTION_INSERT_COLUMNS.has(missingColumn) ||
      !(missingColumn in workingPayload)
    ) {
      return {
        item: null,
        error: insertError,
        strippedColumns,
        finalPayload: workingPayload,
      };
    }

    delete workingPayload[missingColumn];
    strippedColumns.push(missingColumn);
    logCollectionAddDebug("Retrying insert without missing optional column", {
      missingColumn,
      strippedColumns: [...strippedColumns],
    });
  }

  return {
    item: null,
    error: {
      message: "Failed to add card after stripping optional columns",
      code: "CARD_INSERT_OPTIONAL_FALLBACK_EXHAUSTED",
      details: `stripped=${strippedColumns.join(",")}`,
    },
    strippedColumns,
    finalPayload: workingPayload,
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
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Fetch primary images for all cards in a single query.
    const cardIds = (items || []).map((item: CollectionItem) => item.id);
    const { data: primaryImages } =
      cardIds.length > 0
        ? await supabase
            .from("card_images")
            .select("*")
            .in("card_id", cardIds)
            .eq("position", 0)
        : { data: [] as Record<string, unknown>[] };

    // Create a map of card_id -> primary_image
    const primaryImageMap = new Map<string, Record<string, unknown>>();
    (primaryImages || []).forEach((img: any) => {
      primaryImageMap.set(img.card_id, { ...img });
    });

    const updatedItems = await Promise.all(
      (items || []).map(async (item: CollectionItem) => {
        const itemWithImage = attachImageFields(
          item,
          primaryImageMap.get(item.id),
          supabase
        );

        const stale = isCmvStale(item);
        console.log("🔍 CMV staleness check", JSON.stringify({
          id: redactId(item.id),
          player: item.player_name,
          stale,
          cmv_status: (item as any).cmv_status ?? null,
          cmv_value: (item as any).cmv_value ?? null,
          estimated_cmv: (item as any).estimated_cmv ?? null,
          est_cmv: (item as any).est_cmv ?? null,
          cmv_confidence: (item as any).cmv_confidence ?? null,
          cmv_updated_at: (item as any).cmv_updated_at ?? null,
          cmv_last_updated: (item as any).cmv_last_updated ?? null,
        }, null, 2));

        if (!stale) {
          return itemWithImage;
        }

        try {
          const computed = await calculateCardCmvWithStatus(item);
          const cmvResult = computed.payload;
          logDebug("🔄 CMV recalculated", {
            id: redactId(item.id),
            result_estimated_cmv: cmvResult.estimated_cmv,
            result_confidence: cmvResult.cmv_confidence,
            result_status: cmvResult.cmv_status,
            result_error: computed.errorCode,
            bestImageUrl: computed.meta.bestImageUrl ?? "none",
          });

          // Backfill image_url from eBay when the card has no image
          const needsImageBackfill =
            !item.image_url && computed.meta.bestImageUrl;
          const updatePayload: Record<string, unknown> = {
            ...(cmvResult as unknown as Record<string, unknown>),
            ...(needsImageBackfill
              ? { image_url: computed.meta.bestImageUrl }
              : {}),
          };

          console.log("💾 CMV persist: attempting Supabase UPDATE", JSON.stringify({
            id: redactId(item.id),
            payloadKeys: Object.keys(updatePayload),
            cmv_value: updatePayload.cmv_value,
            cmv_status: updatePayload.cmv_status,
            estimated_cmv: updatePayload.estimated_cmv,
          }));

          const { data: updated, error: updateError, strippedColumns: cmvStripped } =
            await updateCollectionItemResilient(supabase, item.id, user.id, updatePayload);

          if (cmvStripped.length > 0) {
            console.log("⚠️ CMV persist: columns were stripped (schema incomplete?)", JSON.stringify({
              id: redactId(item.id),
              strippedColumns: cmvStripped,
            }));
          }

          if (updateError || !updated) {
            console.error("❌ CMV persist: UPDATE FAILED", JSON.stringify({
              id: redactId(item.id),
              errorCode: (updateError as any)?.code ?? null,
              errorMessage: (updateError as any)?.message ?? null,
              strippedColumns: cmvStripped,
            }));
            // Even if the DB update failed, overlay computed values onto the response
            // so the UI shows the CMV for this request.
            const overlaid = { ...item, ...cmvResult } as any;
            if (needsImageBackfill) {
              overlaid.image_url = computed.meta.bestImageUrl;
            }
            return attachImageFields(
              overlaid as CollectionItem,
              primaryImageMap.get(item.id),
              supabase
            );
          }

          console.log("✅ CMV persist: UPDATE SUCCEEDED", JSON.stringify({
            id: redactId(item.id),
            cmv_value: (updated as any).cmv_value ?? null,
            cmv_status: (updated as any).cmv_status ?? null,
            estimated_cmv: (updated as any).estimated_cmv ?? null,
            cmv_updated_at: (updated as any).cmv_updated_at ?? null,
            strippedColumns: cmvStripped,
          }));

          return attachImageFields(
            updated as unknown as CollectionItem,
            primaryImageMap.get(item.id),
            supabase
          );
        } catch (cmvError) {
          console.error("CMV calculation failed for item:", redactId(item.id), cmvError);
          return itemWithImage;
        }
      })
    );

    if (updatedItems.length > 0) {
      const first = updatedItems[0] as any;
      console.log("💰 GET collection: response first row CMV", JSON.stringify({
        id: redactId(first.id),
        player: first.player_name,
        cmv_value: first.cmv_value ?? null,
        cmv_status: first.cmv_status ?? null,
        estimated_cmv: first.estimated_cmv ?? null,
        est_cmv: first.est_cmv ?? null,
        cmv_confidence: first.cmv_confidence ?? null,
        cmv_updated_at: first.cmv_updated_at ?? null,
      }, null, 2));
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
          id: `test-${Date.now()}`,
          user_id: "test-user-id",
          estimated_cmv: null,
          cmv_confidence: "unavailable",
          cmv_last_updated: new Date().toISOString(),
          cmv_status: "pending",
          cmv_value: null,
          cmv_error: null,
          cmv_updated_at: new Date().toISOString(),
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
    logCollectionAddDebug("Incoming POST body", summarizeIncomingBody(body));

    const normalized = normalizeCollectionAddInput(body);
    logCollectionAddDebug("Normalized collection payload", {
      ...normalized,
      image_urls_count: normalized.image_urls.length,
    });

    const validationError = validateCollectionAddInput(normalized);
    if (validationError) {
      logCollectionAddDebug("Validation failed", {
        check: "player_name",
        reason: validationError,
      });
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    logDebug("📦 Inserting collection item", {
      userId: redactId(user.id),
      hasPlayers: Array.isArray(normalized.players),
      playersCount: normalized.players?.length ?? 0,
      hasNotes: Boolean(normalized.notes),
    });

    const insertPayload = buildCollectionInsertPayload(user.id, normalized);
    logCollectionAddDebug("Supabase insert payload", {
      columns: Object.keys(insertPayload),
      payload: insertPayload,
    });

    const {
      item,
      error: insertError,
      strippedColumns,
      finalPayload,
    } = await insertCollectionItemWithOptionalFallback(supabase, insertPayload);

    if (insertError || !item) {
      const typedInsertError = (insertError || {
        message: "Insert failed without an error payload",
      }) as InsertErrorLike;

      console.error("❌ Supabase insert error:", typedInsertError);
      logCollectionAddDebug("Supabase insert error response", {
        code: typedInsertError.code ?? null,
        message: typedInsertError.message ?? null,
        details: typedInsertError.details ?? null,
        strippedColumns,
        attemptedColumns: Object.keys(finalPayload),
      });

      return NextResponse.json(toErrorPayload(typedInsertError), {
        status: getInsertErrorStatus(typedInsertError),
      });
    }

    if (strippedColumns.length > 0) {
      logCollectionAddDebug("Insert succeeded after optional-column fallback", {
        strippedColumns,
      });
    }

    let finalItem = item as unknown as CollectionItem;

    if ((finalItem.cmv_status ?? "pending") === "pending") {
      try {
        const computed = await calculateCardCmvWithStatus(finalItem);
        const { data: recomputedRow, error: recomputeError, strippedColumns: postStripped } =
          await updateCollectionItemResilient(
            supabase,
            finalItem.id,
            user.id,
            computed.payload as unknown as Record<string, unknown>
          );

        if (postStripped.length > 0) {
          logDebug("⚠️ Post-insert CMV update stripped columns (run migrations!)", {
            id: redactId(finalItem.id),
            strippedColumns: postStripped,
          });
        }

        if (!recomputeError && recomputedRow) {
          finalItem = recomputedRow as unknown as CollectionItem;
        } else if (recomputeError) {
          console.error("Failed to persist CMV compute result after insert:", recomputeError);
          // Overlay computed values onto the response even if DB write failed
          finalItem = { ...finalItem, ...computed.payload } as CollectionItem;
        }
      } catch (cmvError) {
        console.error("CMV calculation failed after insert:", cmvError);
      }
    }

    // Verify the row has CMV after insert
    logDebug("✅ Inserted row CMV check", {
      id: redactId(finalItem.id as string),
      estimated_cmv: (finalItem as any).estimated_cmv ?? "MISSING",
      est_cmv: (finalItem as any).est_cmv ?? "MISSING",
      cmv_confidence: (finalItem as any).cmv_confidence ?? "MISSING",
      cmv_last_updated: (finalItem as any).cmv_last_updated ?? "MISSING",
      cmv_status: (finalItem as any).cmv_status ?? "MISSING",
      cmv_updated_at: (finalItem as any).cmv_updated_at ?? "MISSING",
      thumbnail_url: (finalItem as any).thumbnail_url ?? "MISSING",
    });

    // If multiple images were uploaded, create card_images records
    if (normalized.image_urls.length > 0) {
      const imageRecords = normalized.image_urls.map((url, index: number) => ({
        card_id: finalItem.id,
        user_id: user.id,
        storage_path: url, // Store the full URL for now (legacy support)
        position: index,
      }));

      const { error: imagesError } = await supabase
        .from("card_images")
        .insert(imageRecords);

      if (imagesError) {
        console.error("⚠️ Failed to insert card images:", imagesError);
        logCollectionAddDebug("card_images insert error", {
          code: (imagesError as InsertErrorLike).code ?? null,
          message: (imagesError as InsertErrorLike).message ?? null,
          details: (imagesError as InsertErrorLike).details ?? null,
        });
        // Don't fail the whole operation, just log it
      } else {
        logDebug("📸 Created card_images records", {
          cardId: redactId(finalItem.id as string),
          imageCount: normalized.image_urls.length,
        });
      }
    }

    logCollectionAddDebug("Collection insert successful", {
      itemId: redactId(finalItem.id as string),
      strippedColumns,
    });
    logDebug("✅ Successfully added to collection", {
      userId: redactId(user.id),
      itemId: redactId(finalItem.id as string),
    });
    return NextResponse.json({ item: finalItem });
  } catch (error) {
    console.error("❌ Collection add error:", error);
    const typedError = (error ?? {}) as InsertErrorLike;
    const errorPayload = toErrorPayload(typedError);
    logCollectionAddDebug("Unhandled POST exception", errorPayload);

    return NextResponse.json(
      errorPayload,
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
      "notes",
      "parallel_type",
      "card_number",
    ];
    const shouldRecalculate = cmvRelevantFields.some((field) => field in updates);

    if (!shouldRecalculate) {
      return NextResponse.json({ item });
    }

    const { data: pendingItem } = await updateCollectionItemResilient(
      supabase,
      item.id,
      user.id,
      buildPendingCmvUpdate() as unknown as Record<string, unknown>
    );

    const computationSource = (pendingItem as CollectionItem | null) ?? (item as CollectionItem);
    const cmvComputation = await calculateCardCmvWithStatus(computationSource);

    const { data: updatedItem, error: updateError } = await updateCollectionItemResilient(
      supabase,
      item.id,
      user.id,
      cmvComputation.payload as unknown as Record<string, unknown>
    );

    if (updateError || !updatedItem) {
      // Even if persist failed, return the computed CMV overlaid on the item
      return NextResponse.json({
        item: { ...item, ...cmvComputation.payload },
      });
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
