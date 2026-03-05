import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

function isBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      skuId: string;
      name: string;
      imageUrl?: string;
      details?: Record<string, unknown>;
    };

    if (!isBytes32(body.skuId)) {
      return NextResponse.json({ error: "skuId must be 0x-prefixed bytes32" }, { status: 400 });
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("skus")
      .insert({
        id: randomUUID(),
        sku_id: body.skuId.toLowerCase(),
        name: body.name.trim(),
        image_url: body.imageUrl?.trim() || null,
        details: body.details ?? {},
      })
      .select("id, sku_id, name, image_url, details, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "create sku failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
