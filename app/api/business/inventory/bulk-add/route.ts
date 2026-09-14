import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInventoryItem, requireBusinessAccess } from "@/lib/business/actions";
import { recordLedgerAction } from "@/lib/business/ledger-actions";
import { uniqueTrustedImageUrls } from "@/lib/images/shared";

/**
 * POST /api/business/inventory/bulk-add
 *
 * Manual multi-card add. Each row carries the same fields the single-card add
 * modal sends; we insert them one at a time through createInventoryItem so every
 * row gets the same treatment (cash-on-hand purchase deduction, cert image
 * enqueue, tier caps) and record a single undo-able bulk ledger action.
 *
 * This replaces the old PSA-cert bulk import — no external lookup, no cert
 * requirement, raw and graded cards both supported.
 */

const MAX_ROWS_PER_CALL = 200;

type BulkAddRow = Record<string, unknown> & {
  title?: string | null;
  player_name?: string | null;
  condition_status?: string | null;
  image_urls?: unknown;
  image_url?: string | null;
  user_image_url?: string | null;
};

function rowImageUrls(row: BulkAddRow): string[] {
  const max = row.condition_status === "graded" ? 3 : 10;
  return uniqueTrustedImageUrls([
    ...(Array.isArray(row.image_urls) ? row.image_urls : []),
    row.user_image_url,
    row.image_url,
  ]).slice(0, max);
}

async function insertCardImages(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  itemId: string;
  imageUrls: string[];
}): Promise<void> {
  if (args.imageUrls.length === 0) return;
  const imageRecords = args.imageUrls.map((url, index) => ({
    card_id: args.itemId,
    user_id: args.userId,
    storage_path: url,
    position: index,
    label: index === 0 ? "front" : index === 1 ? "back" : null,
  }));
  const { error } = await args.supabase.from("card_images").insert(imageRecords);
  if (error) {
    console.warn("[bulk-add] failed to insert card images", {
      itemId: args.itemId,
      error: error.message,
    });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS_PER_CALL) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS_PER_CALL} per call)` },
      { status: 400 }
    );
  }

  const rows = body.rows as BulkAddRow[];
  const context = await requireBusinessAccess(user.id);

  type Outcome =
    | { index: number; status: "added"; id: string }
    | { index: number; status: "failed"; error: string };

  const results: Outcome[] = [];
  const addedIds: string[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const hasIdentity =
      (typeof row.title === "string" && row.title.trim().length > 0) ||
      (typeof row.player_name === "string" && row.player_name.trim().length > 0);
    if (!hasIdentity) {
      results.push({ index, status: "failed", error: "Missing player name" });
      continue;
    }

    try {
      const imageUrls = rowImageUrls(row);
      const primaryImageUrl = imageUrls[0] ?? null;
      const createBody = primaryImageUrl
        ? {
            ...row,
            image_url: primaryImageUrl,
            image_source: "user",
            user_image_url: primaryImageUrl,
          }
        : row;

      const item = await createInventoryItem(user.id, createBody as any);
      await insertCardImages({ supabase, userId: user.id, itemId: item.id, imageUrls });
      addedIds.push(item.id);
      results.push({ index, status: "added", id: item.id });
    } catch (err: any) {
      // Surface the tier-cap message verbatim so the UI can explain a stopped batch.
      const message =
        typeof err?.message === "string" && err.message.trim().length > 0
          ? err.message
          : "Insert failed";
      console.error("[bulk-add] insert failed", index, err);
      results.push({ index, status: "failed", error: message });
    }
  }

  const added = results.filter((r) => r.status === "added").length;
  const failed = results.length - added;

  if (addedIds.length > 0) {
    await recordLedgerAction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
      actionType: "inventory_bulk_create",
      label: added === 1 ? "add card" : "bulk add",
      payload: { itemIds: addedIds },
    });
  }

  return NextResponse.json({ results, added, failed });
}
