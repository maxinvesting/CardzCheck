import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInventoryItem } from "@/lib/business/actions";
import { hasBusinessAccess } from "@/lib/access";

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

    if (itemId) {
      const item = await getInventoryItem(userId, itemId);
      if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      title = item.title?.trim() || null;
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

    return NextResponse.json({ cmv });
  } catch (err: unknown) {
    console.error("Business fetch-cmv error:", err);
    return NextResponse.json(
      { error: "Failed to fetch CMV", cmv: null },
      { status: 500 }
    );
  }
}
