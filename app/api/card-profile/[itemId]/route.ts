import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeHttpUrl, resolveStoredImagePath } from "@/lib/collection-images";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

type ImageFields = {
  id?: string | null;
  card_id?: string | null;
  title?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  stock_image_url?: string | null;
  ebay_image_url?: string | null;
};

function firstImageUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeHttpUrl(value ?? null);
    if (normalized) return normalized;
  }
  return null;
}

function hasAnyImage(item: ImageFields | null | undefined): boolean {
  return Boolean(
    firstImageUrl(
      item?.user_image_url,
      item?.stock_image_url,
      item?.ebay_image_url,
      item?.image_url
    )
  );
}

function mergeImageFields(
  base: ImageFields,
  linked: ImageFields | null,
  linkedCardImageUrl: string | null
): ImageFields {
  return {
    ...base,
    user_image_url:
      firstImageUrl(base.user_image_url, linked?.user_image_url) ?? null,
    stock_image_url:
      firstImageUrl(base.stock_image_url, linked?.stock_image_url) ?? null,
    ebay_image_url:
      firstImageUrl(base.ebay_image_url, linked?.ebay_image_url) ?? null,
    image_url:
      firstImageUrl(base.image_url, linked?.image_url, linkedCardImageUrl) ?? null,
  };
}

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * GET /api/card-profile/[itemId]?from=business|collection
 *
 * Loads unified card profile data:
 *  - item details (from business_inventory_items or collection_items)
 *  - sales history (from business_sales, business mode only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;
    const from = request.nextUrl.searchParams.get("from") || "collection";

    const supabase = await createClient();

    if (from === "business") {
      // Load from business_inventory_items
      const { data: itemById, error: itemByIdErr } = isUuid(itemId)
        ? await supabase
            .from("business_inventory_items")
            .select("*")
            .eq("id", itemId)
            .eq("user_id", userId)
            .maybeSingle()
        : { data: null, error: null };

      if (itemByIdErr && itemByIdErr.code !== "PGRST116") throw itemByIdErr;

      let item = itemById;
      if (!item) {
        // Backward-compatibility: legacy links may pass collection `card_id`
        // instead of business inventory `id`.
        const { data: itemByCardIdRows, error: itemByCardIdErr } = await supabase
          .from("business_inventory_items")
          .select("*")
          .eq("card_id", itemId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (itemByCardIdErr) throw itemByCardIdErr;
        item = Array.isArray(itemByCardIdRows) ? itemByCardIdRows[0] ?? null : null;
      }

      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

      let hydratedItem: Record<string, unknown> = item as Record<string, unknown>;
      const baseItem = item as ImageFields;

      // Business rows can miss image fields. Enrich from linked card data if needed.
      if (!hasAnyImage(baseItem)) {
        const cardSelect =
          "id,title,image_url,user_image_url,stock_image_url,ebay_image_url";
        let linkedCard: ImageFields | null = null;

        if (isUuid(baseItem.card_id)) {
          const { data } = await supabase
            .from("collection_items")
            .select(cardSelect)
            .eq("id", baseItem.card_id)
            .eq("user_id", userId)
            .maybeSingle();
          linkedCard = (data as ImageFields | null) ?? null;
        }

        if (!linkedCard && baseItem.title?.trim()) {
          const { data: titleMatchedRows, error: titleMatchError } = await supabase
            .from("collection_items")
            .select(cardSelect)
            .eq("user_id", userId)
            .eq("title", baseItem.title.trim())
            .order("created_at", { ascending: false })
            .limit(1);
          if (titleMatchError) throw titleMatchError;
          linkedCard = Array.isArray(titleMatchedRows)
            ? ((titleMatchedRows[0] as ImageFields | undefined) ?? null)
            : null;
        }

        let linkedCardImageUrl: string | null = null;
        if (linkedCard?.id) {
          const { data: cardImages } = await supabase
            .from("card_images")
            .select("storage_path")
            .eq("card_id", linkedCard.id)
            .eq("user_id", userId)
            .order("position", { ascending: true })
            .limit(1);

          const storagePath =
            Array.isArray(cardImages) && cardImages.length > 0
              ? (cardImages[0] as { storage_path?: string | null }).storage_path
              : null;

          linkedCardImageUrl = resolveStoredImagePath(
            storagePath,
            (path) => supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl
          );
        }

        hydratedItem = {
          ...item,
          ...mergeImageFields(baseItem, linkedCard, linkedCardImageUrl),
        };
      }

      // Load sales for this item
      const { data: sales } = await supabase
        .from("business_sales")
        .select("*")
        .eq("inventory_item_id", item.id)
        .eq("user_id", userId)
        .order("sale_date", { ascending: false });

      return NextResponse.json({
        item: hydratedItem,
        sales: sales ?? [],
        mode: "business",
      });
    }

    // Load from collection_items (personal)
    if (!isUuid(itemId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: item, error: itemErr } = await supabase
      .from("collection_items")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", userId)
      .maybeSingle();

    if (itemErr && itemErr.code !== "PGRST116") throw itemErr;
    if (!item)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      item,
      sales: [],
      mode: "collection",
    });
  } catch (err: any) {
    console.error("Card profile GET error:", err);
    return NextResponse.json(
      { error: "Failed to load card profile" },
      { status: 500 }
    );
  }
}
