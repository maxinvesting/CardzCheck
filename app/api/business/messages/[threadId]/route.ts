import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getThread,
  getMessages,
  getNegotiationAnalysisForThread,
  sendMessage,
} from "@/lib/messaging/service";
import { getEbayRawDebug } from "@/lib/messaging/adapters/ebay";
import { isCardzcheckThreadId } from "@/lib/messaging/adapters/cardzcheck";

// Freemium: reading and replying to a thread is available to any authenticated
// participant (RLS scopes access to the buyer/seller of the thread). The paid
// AI deal-desk is gated separately on the ai-reply endpoint.
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
  const debug = _req.nextUrl.searchParams.get("debug") === "1";

  const thread = await getThread(user.id, threadId);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (debug) {
    // Debug payload only applies to eBay threads.
    const raw = isCardzcheckThreadId(threadId)
      ? { note: "CardzCheck threads have no external raw payload." }
      : await getEbayRawDebug(user.id, threadId);
    return NextResponse.json({ thread, raw });
  }

  const [messages, negotiation] = await Promise.all([
    getMessages(user.id, threadId),
    Promise.resolve(getNegotiationAnalysisForThread(thread)),
  ]);

  return NextResponse.json({ thread, messages, negotiation });
}

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
  const payload = await req.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const thread = await getThread(user.id, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    const message = await sendMessage(user.id, threadId, body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
