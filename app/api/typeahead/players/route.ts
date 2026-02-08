import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { searchPlayers } from "@/lib/card-data";

const MIN_QUERY_LENGTH = 2;
const MAX_ROWS = 50;
const MAX_RESULTS = 10;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (isTestMode()) {
      const results = searchPlayers(q).map((player) => ({
        id: player.name,
        label: player.name,
      }));
      return NextResponse.json({ results });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cards")
      .select("player_name")
      .ilike("player_name", `%${q}%`)
      .limit(MAX_ROWS);

    if (error) {
      console.error("Player typeahead error:", error);
      const results = searchPlayers(q).map((player) => ({
        id: player.name,
        label: player.name,
      }));
      return NextResponse.json({ results });
    }

    const names = (data ?? []).map((row: any) => row.player_name).filter((name: any) => Boolean(name));
    const unique = Array.from(new Set(names))
      .slice(0, MAX_RESULTS)
      .map((name) => ({ id: name, label: name }));

    return NextResponse.json({ results: unique });
  } catch (error) {
    console.error("Player typeahead error:", error);
    const results = searchPlayers(q).map((player) => ({
      id: player.name,
      label: player.name,
    }));
    return NextResponse.json({ results });
  }
}
