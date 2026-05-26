/**
 * GET /api/marketplace/messages/[threadId]
 * POST /api/marketplace/messages/[threadId]
 *
 * Buyer-side reads/writes for a single CardzCheck marketplace thread.
 * RLS ensures only participants can hit these.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCardzcheckThread,
  getCardzcheckMessages,
  sendCardzcheckMessage,
} from "@/lib/messaging/adapters/cardzcheck";

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
  const [thread, messages] = await Promise.all([
    getCardzcheckThread(user.id, threadId),
    getCardzcheckMessages(user.id, threadId),
  ]);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ thread, messages });
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

  try {
    const message = await sendCardzcheckMessage(user.id, threadId, body);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send message.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
