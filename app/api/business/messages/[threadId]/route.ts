import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getThread, getMessages, getNegotiationAnalysis } from "@/lib/messaging/service";

export async function GET(
  _req: NextRequest,
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

  const [thread, messages, negotiation] = await Promise.all([
    getThread(user.id, threadId),
    getMessages(user.id, threadId),
    getNegotiationAnalysis(user.id, threadId),
  ]);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ thread, messages, negotiation });
}
