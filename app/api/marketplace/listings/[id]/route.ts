import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminAuth } from "@/lib/admin";

export const runtime = "nodejs";

const listingPatchSchema = z
  .object({
    list_price_cents: z.number().int().positive().optional(),
    status: z
      .enum(["active", "price_reduced", "flagged", "removed", "sold"])
      .optional(),
    fulfilled_by: z.enum(["seller", "platform"]).optional(),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listingId } = await params;

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

  const parsed = listingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const patch = parsed.data;

  const service = await createServiceClient();
  const { data: listing, error: loadError } = await service
    .from("listings")
    .select("id, seller_id, mode, status, list_price_cents")
    .eq("id", listingId)
    .single();

  if (loadError || !listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isSeller = listing.seller_id === user.id;
  const adminCheck = await getAdminAuth();
  const isAdminUser = !!adminCheck.user;

  if (!isSeller && !isAdminUser) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Server-enforced price guard: full-service price changes require admin.
  if (
    patch.list_price_cents !== undefined &&
    patch.list_price_cents !== listing.list_price_cents &&
    listing.mode === "full_service" &&
    !isAdminUser
  ) {
    return NextResponse.json(
      { error: "price_locked_full_service" },
      { status: 403 }
    );
  }

  const update: Record<string, unknown> = {};
  if (patch.list_price_cents !== undefined) {
    update.list_price_cents = patch.list_price_cents;
  }
  if (patch.status !== undefined) {
    if (!isAdminUser && !sellerAllowedStatusTransition(listing.status, patch.status)) {
      return NextResponse.json(
        { error: "status_transition_not_allowed" },
        { status: 403 }
      );
    }
    update.status = patch.status;
  }
  if (patch.fulfilled_by !== undefined) {
    if (!isAdminUser) {
      return NextResponse.json(
        { error: "fulfilled_by_admin_only" },
        { status: 403 }
      );
    }
    update.fulfilled_by = patch.fulfilled_by;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ listing });
  }

  const { data: updated, error: updateError } = await service
    .from("listings")
    .update(update)
    .eq("id", listingId)
    .select("id, list_price_cents, status, mode, fulfilled_by")
    .single();

  if (updateError || !updated) {
    console.error("listing patch failed", updateError);
    return NextResponse.json(
      { error: "update_failed", message: updateError?.message },
      { status: 500 }
    );
  }

  if (
    patch.list_price_cents !== undefined &&
    patch.list_price_cents !== listing.list_price_cents
  ) {
    await service.from("pricing_history").insert({
      listing_id: listingId,
      old_price_cents: listing.list_price_cents,
      new_price_cents: patch.list_price_cents,
      reason: "manual",
      changed_by: user.id,
    });
  }

  return NextResponse.json({ listing: updated });
}

function sellerAllowedStatusTransition(
  current: string,
  next: string
): boolean {
  // Sellers may withdraw their own listing only.
  return next === "removed" && (current === "active" || current === "price_reduced");
}
