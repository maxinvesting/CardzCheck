import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const setFeeSchema = z.object({
  negotiated_fee_cents: z.number().int().nonnegative(),
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
  const parsed = setFeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = await createServiceClient();
  const { data: listing, error } = await service
    .from("listings")
    .select("id, pipeline, fee_tier")
    .eq("id", id)
    .single();
  if (error || !listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (listing.pipeline !== "elite") {
    return NextResponse.json(
      { error: "negotiated_fee_only_for_elite" },
      { status: 422 }
    );
  }

  const { error: updErr } = await service
    .from("listings")
    .update({
      negotiated_fee_cents: parsed.data.negotiated_fee_cents,
      fee_tier: "negotiated",
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    negotiated_fee_cents: parsed.data.negotiated_fee_cents,
  });
}
