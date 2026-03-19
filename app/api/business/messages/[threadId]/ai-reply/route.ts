import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

  const { threadId } = await params;
  const body = await req.json();
  const tone = (body.tone ?? "professional") as AIReplyTone;

  if (!VALID_TONES.includes(tone)) {
    return NextResponse.json({ error: "Invalid tone" }, { status: 400 });
  }

  const reply = await generateAIReply(user.id, threadId, tone);

  return NextResponse.json({ reply });
}
