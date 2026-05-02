import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMarketCmvForQuery } from "@/lib/market-discount/service";
import {
  intakeCardSchema,
  validateIntake,
  type IntakeCardInput,
} from "@/lib/marketplace/intake";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = intakeCardSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const card: IntakeCardInput = parsed.data;

  const soldCount = await resolveSoldCompsCount(card);
  const result = validateIntake(card, soldCount);

  const service = await createServiceClient();

  if (!result.approved) {
    await service.from("intake_log").insert({
      card_id: null,
      submitted_by: user.id,
      approved: false,
      rejection_reason: result.rejection_reason,
      pipeline_assigned: null,
    });
    return NextResponse.json(
      { approved: false, rejection_reason: result.rejection_reason },
      { status: 422 }
    );
  }

  const intakeApproved = !result.requires_manual_approval;
  const pipelineAssignedAt = intakeApproved ? new Date().toISOString() : null;

  const { data: cardRow, error: insertError } = await service
    .from("marketplace_cards")
    .insert({
      title: card.title,
      player: card.player,
      year: card.year,
      manufacturer: card.manufacturer,
      grade: card.grade,
      grading_service: card.grading_service,
      cert_number: card.cert_number ?? null,
      parallel: card.parallel ?? null,
      print_run: card.print_run ?? null,
      estimated_value_cents: card.estimated_value_cents,
      intake_approved: intakeApproved,
      pipeline_assigned_at: pipelineAssignedAt,
    })
    .select("id")
    .single();

  if (insertError || !cardRow) {
    console.error("marketplace_cards insert failed", insertError);
    return NextResponse.json(
      { error: "card_insert_failed", message: insertError?.message },
      { status: 500 }
    );
  }

  await service.from("intake_log").insert({
    card_id: cardRow.id,
    submitted_by: user.id,
    approved: true,
    rejection_reason: null,
    pipeline_assigned: result.pipeline,
    decided_by: intakeApproved ? user.id : null,
    decided_at: intakeApproved ? new Date().toISOString() : null,
  });

  return NextResponse.json({
    approved: true,
    card_id: cardRow.id,
    pipeline: result.pipeline,
    requires_manual_approval: result.requires_manual_approval,
    intake_approved: intakeApproved,
    sold_comps_count: soldCount,
  });
}

async function resolveSoldCompsCount(card: IntakeCardInput): Promise<number> {
  try {
    const result = await getMarketCmvForQuery({
      query: {
        player: card.player,
        year: String(card.year),
        set: card.title,
        grade: card.grade,
        parallelType: card.parallel ?? undefined,
      },
    });
    return result.cmv.soldCount ?? 0;
  } catch (error) {
    console.error("intake comps lookup failed", error);
    return 0;
  }
}
