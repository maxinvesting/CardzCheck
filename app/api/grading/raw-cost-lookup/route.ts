import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface LookupRequest {
  card: {
    player_name?: string;
    year?: string;
    set_name?: string;
    parallel_type?: string;
    card_number?: string;
  };
}

function normalize(value?: string | null): string {
  return (value ?? "").toLowerCase().trim();
}

function scoreMatch(
  card: LookupRequest["card"],
  candidate: {
    player_name?: string | null;
    year?: string | null;
    set_name?: string | null;
    parallel_type?: string | null;
    card_number?: string | null;
    title?: string | null;
  }
): number {
  let score = 0;
  const player = normalize(card.player_name);
  const year = normalize(card.year);
  const setName = normalize(card.set_name);
  const parallel = normalize(card.parallel_type);
  const number = normalize(card.card_number);
  const candidateTitle = normalize(candidate.title);

  if (player && (normalize(candidate.player_name) === player || candidateTitle.includes(player))) {
    score += 5;
  }
  if (year && (normalize(candidate.year) === year || candidateTitle.includes(year))) {
    score += 3;
  }
  if (setName && (normalize(candidate.set_name) === setName || candidateTitle.includes(setName))) {
    score += 4;
  }
  if (parallel && normalize(candidate.parallel_type).includes(parallel)) {
    score += 2;
  }
  if (number && normalize(candidate.card_number) === number) {
    score += 2;
  }
  return score;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LookupRequest;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const card = body?.card ?? {};
    if (!card.player_name && !card.set_name) {
      return NextResponse.json({ rawCost: null, source: null });
    }

    const [collectionRes, inventoryRes] = await Promise.all([
      supabase
        .from("collection_items")
        .select(
          "id, player_name, year, set_name, parallel_type, card_number, purchase_price, cost_basis_total_cents, title"
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("business_inventory_items")
        .select("id, title, cost_basis_total_cents")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

    const candidates: Array<{
      source: "collection" | "business_inventory";
      score: number;
      rawCost: number | null;
      matchedId: string;
    }> = [];

    for (const row of collectionRes.data ?? []) {
      const score = scoreMatch(card, row);
      const rawCost =
        typeof row.purchase_price === "number"
          ? row.purchase_price
          : typeof row.cost_basis_total_cents === "number"
          ? row.cost_basis_total_cents / 100
          : null;
      if (score > 0 && rawCost !== null) {
        candidates.push({
          source: "collection",
          score,
          rawCost,
          matchedId: row.id,
        });
      }
    }

    for (const row of inventoryRes.data ?? []) {
      const score = scoreMatch(card, {
        title: row.title,
      });
      const rawCost =
        typeof row.cost_basis_total_cents === "number"
          ? row.cost_basis_total_cents / 100
          : null;
      if (score > 0 && rawCost !== null) {
        candidates.push({
          source: "business_inventory",
          score,
          rawCost,
          matchedId: row.id,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0];

    return NextResponse.json({
      rawCost: winner?.rawCost ?? null,
      source: winner?.source ?? null,
      matchedId: winner?.matchedId ?? null,
    });
  } catch (error) {
    console.error("Raw cost lookup failed:", error);
    return NextResponse.json(
      { error: "Failed to lookup raw cost" },
      { status: 500 }
    );
  }
}
