import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

type ListingStatus = "active" | "sold" | "reserved" | "delisted";
type PublishState = "draft" | "published";
type ListingCondition = "raw" | "graded" | "sealed";

const ALLOWED_STATUS: ListingStatus[] = [
  "active",
  "sold",
  "reserved",
  "delisted",
  "draft",
];
const ALLOWED_PUBLISH_STATES: PublishState[] = ["draft", "published"];
const ALLOWED_CONDITIONS: ListingCondition[] = ["raw", "graded", "sealed"];

const ALLOWED_SPORTS = new Set(["Football", "Basketball", "Baseball", "Other"]);

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return asString(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStatus(value: unknown, fallback: ListingStatus = "active"): ListingStatus {
  if (typeof value !== "string") return fallback;
  return ALLOWED_STATUS.includes(value as ListingStatus)
    ? (value as ListingStatus)
    : fallback;
}

function asPublishState(
  value: unknown,
  fallback: PublishState = "published"
): PublishState {
  if (typeof value !== "string") return fallback;
  return ALLOWED_PUBLISH_STATES.includes(value as PublishState)
    ? (value as PublishState)
    : fallback;
}

function asCondition(
  value: unknown,
  fallback: ListingCondition = "graded"
): ListingCondition {
  if (typeof value !== "string") return fallback;
  return ALLOWED_CONDITIONS.includes(value as ListingCondition)
    ? (value as ListingCondition)
    : fallback;
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((url) => /^https?:\/\//i.test(url));
}

function sanitizeSport(value: unknown): string {
  const sport = asString(value);
  if (!sport) return "Football";
  return ALLOWED_SPORTS.has(sport) ? sport : "Other";
}

function parseYearFromText(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin shop listings fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }

  return NextResponse.json({ listings: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const body = await request.json();

  // --- Bulk status update: { ids: string[], status: string } ---
  if (Array.isArray(body?.ids) && body?.ids.length > 0 && typeof body?.status === "string") {
    const ids = body.ids.filter((v: unknown) => typeof v === "string" && v.trim().length > 0) as string[];
    const status = asStatus(body.status, "active");
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids array must contain valid strings" }, { status: 400 });
    }
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from("shop_listings")
      .update({ status })
      .in("id", ids);

    if (error) {
      console.error("Admin shop listings bulk update error:", error);
      return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, updated: ids.length });
  }

  const id = asString(body?.id);
  const updates = body?.updates as Record<string, unknown> | undefined;

  if (!id || !updates || typeof updates !== "object") {
    return NextResponse.json(
      { error: "id and updates required" },
      { status: 400 }
    );
  }

  const filtered: Record<string, unknown> = {};

  if ("title" in updates) {
    filtered.title = asNullableString(updates.title);
  }

  if ("inventory_item_id" in updates) {
    filtered.inventory_item_id = asNullableString(updates.inventory_item_id);
  }

  const playerName = asString(updates.player_name);
  if ("player_name" in updates && playerName) filtered.player_name = playerName;

  const year = asNumber(updates.year);
  if ("year" in updates && year != null) filtered.year = Math.trunc(year);

  const setBrand = asString(updates.set_brand);
  if ("set_brand" in updates && setBrand) filtered.set_brand = setBrand;

  if ("parallel_variant" in updates) {
    filtered.parallel_variant = asNullableString(updates.parallel_variant);
  }

  if ("card_number" in updates) {
    filtered.card_number = asNullableString(updates.card_number);
  }

  const grade = asString(updates.grade);
  if ("grade" in updates && grade) filtered.grade = grade;

  if ("condition" in updates) {
    filtered.condition = asCondition(updates.condition, "graded");
  }

  if ("cert_number" in updates) {
    filtered.cert_number = asNullableString(updates.cert_number);
  }

  if ("sport" in updates) {
    filtered.sport = sanitizeSport(updates.sport);
  }

  const price = asNumber(updates.price);
  if ("price" in updates && price != null) filtered.price = price;

  if ("cmv" in updates) {
    const cmv = asNumber(updates.cmv);
    filtered.cmv = cmv != null ? cmv : null;
  }

  if ("cost_basis" in updates) {
    const costBasis = asNumber(updates.cost_basis);
    filtered.cost_basis = costBasis != null ? costBasis : null;
  }

  if ("ebay_sold_comp" in updates) {
    const ebaySoldComp = asNumber(updates.ebay_sold_comp);
    filtered.ebay_sold_comp = ebaySoldComp != null ? ebaySoldComp : null;
  }

  if ("shipping_cost" in updates) {
    const shippingCost = asNumber(updates.shipping_cost);
    if (shippingCost != null) filtered.shipping_cost = shippingCost;
  }

  if ("status" in updates) {
    filtered.status = asStatus(updates.status, "active");
  }

  if ("publish_state" in updates) {
    filtered.publish_state = asPublishState(updates.publish_state, "published");
  }

  if ("featured" in updates) {
    filtered.featured = asBoolean(updates.featured);
  }

  if ("is_premium" in updates) {
    filtered.is_premium = asBoolean(updates.is_premium);
  }

  if ("tags" in updates) {
    filtered.tags = asTags(updates.tags);
  }

  if ("notes" in updates) {
    filtered.notes = asNullableString(updates.notes);
  }

  if ("quantity" in updates) {
    const quantity = asNumber(updates.quantity);
    if (quantity != null) filtered.quantity = Math.max(0, Math.trunc(quantity));
  }

  if ("quantity_sold" in updates) {
    const quantitySold = asNumber(updates.quantity_sold);
    if (quantitySold != null) {
      filtered.quantity_sold = Math.max(0, Math.trunc(quantitySold));
    }
  }

  if ("description" in updates) {
    filtered.description = asNullableString(updates.description);
  }

  if ("shipping_method" in updates) {
    filtered.shipping_method = asNullableString(updates.shipping_method) ?? "bmwt";
  }

  if ("image_urls" in updates) {
    filtered.image_urls = asImageUrls(updates.image_urls);
  }

  if ("thumbnail_url" in updates) {
    const thumbnail = asNullableString(updates.thumbnail_url);
    filtered.thumbnail_url = thumbnail;
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json(
      { error: "No valid updates" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Admin shop listings update error:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ listing: data });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const body = await request.json();
  const title = asNullableString(body?.title);
  const playerName = asString(body?.player_name) ?? title;
  const year = asNumber(body?.year) ?? parseYearFromText(title);
  const setBrand = asString(body?.set_brand) ?? title;
  const grade =
    asString(body?.grade) ??
    (asCondition(body?.condition, "graded") === "raw" ? "Raw" : null);
  const price = asNumber(body?.price);

  if (!playerName || year == null || !setBrand || !grade || price == null) {
    return NextResponse.json(
      { error: "player_name, year, set_brand, grade, price required" },
      { status: 400 }
    );
  }

  const quantity = asNumber(body?.quantity);
  const cmv = asNumber(body?.cmv);
  const costBasis = asNumber(body?.cost_basis);
  const ebaySoldComp = asNumber(body?.ebay_sold_comp);
  const shippingCost = asNumber(body?.shipping_cost);
  const imageUrls = asImageUrls(body?.image_urls);

  const insert = {
    title,
    inventory_item_id: asNullableString(body?.inventory_item_id),
    player_name: playerName,
    year: Math.trunc(year),
    set_brand: setBrand,
    parallel_variant: asNullableString(body?.parallel_variant),
    card_number: asNullableString(body?.card_number),
    grade,
    cert_number: asNullableString(body?.cert_number),
    condition: asCondition(body?.condition, "graded"),
    sport: sanitizeSport(body?.sport),
    price,
    cmv,
    cost_basis: costBasis,
    ebay_sold_comp: ebaySoldComp,
    description: asNullableString(body?.description),
    quantity: quantity != null ? Math.max(1, Math.trunc(quantity)) : 1,
    status: asStatus(body?.status, "active"),
    publish_state: asPublishState(body?.publish_state, "published"),
    shipping_method: asNullableString(body?.shipping_method) ?? "bmwt",
    shipping_cost: shippingCost != null ? Math.max(0, shippingCost) : 4,
    image_urls: imageUrls,
    thumbnail_url:
      asNullableString(body?.thumbnail_url) ?? imageUrls[0] ?? null,
    featured: asBoolean(body?.featured),
    is_premium: asBoolean(body?.is_premium),
    tags: asTags(body?.tags),
    notes: asNullableString(body?.notes),
  };

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("Admin shop listings create error:", error);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ listing: data });
}

export async function DELETE(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const { searchParams } = request.nextUrl;
  const idFromQuery = asString(searchParams.get("id"));

  let id = idFromQuery;

  if (!id) {
    try {
      const body = await request.json();
      id = asString(body?.id);
    } catch {
      id = null;
    }
  }

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { error } = await supabase.from("shop_listings").delete().eq("id", id);

  if (error) {
    console.error("Admin shop listings delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete listing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
