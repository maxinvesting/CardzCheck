import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInventoryItem } from "@/lib/business/actions";

type RouteContext = { params: Promise<{ itemId: string; targetId: string }> };

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { itemId, targetId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inventory = await getInventoryItem(user.id, itemId);
  if (!inventory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: target, error: targetErr } = await supabase
    .from("business_card_targets")
    .select("*")
    .eq("id", targetId)
    .eq("inventory_item_id", itemId)
    .maybeSingle();

  if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing Anthropic API key" }, { status: 500 });
  }

  const cmvCents =
    inventory.last_known_price_cents ??
    (inventory.estimated_cmv != null ? Math.round(inventory.estimated_cmv * 100) : null) ??
    (inventory.est_cmv != null ? Math.round(inventory.est_cmv * 100) : null);

  const cardLabel = [
    inventory.year,
    inventory.player_name,
    inventory.set_name,
    inventory.parallel_type,
    inventory.card_number ? `#${inventory.card_number}` : null,
    inventory.grading_company,
    inventory.grade != null ? String(inventory.grade) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const cardJson = {
    label: cardLabel,
    cost_basis: fmtCents(inventory.cost_basis_total_cents),
    current_market_value: fmtCents(cmvCents),
    your_list_price: fmtCents(inventory.list_price_cents),
    status: inventory.status,
    channel: inventory.channel,
    acquisition_date: inventory.acquisition_date,
    quantity: inventory.quantity ?? 1,
  };

  const targetJson = {
    kind: target.kind,
    description: target.description,
    target_price: fmtCents(target.target_price_cents),
    target_date: target.target_date,
    status: target.status,
  };

  const system = `You are a sports card flipping strategist. Given a single card position and a user-defined target/goal, return a concise actionable insight.

Output rules:
- Output MUST be valid JSON ONLY (no markdown, no fences).
- Schema: { "progress_pct": number | null, "status": "on_track" | "ahead" | "behind" | "blocked" | "unknown", "headline": string (one line, under 80 chars), "actions": string[] (1-3 concrete next steps), "risks": string[] (0-2 specific risks), "summary": string (2-3 sentences) }
- progress_pct is 0-100 if computable for sell_price/flip_by targets, else null.
- Be specific to the card and target. Reference real numbers from the data.
- Do NOT hedge with disclaimers about being an AI.`;

  const userMessage = `CARD POSITION:
${JSON.stringify(cardJson, null, 2)}

TARGET / GOAL:
${JSON.stringify(targetJson, null, 2)}

Today's date: ${new Date().toISOString().slice(0, 10)}

Return the JSON insight per the schema.`;

  const anthropic = new Anthropic({ apiKey });

  let insightText = "";
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const textBlocks = response.content.filter((b) => b.type === "text");
    insightText = textBlocks
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI call failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persist the raw text — the UI parses it on read.
  const { data: updated, error: updateErr } = await supabase
    .from("business_card_targets")
    .update({
      ai_insight: insightText,
      ai_insight_at: new Date().toISOString(),
    })
    .eq("id", targetId)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ target: updated });
}
