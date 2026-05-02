import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeListingCmv } from "@/lib/marketplace/pricing";

export const runtime = "nodejs";

const listingCreateSchema = z.object({
  card_id: z.string().uuid(),
  mode: z.enum(["self_serve", "full_service"]),
  // Only honored when mode='self_serve'. Ignored for full_service.
  list_price_cents: z.number().int().positive().optional(),
  fulfilled_by: z.enum(["seller", "platform"]).optional(),
});

export async function POST(req: NextRequest) {
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

  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const service = await createServiceClient();
  const { data: card, error: cardError } = await service
    .from("marketplace_cards")
    .select("id, intake_approved")
    .eq("id", input.card_id)
    .single();

  if (cardError || !card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }
  if (!card.intake_approved) {
    return NextResponse.json(
      { error: "card_not_approved" },
      { status: 422 }
    );
  }

  const cmv = await computeListingCmv(input.card_id);

  let listPriceCents: number;
  if (input.mode === "full_service") {
    if (cmv.mid_cents === null) {
      return NextResponse.json(
        { error: "cmv_unavailable", source: cmv.source },
        { status: 422 }
      );
    }
    // Server enforces price = CMV mid for full-service. Any client-supplied
    // list_price_cents is silently ignored per spec.
    listPriceCents = cmv.mid_cents;
  } else {
    if (!input.list_price_cents) {
      return NextResponse.json(
        { error: "list_price_required_for_self_serve" },
        { status: 400 }
      );
    }
    listPriceCents = input.list_price_cents;
  }

  // Fee tier and pipeline are placeholders here; PR #5 (fees) finalizes
  // tier resolution. Initial values: self-serve -> one_pct, full-service -> five_pct.
  const initialFeeTier =
    input.mode === "self_serve" ? "one_pct" : "five_pct";

  const fulfilledBy =
    input.fulfilled_by ??
    (input.mode === "full_service" ? "platform" : "seller");

  const { data: listing, error: insertError } = await service
    .from("listings")
    .insert({
      card_id: input.card_id,
      seller_id: user.id,
      mode: input.mode,
      status: "active",
      list_price_cents: listPriceCents,
      cmv_low_cents: cmv.low_cents,
      cmv_mid_cents: cmv.mid_cents,
      cmv_high_cents: cmv.high_cents,
      pipeline: "standard",
      fee_tier: initialFeeTier,
      fulfilled_by: fulfilledBy,
    })
    .select("id, list_price_cents, mode, status, cmv_low_cents, cmv_mid_cents, cmv_high_cents")
    .single();

  if (insertError || !listing) {
    console.error("listings insert failed", insertError);
    return NextResponse.json(
      { error: "listing_insert_failed", message: insertError?.message },
      { status: 500 }
    );
  }

  await service.from("pricing_history").insert({
    listing_id: listing.id,
    old_price_cents: null,
    new_price_cents: listPriceCents,
    reason: "initial",
    changed_by: user.id,
  });

  if (input.mode === "full_service") {
    await service.from("vault_inventory").insert({
      listing_id: listing.id,
      intake_status: "pending",
    });
  }

  return NextResponse.json({
    listing,
    cmv,
  });
}
