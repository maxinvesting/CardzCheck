import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateCmvFromComps } from "@/lib/comps/calculate-cmv";
import type { CardComp } from "@/types/comps";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/cards/[id]/cmv/calculate
// Reads all selected comps, computes CMV, upserts card_cmv, and backfills
// collection_items.estimated_cmv for backward compat with collection summaries.
export async function POST(req: NextRequest, context: RouteContext) {
  const { id: cardId } = await context.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: card } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Fetch all comps (selected + not selected) to compute counts
  const { data: allComps, error: compsError } = await supabase
    .from("card_comps")
    .select("*")
    .eq("card_id", cardId);

  if (compsError) {
    return NextResponse.json({ error: "Failed to fetch comps" }, { status: 500 });
  }

  const comps = (allComps ?? []) as CardComp[];
  const selected = comps.filter((c) => c.is_selected);
  const excluded = comps.filter((c) => !c.is_selected);

  const calculation = calculateCmvFromComps(selected);

  // Build the upsert payload for card_cmv
  const cmvRow = calculation
    ? {
        card_id: cardId,
        cmv_value: calculation.cmv_value,
        cmv_low: calculation.cmv_low,
        cmv_high: calculation.cmv_high,
        confidence: calculation.confidence,
        comps_count: calculation.comps_count,
        excluded_count: excluded.length,
        last_updated: new Date().toISOString(),
      }
    : {
        card_id: cardId,
        cmv_value: null,
        cmv_low: null,
        cmv_high: null,
        confidence: "low" as const,
        comps_count: 0,
        excluded_count: excluded.length,
        last_updated: new Date().toISOString(),
      };

  const { data: cmv, error: upsertError } = await supabase
    .from("card_cmv")
    .upsert(cmvRow, { onConflict: "card_id" })
    .select()
    .single();

  if (upsertError) {
    console.error("[POST /api/cards/[id]/cmv/calculate]", upsertError);
    return NextResponse.json({ error: "Failed to save CMV" }, { status: 500 });
  }

  // Backfill collection_items.estimated_cmv so collection/inventory summaries
  // reflect the new value without requiring any other changes.
  if (calculation) {
    await supabase
      .from("collection_items")
      .update({
        estimated_cmv: calculation.cmv_value,
        cmv_confidence: calculation.confidence,
        cmv_last_updated: new Date().toISOString(),
      })
      .eq("id", cardId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ cmv });
}
