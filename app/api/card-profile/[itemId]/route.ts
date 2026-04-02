import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeHttpUrl } from "@/lib/collection-images";
import { requireBusinessContext } from "@/lib/business/context";
import { resolveTrustedCardImageForItem } from "@/lib/images/resolver";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

type ImageFields = {
  id?: string | null;
  card_id?: string | null;
  title?: string | null;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  parallel_type?: string | null;
  insert?: string | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
  image_url?: string | null;
  image_source?: "psa" | "user" | "none" | null;
  user_image_url?: string | null;
};

function firstImageUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeHttpUrl(value ?? null);
    if (normalized) return normalized;
  }
  return null;
}

function firstTextValue(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function isGradeOnlyLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(PSA|BGS|SGC|CGC)?\s*\d+(\.\d+)?$/i.test(value.trim());
}

function hasAnyImage(item: ImageFields | null | undefined): boolean {
  return Boolean(
    firstImageUrl(
      item?.user_image_url,
      item?.image_url
    )
  );
}

function hasWeakSearchIdentity(item: ImageFields | null | undefined): boolean {
  if (!item) return true;
  const hasStructuredIdentity = Boolean(
    firstTextValue(item.player_name, item.year, item.set_name, item.parallel_type, item.insert)
  );
  if (hasStructuredIdentity) return false;
  const title = firstTextValue(item.title);
  if (!title) return true;
  return isGradeOnlyLabel(title);
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
    image_url:
      firstImageUrl(base.image_url, linked?.image_url, linkedCardImageUrl) ?? null,
    image_source:
      base.image_source ??
      linked?.image_source ??
      (firstImageUrl(base.user_image_url, linked?.user_image_url) ? "user" : "none"),
    psa_cert_number:
      firstTextValue(base.psa_cert_number, linked?.psa_cert_number, base.cert_number, linked?.cert_number) ?? null,
  };
}

function mergeIdentityFields(base: ImageFields, linked: ImageFields | null): ImageFields {
  const baseTitle = firstTextValue(base.title);
  const linkedTitle = firstTextValue(linked?.title);
  const title =
    !baseTitle || isGradeOnlyLabel(baseTitle)
      ? firstTextValue(linkedTitle, baseTitle)
      : baseTitle;

  return {
    title: title ?? null,
    player_name: firstTextValue(base.player_name, linked?.player_name) ?? null,
    year: firstTextValue(base.year, linked?.year) ?? null,
    set_name: firstTextValue(base.set_name, linked?.set_name) ?? null,
    parallel_type: firstTextValue(base.parallel_type, linked?.parallel_type) ?? null,
    insert: firstTextValue(base.insert, linked?.insert) ?? null,
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
      const context = await requireBusinessContext(userId);

      // Load from business_inventory_items
      const { data: itemById, error: itemByIdErr } = isUuid(itemId)
        ? await supabase
            .from("business_inventory_items")
            .select("*")
            .eq("id", itemId)
            .eq("business_account_id", context.businessAccountId)
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
          .eq("business_account_id", context.businessAccountId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (itemByCardIdErr) throw itemByCardIdErr;
        item = Array.isArray(itemByCardIdRows) ? itemByCardIdRows[0] ?? null : null;
      }

      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

      let hydratedItem: Record<string, unknown> = item as Record<string, unknown>;
      const baseItem = item as ImageFields;

      // Business rows can miss image fields and/or searchable identity fields.
      // Enrich from linked collection card data when either is weak.
      const needsImageHydration = !hasAnyImage(baseItem);
      const needsIdentityHydration = hasWeakSearchIdentity(baseItem);
      if (needsImageHydration || needsIdentityHydration) {
        const cardSelect =
          "id,title,player_name,year,set_name,parallel_type,insert,cert_number,psa_cert_number,image_url,image_source,user_image_url";
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

        const linkedCardImageUrl = null;

        hydratedItem = {
          ...item,
          ...(needsImageHydration
            ? mergeImageFields(baseItem, linkedCard, linkedCardImageUrl)
            : {}),
          ...(needsIdentityHydration
            ? mergeIdentityFields(baseItem, linkedCard)
            : {}),
        };
      }

      const resolvedImage = await resolveTrustedCardImageForItem({
        supabase,
        item: hydratedItem as ImageFields,
        itemId: isUuid(String((hydratedItem as { card_id?: string }).card_id ?? ""))
          ? String((hydratedItem as { card_id?: string }).card_id)
          : item.id,
        userId,
      });

      // Load sales for this item (use business_id to match RLS; order by sold_at)
      let sales: unknown[] = [];
      const salesRes = await supabase
        .from("business_sales")
        .select("*")
        .eq("inventory_item_id", item.id)
        .eq("business_account_id", context.businessAccountId)
        .eq("is_deleted", false)
        .order("sold_at", { ascending: false });
      if (!salesRes.error) sales = salesRes.data ?? [];
      // If sales query errors (e.g. schema/RLS), still return profile with empty sales

      return NextResponse.json({
        item: {
          ...hydratedItem,
          trusted_image: resolvedImage.trustedImage,
          image_source: resolvedImage.imageSource,
          image_url: resolvedImage.imageUrl,
          psa_cert_number: resolvedImage.psaCertNumber,
          card_images: resolvedImage.cardImages,
          primary_image: resolvedImage.primaryImage,
        },
        sales,
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

    const resolvedImage = await resolveTrustedCardImageForItem({
      supabase,
      item: item as ImageFields,
      itemId: item.id,
      userId,
    });

    return NextResponse.json({
      item: {
        ...item,
        trusted_image: resolvedImage.trustedImage,
        image_source: resolvedImage.imageSource,
        image_url: resolvedImage.imageUrl,
        psa_cert_number: resolvedImage.psaCertNumber,
        card_images: resolvedImage.cardImages,
        primary_image: resolvedImage.primaryImage,
      },
      sales: [],
      mode: "collection",
    });
  } catch (err: any) {
    console.error("Card profile GET error:", err);
    const status = err?.status ?? 500;
    return NextResponse.json(
      { error: err?.message || "Failed to load card profile" },
      { status }
    );
  }
}
