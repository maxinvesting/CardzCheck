import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string; compId: string }> };

// PATCH /api/cards/[id]/comps/[compId] — toggle selection or update match quality
export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id: cardId, compId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify card ownership (RLS also enforces this, but explicit check gives a useful 404)
  const { data: card } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.is_selected === "boolean") {
    updates.is_selected = body.is_selected;
  }
  const allowedQualities = ["exact", "near", "weak"];
  if (typeof body.match_quality === "string" && allowedQualities.includes(body.match_quality)) {
    updates.match_quality = body.match_quality;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: comp, error: updateError } = await supabase
    .from("card_comps")
    .update(updates)
    .eq("id", compId)
    .eq("card_id", cardId)
    .select()
    .single();

  if (updateError) {
    console.error("[PATCH /api/cards/[id]/comps/[compId]]", updateError);
    return NextResponse.json({ error: "Failed to update comp" }, { status: 500 });
  }

  return NextResponse.json({ comp });
}

// DELETE /api/cards/[id]/comps/[compId] — remove a comp
export async function DELETE(req: NextRequest, context: RouteContext) {
  const { id: cardId, compId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: card } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("card_comps")
    .delete()
    .eq("id", compId)
    .eq("card_id", cardId);

  if (deleteError) {
    console.error("[DELETE /api/cards/[id]/comps/[compId]]", deleteError);
    return NextResponse.json({ error: "Failed to delete comp" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
