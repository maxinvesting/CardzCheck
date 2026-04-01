import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("shop_listings")
      .select(
        "id,player_name,year,set_brand,parallel_variant,grade,condition,sport,price,ai_insight,ai_insight_at"
      )
      .eq("id", id)
      .eq("status", "active")
      .eq("publish_state", "published")
      .single();

    if (error || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Return cached insight if fresh
    if (listing.ai_insight && listing.ai_insight_at) {
      const age = Date.now() - new Date(listing.ai_insight_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({ insight: listing.ai_insight, cached: true });
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const cardLabel = [
      listing.year,
      listing.player_name,
      listing.set_brand,
      listing.parallel_variant,
      listing.grade || (listing.condition === "raw" ? "Raw" : null),
    ]
      .filter(Boolean)
      .join(" ");

    const systemPrompt = `You are a concise sports card market analyst for CardzCheck Deals — a subscriber-exclusive storefront that sells cards at least 13.5% below eBay storefront prices.

Write a 2–3 sentence market insight for a specific card listing. Cover:
1. Why this card/player is relevant right now (use web search to verify current status)
2. Market positioning or collectibility angle
3. One sentence on why this listing is worth considering

Rules:
- Be direct and specific, not generic
- Use relative terms not exact figures ("strong recent activity", "trending up")
- Do not guarantee investment returns
- Write for a buyer deciding whether to purchase
- Do NOT mention the price or discount — those are shown separately`;

    const anthropic = new Anthropic({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        } as any,
      ],
      messages: [
        {
          role: "user",
          content: `Write a market insight for this listing: ${cardLabel} (${listing.sport || "Sports Card"}, priced at $${listing.price})`,
        },
      ],
    });

    const insight = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!insight) {
      return NextResponse.json({ error: "No insight generated" }, { status: 500 });
    }

    // Cache in DB (fire and forget — don't block the response)
    createServiceClient()
      .then((svc) =>
        svc
          .from("shop_listings")
          .update({ ai_insight: insight, ai_insight_at: new Date().toISOString() })
          .eq("id", id)
          .then(({ error: updateError }) => {
            if (updateError) console.error("Failed to cache ai_insight:", updateError);
          })
      )
      .catch((err) => console.error("ai_insight cache write skipped:", err));

    return NextResponse.json({ insight, cached: false });
  } catch (err) {
    console.error("ai-insight route error:", err);
    return NextResponse.json(
      { error: "Failed to generate insight" },
      { status: 500 }
    );
  }
}
