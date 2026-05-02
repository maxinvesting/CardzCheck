import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const overrideSchema = z.object({
  list_price_cents: z.number().int().positive(),
  reason: z.string().max(300).optional(),
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
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { list_price_cents } = parsed.data;

  const service = await createServiceClient();
  const { data: listing, error } = await service
    .from("listings")
    .select("id, list_price_cents, pipeline")
    .eq("id", id)
    .single();
  if (error || !listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Spec: price overrides only allowed for elite + grails pipelines.
  if (!["elite", "grails"].includes(listing.pipeline)) {
    return NextResponse.json(
      { error: "override_not_allowed_for_pipeline" },
      { status: 422 }
    );
  }

  const { error: updErr } = await service
    .from("listings")
    .update({ list_price_cents })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await service.from("pricing_history").insert({
    listing_id: id,
    old_price_cents: listing.list_price_cents,
    new_price_cents: list_price_cents,
    reason: "manual",
    changed_by: admin.user.id,
  });

  return NextResponse.json({ ok: true, list_price_cents });
}
