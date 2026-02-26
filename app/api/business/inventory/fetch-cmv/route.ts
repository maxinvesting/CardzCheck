import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInventoryItem, updateInventoryItem } from "@/lib/business/actions";
import { hasBusinessAccess } from "@/lib/access";
import { normalizeHttpUrl } from "@/lib/collection-images";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * GET /api/business/inventory/fetch-cmv
 * Fetches estimated CMV for an inventory item by title or item id.
 * Requires Business access.
 *
 * Query params:
 *   - item_id: inventory item id (resolves to title)
 *   - title: raw title to search (used when item_id not provided)
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = await hasBusinessAccess(userId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Business subscription required" },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const itemId = searchParams.get("item_id");
    const titleParam = searchParams.get("title");

    let title: string | null = null;
    let inventoryItem:
      | Awaited<ReturnType<typeof getInventoryItem>>
      | null = null;

    if (itemId) {
      inventoryItem = await getInventoryItem(userId, itemId);
      if (!inventoryItem) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      title = inventoryItem.title?.trim() || null;
    } else if (titleParam?.trim()) {
      title = titleParam.trim();
    }

    if (!title) {
      return NextResponse.json(
        { error: "Provide item_id or title" },
        { status: 400 }
      );
    }

    // Call search API with full title as player (eBay-style query)
    const base = request.nextUrl.origin;
    const searchUrl = new URL("/api/search", base);
    searchUrl.searchParams.set("player", title);

    const cookieHeader = request.headers.get("cookie");
    const res = await fetch(searchUrl.toString(), {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Search failed", cmv: null },
        { status: res.status }
      );
    }

    const stats = data?.stats;
    const cmv =
      typeof stats?.cmv === "number" &&
      Number.isFinite(stats.cmv) &&
      stats.cmv > 0
        ? stats.cmv
        : null;

    const forSaleItems = Array.isArray(data?._forSale?.items)
      ? data._forSale.items
      : [];
    const compItems = Array.isArray(data?.comps) ? data.comps : [];

    const firstForSaleImage = normalizeHttpUrl(
      forSaleItems.find((entry: { image?: string }) =>
        normalizeHttpUrl(entry.image ?? null)
      )?.image ?? null
    );
    const firstCompImage = normalizeHttpUrl(
      compItems.find((entry: { image?: string }) =>
        normalizeHttpUrl(entry.image ?? null)
      )?.image ?? null
    );
    const stockImageUrl = firstCompImage || firstForSaleImage;
    const ebayImageUrl = firstForSaleImage || firstCompImage;

    let updatedItem = inventoryItem;
    if (itemId && inventoryItem) {
      const updates: Record<string, unknown> = {};
      if (cmv != null) {
        updates.current_market_value_cents = Math.round(cmv * 100);
      }
      if (!inventoryItem.stock_image_url && stockImageUrl) {
        updates.stock_image_url = stockImageUrl;
      }
      if (!inventoryItem.ebay_image_url && ebayImageUrl) {
        updates.ebay_image_url = ebayImageUrl;
      }

      if (Object.keys(updates).length > 0) {
        updatedItem = await updateInventoryItem(
          userId,
          itemId,
          updates as Parameters<typeof updateInventoryItem>[2]
        );
      }
    }

    return NextResponse.json({
      cmv,
      stock_image_url: stockImageUrl ?? null,
      ebay_image_url: ebayImageUrl ?? null,
      item: updatedItem ?? null,
    });
  } catch (err: unknown) {
    console.error("Business fetch-cmv error:", err);
    return NextResponse.json(
      { error: "Failed to fetch CMV", cmv: null },
      { status: 500 }
    );
  }
}
