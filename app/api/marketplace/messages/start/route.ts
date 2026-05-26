/**
 * POST /api/marketplace/messages/start
 *
 * Body: { sellerId?, listingId?, transactionId?, subject?, body? }
 *
 * Used by the listing page, order-confirmed page, and seller profile to
 * open (or resume) a buyer<->seller thread. Resolves the seller from the
 * listing or transaction if `sellerId` isn't passed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startCardzcheckThread } from "@/lib/messaging/adapters/cardzcheck";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let sellerId: string | null =
    typeof payload.sellerId === "string" ? payload.sellerId : null;
  const listingId: string | null =
    typeof payload.listingId === "string" ? payload.listingId : null;
  const transactionId: string | null =
    typeof payload.transactionId === "string" ? payload.transactionId : null;
  const subject: string | null =
    typeof payload.subject === "string" ? payload.subject : null;
  const body: string | null =
    typeof payload.body === "string" ? payload.body : null;

  // Resolve seller from listing if not explicitly provided.
  if (!sellerId && listingId) {
    const { data: row } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("id", listingId)
      .maybeSingle();
    sellerId = (row as { seller_id?: string } | null)?.seller_id ?? null;
  }
  // Or from a transaction.
  if (!sellerId && transactionId) {
    const { data: row } = await supabase
      .from("transactions")
      .select("seller_id")
      .eq("id", transactionId)
      .maybeSingle();
    sellerId = (row as { seller_id?: string } | null)?.seller_id ?? null;
  }

  if (!sellerId) {
    return NextResponse.json(
      { error: "Could not resolve a seller for this conversation." },
      { status: 400 }
    );
  }

  try {
    const { threadId, created } = await startCardzcheckThread({
      buyerId: user.id,
      sellerId,
      listingId,
      transactionId,
      subject,
      body,
    });
    return NextResponse.json({ threadId, created }, { status: created ? 201 : 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unable to start conversation.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
