import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { generateAIReply, type AIReplyTone } from "@/lib/messaging/service";

const VALID_TONES: AIReplyTone[] = [
  "professional",
  "friendly",
  "firm",
  "negotiate",
  "decline",
  "accept",
  "ask_details",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
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
    const message =
      error instanceof Error ? error.message : "Owner access required";
    const status = (error as { status?: number })?.status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { threadId } = await params;
  const body = await req.json();
  const tone = (body.tone ?? "professional") as AIReplyTone;
  const hint = typeof body.hint === "string" ? body.hint.trim() : undefined;

  if (!VALID_TONES.includes(tone)) {
    return NextResponse.json({ error: "Invalid tone" }, { status: 400 });
  }

  const result = await generateAIReply(user.id, threadId, tone, hint);

  return NextResponse.json({ reply: result.text, source: result.source });
}
