import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItems,
} from "@/lib/business/actions";

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

    const body = await request.json();
    const item = await createInventoryItem(userId, body);
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

    const item = await updateInventoryItem(userId, id, updates);
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

    await deleteInventoryItems(userId, ids);
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
