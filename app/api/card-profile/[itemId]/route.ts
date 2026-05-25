import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeHttpUrl } from "@/lib/collection-images";
import { requireBusinessAccess } from "@/lib/business/actions";
import { getInventoryItem } from "@/lib/business/actions";
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
  image_source?: "psa" | "bgs" | "sgc" | "cgc" | "user" | "none" | null;
  user_image_url?: string | null;
  cert_image_status?: "queued" | "running" | "resolved" | "no_image" | "failed" | null;
  cert_image_last_error?: string | null;
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
  return Boolean(firstImageUrl(item?.user_image_url, item?.image_url));
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
      firstTextValue(
        base.psa_cert_number,
        linked?.psa_cert_number,
        base.cert_number,
        linked?.cert_number
      ) ?? null,
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

function formatProfileError(err: unknown): { message: string; status: number } {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403 || status === 404) {
    return {
      message: err instanceof Error ? err.message : "Request failed",
      status,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const details = String((err as { details?: string })?.details ?? "");
  const combined = `${message} ${details}`.toLowerCase();

  if (
    combined.includes("fetch failed") ||
    combined.includes("connecttimeout") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("network")
  ) {
    return {
      message: "Could not reach the database. Check your connection and try again.",
      status: 503,
    };
  }

  return {
    message: message.trim() || "Failed to load card profile",
    status: status ?? 500,
  };
}

async function loadBusinessSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inventoryItemId: string,
  businessAccountId: string
): Promise<unknown[]> {
  try {
    const salesRes = await supabase
      .from("business_sales")
      .select("*")
      .eq("inventory_item_id", inventoryItemId)
      .eq("business_account_id", businessAccountId)
      .eq("is_deleted", false)
      .order("sold_at", { ascending: false });
    if (salesRes.error) {
      console.warn("[card-profile] sales query failed:", salesRes.error.message ?? salesRes.error);
      return [];
    }
    return salesRes.data ?? [];
  } catch (err) {
    console.warn("[card-profile] sales query failed:", err);
    return [];
  }
}

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadLegacyBusinessItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemId: string,
  businessAccountId: string
): Promise<Record<string, unknown> | null> {
  const { data: itemById, error: itemByIdErr } = isUuid(itemId)
    ? await supabase
        .from("business_inventory_items")
        .select("*")
        .eq("id", itemId)
        .eq("business_account_id", businessAccountId)
        .maybeSingle()
    : { data: null, error: null };

  if (itemByIdErr && itemByIdErr.code !== "PGRST116") throw itemByIdErr;

  let item = itemById as Record<string, unknown> | null;
  if (!item) {
    const { data: itemByCardIdRows, error: itemByCardIdErr } = await supabase
      .from("business_inventory_items")
      .select("*")
      .eq("card_id", itemId)
      .eq("business_account_id", businessAccountId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (itemByCardIdErr) throw itemByCardIdErr;
    item = Array.isArray(itemByCardIdRows)
      ? ((itemByCardIdRows[0] as Record<string, unknown> | undefined) ?? null)
      : null;
  }

  if (!item) return null;

  let hydratedItem: Record<string, unknown> = item;
  const baseItem = item as ImageFields;
  const needsImageHydration = !hasAnyImage(baseItem);
  const needsIdentityHydration = hasWeakSearchIdentity(baseItem);

  if (needsImageHydration || needsIdentityHydration) {
    const cardSelect =
      "id,title,player_name,year,set_name,parallel_type,insert,grading_company,cert_number,psa_cert_number,image_url,image_source,user_image_url,cert_image_status,cert_image_last_error";
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

    hydratedItem = {
      ...item,
      ...(needsImageHydration ? mergeImageFields(baseItem, linkedCard, null) : {}),
      ...(needsIdentityHydration ? mergeIdentityFields(baseItem, linkedCard) : {}),
    };
  }

  const resolvedImage = await resolveTrustedCardImageForItem({
    supabase,
    item: hydratedItem as ImageFields,
    itemId: isUuid(String((hydratedItem as { card_id?: string }).card_id ?? ""))
      ? String((hydratedItem as { card_id?: string }).card_id)
      : String(item.id),
    userId,
  });

  return {
    ...hydratedItem,
    trusted_image: resolvedImage.trustedImage,
    image_source: resolvedImage.imageSource,
    image_url: resolvedImage.imageUrl,
    psa_cert_number: resolvedImage.psaCertNumber,
    card_images: resolvedImage.cardImages,
    primary_image: resolvedImage.primaryImage,
  };
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

    if (from === "business") {
      if (!isUuid(itemId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Primary path: same loader as /api/business/inventory (fewer round-trips).
      const inventoryItem = await getInventoryItem(userId, itemId);
      if (inventoryItem) {
        const sales = await loadBusinessSales(
          await createClient(),
          inventoryItem.id,
          inventoryItem.business_account_id
        );
        return NextResponse.json({
          item: inventoryItem,
          sales,
          mode: "business",
        });
      }

      const context = await requireBusinessAccess(userId);
      const supabase = await createClient();
      const legacyItem = await loadLegacyBusinessItem(
        supabase,
        userId,
        itemId,
        context.businessAccountId
      );
      if (!legacyItem) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const sales = await loadBusinessSales(
        supabase,
        String(legacyItem.id),
        context.businessAccountId
      );

      return NextResponse.json({
        item: legacyItem,
        sales,
        mode: "business",
      });
    }

    const supabase = await createClient();

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
  } catch (err: unknown) {
    console.error("Card profile GET error:", err);
    const { message, status } = formatProfileError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
