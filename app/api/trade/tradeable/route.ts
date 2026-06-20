import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  item_id: z.string().uuid(),
  tradeable: z.boolean(),
});

/**
 * POST /api/trade/tradeable
 *
 * Flag (or unflag) one of the caller's collection items as "Available for
 * Trade". RLS scopes the update to the owner, so the .eq(user_id) is defense in
 * depth. A sold/pending/traded card can't be made tradeable.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { item_id, tradeable } = parsed.data;
  const { data, error } = await supabase
    .from("collection_items")
    .update({ is_tradeable: tradeable })
    .eq("id", item_id)
    .eq("user_id", user.id)
    .not("status", "in", "(sold,pending_sale,traded)")
    .select("id, is_tradeable")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, is_tradeable: (data as { is_tradeable: boolean }).is_tradeable });
}
