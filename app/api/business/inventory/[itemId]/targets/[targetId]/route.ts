import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ itemId: string; targetId: string }> };

const ALLOWED_STATUS = ["active", "achieved", "abandoned"] as const;

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { itemId, targetId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.description === "string") updates.description = body.description.trim();
  if (body.target_price_cents !== undefined) {
    const n = body.target_price_cents == null ? null : Number(body.target_price_cents);
    updates.target_price_cents = n == null ? null : Math.round(n);
  }
  if (body.target_date !== undefined) {
    updates.target_date = typeof body.target_date === "string" && body.target_date.trim() ? body.target_date : null;
  }
  if (typeof body.status === "string" && (ALLOWED_STATUS as readonly string[]).includes(body.status)) {
    updates.status = body.status;
    if (body.status === "achieved") updates.achieved_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("business_card_targets")
    .update(updates)
    .eq("id", targetId)
    .eq("inventory_item_id", itemId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { itemId, targetId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("business_card_targets")
    .delete()
    .eq("id", targetId)
    .eq("inventory_item_id", itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
