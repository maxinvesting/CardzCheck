import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { getMessagingOverview } from "@/lib/messaging/service";
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingChips,
  buildBriefingObservations,
  buildBriefingUserPrompt,
  buildFallbackBriefingNarrative,
} from "@/lib/messaging/briefing";

const FORBIDDEN_PATTERNS = [
  /\$\s?\d/,
  /\d+\s?%/,
  /\byou should\b/i,
  /\brespond to\b/i,
  /\breply to\b/i,
  /\bfollow up\b/i,
  /\bcounter\b/i,
  /\baccept\b/i,
  /\bdecline\b/i,
  /\bconsider\b/i,
  /\brecommend/i,
  /\bbest move\b/i,
  /\bnext step\b/i,
  /\bmake sure\b/i,
  /\bdon'?t forget\b/i,
  /\bprioritize\b/i,
  /\bfocus on\b/i,
];

function isSafe(text: string): boolean {
  return !FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requireBusinessOwnerContext(user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Owner access required";
    const status = (error as { status?: number })?.status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  const overview = await getMessagingOverview(user.id, "all");
  const observations = buildBriefingObservations(overview.threads);
  const chips = buildBriefingChips(observations);
  const fallback = buildFallbackBriefingNarrative(observations);

  let narrative = fallback;
  let source: "ai" | "fallback" = "fallback";

  if (process.env.ANTHROPIC_API_KEY && observations.openConversations > 0) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 220,
        system: BRIEFING_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: buildBriefingUserPrompt(observations) },
        ],
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text.trim())
        .join("\n")
        .trim();
      if (text && isSafe(text)) {
        narrative = text;
        source = "ai";
      }
    } catch (err) {
      console.warn("[sales-briefing] generation failed, using fallback:", err);
    }
  }

  return NextResponse.json({
    narrative,
    chips,
    observations,
    source,
    generatedAt: new Date().toISOString(),
  });
}
