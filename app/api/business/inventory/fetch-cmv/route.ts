import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInventoryItem, updateInventoryItem } from "@/lib/business/actions";
import { hasBusinessAccess } from "@/lib/access";
import { normalizeHttpUrl } from "@/lib/collection-images";
import { parseSmartSearch } from "@/lib/smart-search-parser";

const GRADE_WITH_COMPANY_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
const NUMERIC_GRADE_PATTERN = /^\d+(?:\.\d+)?$/;

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function normalizeGradeLabel(
  rawGrade?: string | null,
  rawCompany?: string | null
): string | undefined {
  if (!rawGrade) return undefined;
  const grade = rawGrade.trim();
  if (!grade || /^raw$/i.test(grade) || /^ungraded$/i.test(grade)) return undefined;

  const company = rawCompany?.trim().toUpperCase() || "";
  const withCompany = grade.match(GRADE_WITH_COMPANY_PATTERN);
  if (withCompany?.[1] && withCompany[2]) {
    return `${withCompany[1].toUpperCase()} ${withCompany[2]}`;
  }

  if (NUMERIC_GRADE_PATTERN.test(grade)) {
    if (company) return `${company} ${grade}`;
    return grade.includes(".5") ? `BGS ${grade}` : `PSA ${grade}`;
  }

  return company ? `${company} ${grade}` : grade;
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

    const parsed = parseSmartSearch(title);
    const resolvedPlayer = parsed.player_name?.trim() || title;
    const resolvedGrade =
      (inventoryItem &&
        normalizeGradeLabel(inventoryItem.grade, inventoryItem.grading_company)) ||
      normalizeGradeLabel(parsed.grade);

    // Call search API with structured query fields and dual-format CMV output
    const base = request.nextUrl.origin;
    const searchUrl = new URL("/api/search", base);
    searchUrl.searchParams.set("player", resolvedPlayer);
    searchUrl.searchParams.set("format", "dual");
    if (parsed.year) searchUrl.searchParams.set("year", parsed.year);
    if (parsed.set_name) searchUrl.searchParams.set("set", parsed.set_name);
    if (resolvedGrade) searchUrl.searchParams.set("grade", resolvedGrade);
    if (parsed.card_number) searchUrl.searchParams.set("card_number", parsed.card_number);
    if (parsed.parallel_type) searchUrl.searchParams.set("parallel_type", parsed.parallel_type);

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

    const modeledCmv =
      typeof data?._marketDiscount?.cmv === "number" &&
      Number.isFinite(data._marketDiscount.cmv) &&
      data._marketDiscount.cmv > 0
        ? data._marketDiscount.cmv
        : null;
    const cmv = modeledCmv;

    const forSaleItems = Array.isArray(data?.forSale?.items)
      ? data.forSale.items
      : Array.isArray(data?._forSale?.items)
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
