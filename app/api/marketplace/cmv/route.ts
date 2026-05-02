import { NextRequest, NextResponse } from "next/server";
import { computeListingCmv } from "@/lib/marketplace/pricing";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get("card_id");
  if (!cardId) {
    return NextResponse.json({ error: "card_id_required" }, { status: 400 });
  }

  try {
    const cmv = await computeListingCmv(cardId);
    return NextResponse.json(cmv);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return NextResponse.json({ error: "card_not_found" }, { status: 404 });
    }
    console.error("[marketplace/cmv]", err);
    return NextResponse.json({ error: "cmv_failed" }, { status: 500 });
  }
}
