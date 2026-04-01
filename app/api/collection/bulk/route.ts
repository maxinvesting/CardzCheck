import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { calculateCardCmv } from "@/lib/cmv";
import { hasBusinessAccess } from "@/lib/access";

type BulkCollectionItemInput = {
  player_name: string;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  acquisition_type?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  stock_image_url?: string | null;
  ebay_image_url?: string | null;
  notes?: string | null;
};

const COLLECTION_VISIBLE_ITEM_KIND_FILTER =
  "item_kind.is.null,item_kind.eq.owned,item_kind.eq.inventory";

function deriveBusinessTitle(item: BulkCollectionItemInput): string {
  const display = [item.year, item.player_name, item.set_name, item.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
  return display || item.player_name.trim() || "Untitled card";
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

async function insertBulkWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Record<string, unknown>[]
): Promise<{ items: any[] | null; error: unknown | null; removedColumns: string[] }> {
  let payload = rows.map((row) => ({ ...row }));
  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase
      .from("collection_items")
      .insert(payload)
      .select("*");

    if (!error) {
      return { items: data ?? [], error: null, removedColumns };
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn) {
      return { items: null, error, removedColumns };
    }

    payload = payload.map((row) => {
      const next = { ...row };
      delete next[missingColumn];
      return next;
    });
    removedColumns.push(missingColumn);
  }

  return {
    items: null,
    error: new Error("Bulk insert failed after retrying schema fallback"),
    removedColumns,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: BulkCollectionItemInput[] };
    const items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    if (items.length > 200) {
      return NextResponse.json(
        { error: "Too many items (max 200 per import)" },
        { status: 400 }
      );
    }

    // Validate upfront so we don't partially import.
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item?.player_name || !item.player_name.trim()) {
        errors.push({ index: i, error: "player_name is required" });
      }
    }
    if (errors.length) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    // Bypass auth and limits in test mode
    if (isTestMode()) {
      return NextResponse.json({
        imported: items.length,
        items: items.map((it, idx) => ({
          ...it,
          id: `test-${Date.now()}-${idx}`,
          user_id: "test-user-id",
          estimated_cmv: null,
          cmv_confidence: "unavailable",
          cmv_last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })),
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      .eq("user_id", user.id)
      .or(COLLECTION_VISIBLE_ITEM_KIND_FILTER);

    const currentCount = count || 0;
    if (!userData?.is_paid && currentCount + items.length > LIMITS.FREE_COLLECTION) {
      return NextResponse.json(
        { error: "limit_reached", type: "collection" },
        { status: 403 }
      );
    }

    const isBusinessUser = await hasBusinessAccess(user.id);

    const insertPayload = items.map((it) => {
      const normalizedPrice =
        typeof it.purchase_price === "number" && Number.isFinite(it.purchase_price)
          ? it.purchase_price
          : null;
      return {
        user_id: user.id,
        item_kind: isBusinessUser ? "inventory" : "owned",
        title: isBusinessUser ? deriveBusinessTitle(it) : null,
        player_name: it.player_name.trim(),
        year: it.year || null,
        set_name: it.set_name || null,
        grade: it.grade || null,
        acquisition_type: it.acquisition_type || "unknown",
        purchase_price: normalizedPrice,
        purchase_date: it.purchase_date || null,
        image_url: it.image_url || null,
        user_image_url: it.user_image_url || null,
        stock_image_url: it.stock_image_url || null,
        ebay_image_url: it.ebay_image_url || null,
        notes: it.notes || null,
        quantity: isBusinessUser ? 1 : undefined,
        acquisition_date: isBusinessUser ? it.purchase_date || null : undefined,
        cost_basis_total_cents:
          isBusinessUser && normalizedPrice !== null
            ? Math.round(normalizedPrice * 100)
            : undefined,
        tax_cents: isBusinessUser ? 0 : undefined,
        shipping_cents: isBusinessUser ? 0 : undefined,
        fees_paid_cents: isBusinessUser ? 0 : undefined,
        condition_status: isBusinessUser ? (it.grade ? "graded" : "raw") : undefined,
        channel: isBusinessUser ? "other" : undefined,
        status: isBusinessUser ? "unlisted" : undefined,
      };
    });

    const insertResult = await insertBulkWithFallback(
      supabase,
      insertPayload as Record<string, unknown>[]
    );
    const insertedItems = insertResult.items;
    const error = insertResult.error;

    if (error || !insertedItems) throw error;

    if (insertedItems && insertedItems.length > 0) {
      const cmvFailures: string[] = [];
      for (const item of insertedItems) {
        try {
          const cmvResult = await calculateCardCmv(item);
          const { error: cmvUpdateError } = await supabase
            .from("collection_items")
            .update(cmvResult)
            .eq("id", item.id)
            .eq("user_id", user.id);
          if (cmvUpdateError) {
            console.error(`[bulk] CMV update failed for item ${item.id}:`, cmvUpdateError);
            cmvFailures.push(item.id);
          }
        } catch (cmvError) {
          console.error(`[bulk] CMV calculation failed for item ${item.id}:`, cmvError);
          cmvFailures.push(item.id);
        }
      }
      if (cmvFailures.length > 0) {
        console.warn(`[bulk] CMV failed for ${cmvFailures.length}/${insertedItems.length} items`);
      }
    }

    return NextResponse.json({ imported: insertedItems?.length || items.length });
  } catch (error) {
    console.error("Collection bulk import error:", error);
    return NextResponse.json(
      { error: "Failed to import collection" },
      { status: 500 }
    );
  }
}
