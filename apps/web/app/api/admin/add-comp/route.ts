import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

function isBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdminUser(request);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as {
      skuId: string;
      priceCents: string;
      soldAt: string;
      source?: string;
      externalId?: string;
      raw?: Record<string, unknown>;
    };

    if (!isBytes32(body.skuId)) {
      return NextResponse.json({ error: "skuId must be 0x-prefixed bytes32" }, { status: 400 });
    }

    const price = BigInt(body.priceCents);
    if (price <= 0n) {
      return NextResponse.json({ error: "priceCents must be > 0" }, { status: 400 });
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("sold_comps")
      .insert({
        id: randomUUID(),
        sku_id: body.skuId.toLowerCase(),
        price_cents: price.toString(),
        sold_at: body.soldAt,
        source: body.source ?? "ebay_sold",
        external_id: body.externalId ?? null,
        raw: body.raw ?? {},
      })
      .select("id, sku_id, price_cents, sold_at, source, external_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "add comp failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
