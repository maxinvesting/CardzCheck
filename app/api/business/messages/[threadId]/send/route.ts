import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendReply } from "@/lib/messaging/service";

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
  const message = body.message;

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }

  const result = await sendReply(user.id, threadId, message.trim());

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to send", isDemo: result.isDemo },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, isDemo: result.isDemo });
}
