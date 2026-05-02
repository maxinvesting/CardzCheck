import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const decideSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  pipeline: z.enum(["standard", "elite", "grails"]).optional(),
  rejection_reason: z.string().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ card_id: string }> }
) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const { card_id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { decision, pipeline, rejection_reason } = parsed.data;

  const service = await createServiceClient();
  const { data: card, error: loadErr } = await service
    .from("marketplace_cards")
    .select("id, intake_approved")
    .eq("id", card_id)
    .single();
  if (loadErr || !card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (decision === "approve") {
    const finalPipeline = pipeline ?? "standard";
    const { error: updErr } = await service
      .from("marketplace_cards")
      .update({
        intake_approved: true,
        pipeline_assigned_at: now,
      })
      .eq("id", card_id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    await service.from("intake_log").insert({
      card_id,
      submitted_by: admin.user.id,
      approved: true,
      rejection_reason: null,
      pipeline_assigned: finalPipeline,
      decided_by: admin.user.id,
      decided_at: now,
    });

    return NextResponse.json({ ok: true, pipeline: finalPipeline });
  }

  const { error: updErr } = await service
    .from("marketplace_cards")
    .update({ intake_approved: false })
    .eq("id", card_id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await service.from("intake_log").insert({
    card_id,
    submitted_by: admin.user.id,
    approved: false,
    rejection_reason: rejection_reason ?? "admin_rejected",
    pipeline_assigned: null,
    decided_by: admin.user.id,
    decided_at: now,
  });

  return NextResponse.json({ ok: true, decision: "rejected" });
}
