import { NextRequest, NextResponse } from "next/server";
import { searchPlayers, searchCardSets, GRADING_OPTIONS } from "@/lib/card-data";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const query = searchParams.get("query") || "";

    switch (type) {
      case "players":
        const players = searchPlayers(query);
        return NextResponse.json(players);

      case "sets":
        const sets = searchCardSets(query);
        return NextResponse.json(sets);

      case "grades":
        return NextResponse.json(GRADING_OPTIONS);

      default:
        return NextResponse.json(
          { error: "Invalid type. Use: players, sets, or grades" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Card suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 }
    );
  }
}
