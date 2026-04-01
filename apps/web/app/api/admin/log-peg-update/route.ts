import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdminUser(request);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as {
      skuId: string;
      pegPrice: string;
      method: number;
      n: number;
      windowSeconds: number;
      salesHash: string;
      observedAt: string;
      nonce: string;
      txHash?: string;
    };

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("peg_updates")
      .insert({
        id: randomUUID(),
        sku_id: body.skuId.toLowerCase(),
        peg_price: body.pegPrice,
        method: body.method,
        n: body.n,
        window_seconds: body.windowSeconds,
        sales_hash: body.salesHash,
        observed_at: body.observedAt,
        nonce: body.nonce,
        tx_hash: body.txHash ?? null,
      })
      .select("id, sku_id, peg_price, observed_at, nonce, tx_hash")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "log peg update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
