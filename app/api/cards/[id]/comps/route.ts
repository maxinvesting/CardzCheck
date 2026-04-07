import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CardComp } from "@/types/comps";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/cards/[id]/comps — fetch comps + CMV for a card
export async function GET(req: NextRequest, context: RouteContext) {
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
  const { data: card, error: cardError } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cardError) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const [compsResult, cmvResult] = await Promise.all([
    supabase
      .from("card_comps")
      .select("*")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false }),
    supabase
      .from("card_cmv")
      .select("*")
      .eq("card_id", cardId)
      .maybeSingle(),
  ]);

  if (compsResult.error) {
    return NextResponse.json({ error: "Failed to fetch comps" }, { status: 500 });
  }

  return NextResponse.json({
    comps: compsResult.data ?? [],
    cmv: cmvResult.data ?? null,
  });
}

// POST /api/cards/[id]/comps — add a comp manually
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
  const { data: card, error: cardError } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cardError) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const price = Number(body.price);

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }

  const allowedQualities = ["exact", "near", "weak"];
  const match_quality = allowedQualities.includes(body.match_quality as string)
    ? (body.match_quality as CardComp["match_quality"])
    : "near";

  const insert = {
    card_id: cardId,
    title,
    price,
    date_sold: typeof body.date_sold === "string" && body.date_sold ? body.date_sold : null,
    source: typeof body.source === "string" && body.source ? body.source : "ebay",
    grade: typeof body.grade === "string" && body.grade ? body.grade : null,
    match_quality,
    is_selected: true,
    ebay_url: typeof body.ebay_url === "string" && body.ebay_url ? body.ebay_url : null,
  };

  const { data: comp, error: insertError } = await supabase
    .from("card_comps")
    .insert(insert)
    .select()
    .single();

  if (insertError) {
    console.error("[POST /api/cards/[id]/comps]", insertError);
    return NextResponse.json({ error: "Failed to add comp" }, { status: 500 });
  }

  return NextResponse.json({ comp }, { status: 201 });
}
