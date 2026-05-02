import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const decisionSchema = z.object({
  action: z.enum(["remove", "return_to_seller", "convert_to_self_serve"]),
  return_reason: z.string().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { action, return_reason } = parsed.data;

  const service = await createServiceClient();
  const { data: listing, error: loadErr } = await service
    .from("listings")
    .select("id, status, mode, list_price_cents")
    .eq("id", id)
    .single();
  if (loadErr || !listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (listing.status !== "flagged") {
    return NextResponse.json(
      { error: "listing_not_flagged" },
      { status: 422 }
    );
  }

  const now = new Date().toISOString();

  if (action === "remove") {
    await service.from("listings").update({ status: "removed" }).eq("id", id);
    await service
      .from("vault_inventory")
      .update({ returned_at: now, return_reason: "removed_at_day60" })
      .eq("listing_id", id);
  } else if (action === "return_to_seller") {
    await service.from("listings").update({ status: "removed" }).eq("id", id);
    await service
      .from("vault_inventory")
      .update({
        returned_at: now,
        return_reason: return_reason ?? "returned_at_day60",
      })
      .eq("listing_id", id);
  } else {
    // convert_to_self_serve
    await service
      .from("listings")
      .update({
        mode: "self_serve",
        status: "active",
        fulfilled_by: "seller",
        // self-serve uses one_pct flat regardless of prior tier
        fee_tier: "one_pct",
      })
      .eq("id", id);
  }

  await service.from("pricing_history").insert({
    listing_id: id,
    old_price_cents: listing.list_price_cents,
    new_price_cents: listing.list_price_cents,
    reason: "flagged_decision",
    changed_by: admin.user.id,
  });

  return NextResponse.json({ ok: true, action });
}
