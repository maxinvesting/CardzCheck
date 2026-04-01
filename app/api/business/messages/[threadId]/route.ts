import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import {
  getThread,
  getMessages,
  getNegotiationAnalysisForThread,
  sendMessage,
} from "@/lib/messaging/service";
import { getEbayRawDebug } from "@/lib/messaging/adapters/ebay";

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
  try {
    await requireBusinessOwnerContext(user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Owner access required";
    const status = (error as { status?: number })?.status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { threadId } = await params;
  const debug = _req.nextUrl.searchParams.get("debug") === "1";

  const thread = await getThread(user.id, threadId);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (debug) {
    const raw = await getEbayRawDebug(user.id, threadId);
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
  try {
    await requireBusinessOwnerContext(user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Owner access required";
    const status = (error as { status?: number })?.status ?? 403;
    return NextResponse.json({ error: message }, { status });
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
