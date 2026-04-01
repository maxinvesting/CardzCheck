import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { generateAIReply } from "@/lib/messaging/service";
import {
  MARKETPLACE_REPLY_ACTIONS,
  type MarketplaceReplyAction,
} from "@/lib/messaging/reply-drafts";

const VALID_ACTIONS = MARKETPLACE_REPLY_ACTIONS.map((action) => action.id);

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
  const body = await req.json().catch(() => null);
  const action = (body?.action ?? "smart_reply") as MarketplaceReplyAction;
  const sellerNote =
    typeof body?.sellerNote === "string" ? body.sellerNote.trim() : undefined;

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await generateAIReply(user.id, threadId, action, sellerNote);

  return NextResponse.json(result);
}
