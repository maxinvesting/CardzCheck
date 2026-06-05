/**
 * PATCH /api/marketplace/orders/[id]
 *
 * Drives the fulfillment lifecycle:
 *   - action="mark_shipped"     (seller/admin): label_created|paid -> shipped
 *   - action="confirm_delivery" (buyer):        shipped -> delivered
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminAuth } from "@/lib/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["mark_shipped", "confirm_delivery"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { action } = parsed.data;

  const service = await createServiceClient();
  const { data: tx, error } = await service
    .from("transactions")
    .select("id, seller_id, buyer_id, fulfillment_status, tracking_number")
    .eq("id", id)
    .single<{
      id: string;
      seller_id: string;
      buyer_id: string;
      fulfillment_status: string;
      tracking_number: string | null;
    }>();

  if (error || !tx) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const { user: adminUser } = await getAdminAuth();
  const isAdmin = !!adminUser;

  if (action === "mark_shipped") {
    if (!(tx.seller_id === user.id || isAdmin)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!["paid", "label_created"].includes(tx.fulfillment_status)) {
      return NextResponse.json(
        { error: "invalid_status", status: tx.fulfillment_status },
        { status: 409 }
      );
    }
    const { error: upErr } = await service
      .from("transactions")
      .update({ fulfillment_status: "shipped", shipped_at: new Date().toISOString() })
      .eq("id", tx.id);
    if (upErr) {
      return NextResponse.json({ error: "update_failed", message: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, fulfillment_status: "shipped" });
  }

  // confirm_delivery
  if (!(tx.buyer_id === user.id || isAdmin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (tx.fulfillment_status !== "shipped") {
    return NextResponse.json(
      { error: "invalid_status", status: tx.fulfillment_status },
      { status: 409 }
    );
  }
  const { error: upErr } = await service
    .from("transactions")
    .update({ fulfillment_status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", tx.id);
  if (upErr) {
    return NextResponse.json({ error: "update_failed", message: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, fulfillment_status: "delivered" });
}
