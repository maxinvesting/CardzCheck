import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItems,
  requireBusinessAccess,
} from "@/lib/business/actions";
import {
  getCardImageSnapshots,
  getInventorySnapshots,
  recordLedgerAction,
} from "@/lib/business/ledger-actions";
import { uniqueTrustedImageUrls } from "@/lib/images/shared";

type InventoryPostBody = Record<string, unknown> & {
  condition_status?: string | null;
  image_url?: string | null;
  image_urls?: unknown;
  image_source?: string | null;
  user_image_url?: string | null;
};

function getInventoryImageUrls(body: InventoryPostBody): string[] {
  const maxImages = body.condition_status === "graded" ? 3 : 10;
  return uniqueTrustedImageUrls([
    ...(Array.isArray(body.image_urls) ? body.image_urls : []),
    body.user_image_url,
    body.image_url,
  ]).slice(0, maxImages);
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
    console.warn("[business/inventory] failed to insert card images", {
      itemId: args.itemId,
      error: error.message,
    });
  }
}

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const itemId = searchParams.get("id");

    if (itemId) {
      const item = await getInventoryItem(userId, itemId);
      if (!item)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(item);
    }

    const items = await listInventory(userId, {
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      condition_status: searchParams.get("condition_status") || undefined,
      search: searchParams.get("search") || undefined,
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err?.code === "PGRST205") {
      return NextResponse.json(
        { error: "Database migration required", needs_migration: true },
        { status: 503 }
      );
    }
    console.error("Business inventory GET error:", err);
    return NextResponse.json(
      { error: "Failed to load inventory" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as InventoryPostBody;
    const context = await requireBusinessAccess(userId);
    const imageUrls = getInventoryImageUrls(body);
    const primaryImageUrl = imageUrls[0] ?? null;
    const createBody =
      primaryImageUrl
        ? {
            ...body,
            image_url: primaryImageUrl,
            image_source: "user",
            user_image_url: primaryImageUrl,
          }
        : body;
    const item = await createInventoryItem(userId, createBody as any);
    const supabase = await createClient();
    await insertCardImages({
      supabase,
      userId,
      itemId: item.id,
      imageUrls,
    });
    await recordLedgerAction({
      supabase,
      userId,
      businessAccountId: context.businessAccountId,
      actionType: "inventory_create",
      label: "add card",
      payload: { itemIds: [item.id] },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    if (err?.status === 402)
      return NextResponse.json(
        { error: err.message, upgradeRequired: true },
        { status: 402 }
      );
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err?.code === "PGRST205") {
      return NextResponse.json(
        { error: "Database migration required", needs_migration: true },
        { status: 503 }
      );
    }
    console.error("Business inventory POST error:", err);
    const detail =
      typeof err?.message === "string" && err.message.trim().length > 0
        ? err.message
        : "Failed to create item";
    return NextResponse.json(
      { error: detail },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id)
      return NextResponse.json(
        { error: "Item id required" },
        { status: 400 }
      );

    const supabase = await createClient();
    const context = await requireBusinessAccess(userId);
    const beforeRows = await getInventorySnapshots(supabase, userId, [id]);
    const item = await updateInventoryItem(userId, id, updates);
    if (beforeRows.length > 0) {
      await recordLedgerAction({
        supabase,
        userId,
        businessAccountId: context.businessAccountId,
        actionType: "inventory_update",
        label: "edit card",
        payload: {
          itemIds: [id],
          beforeRows,
        },
      });
    }
    return NextResponse.json(item);
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business inventory PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const ids = searchParams.get("ids")?.split(",").filter(Boolean);
    if (!ids?.length)
      return NextResponse.json(
        { error: "Item ids required" },
        { status: 400 }
      );

    const supabase = await createClient();
    const context = await requireBusinessAccess(userId);
    const beforeRows = await getInventorySnapshots(supabase, userId, ids);
    const cardImageRows = await getCardImageSnapshots(supabase, userId, ids);
    await deleteInventoryItems(userId, ids);
    if (beforeRows.length > 0) {
      await recordLedgerAction({
        supabase,
        userId,
        businessAccountId: context.businessAccountId,
        actionType: "inventory_delete",
        label: ids.length === 1 ? "delete card" : "delete cards",
        payload: {
          itemIds: ids,
          beforeRows,
          cardImageRows,
        },
      });
    }
    return NextResponse.json({ deleted: ids.length });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business inventory DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete items" },
      { status: 500 }
    );
  }
}
