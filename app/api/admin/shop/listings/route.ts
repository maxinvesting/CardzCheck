import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

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
  const id = body?.id;
  const updates = body?.updates as Record<string, unknown>;

  if (!id || typeof updates !== "object") {
    return NextResponse.json(
      { error: "id and updates required" },
      { status: 400 }
    );
  }

  const allowedKeys = [
    "price",
    "status",
    "featured",
    "shipping_method",
    "shipping_cost",
    "cmv",
    "quantity",
    "notes",
    "description",
    "image_urls",
    "thumbnail_url",
  ];
  const filtered: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in updates) {
      filtered[key] = updates[key];
    }
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
  const { player_name, year, set_brand, grade, price, quantity } = body ?? {};

  if (
    !player_name ||
    typeof year !== "number" ||
    !set_brand ||
    !grade ||
    typeof price !== "number"
  ) {
    return NextResponse.json(
      { error: "player_name, year, set_brand, grade, price required" },
      { status: 400 }
    );
  }

  const supabase = await createServiceClient();
  const insert = {
    player_name: String(player_name),
    year: Number(year),
    set_brand: String(set_brand),
    grade: String(grade),
    price: Number(price),
    quantity: quantity != null ? Number(quantity) : 1,
    status: "active",
    parallel_variant: body.parallel_variant ?? null,
    card_number: body.card_number ?? null,
    cert_number: body.cert_number ?? null,
    sport: body.sport ?? "Football",
    cmv: body.cmv ?? null,
    shipping_method: body.shipping_method ?? "bmwt",
    shipping_cost: body.shipping_cost ?? 4,
    image_urls: body.image_urls ?? [],
    thumbnail_url: body.thumbnail_url ?? null,
  };

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
