/**
 * POST /api/bulk/batches/[batchId]/items
 *
 * Add one or more card image slots to a batch.
 * Accepts an array of { primaryImageUrl, secondaryImageUrl? } objects.
 *
 * Images must already be uploaded to Supabase Storage or be accessible
 * public URLs before calling this endpoint. This endpoint only stores
 * the URL references; it does not upload binary data.
 *
 * Max 100 items per request.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ batchId: string }> };

const MAX_ITEMS_PER_REQUEST = 100;

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify batch belongs to user (explicit user_id check — do not rely on RLS alone)
  const { data: batch, error: batchError } = await supabase
    .from("bulk_batches")
    .select("id, status, user_id")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (batch.status === "archived") {
    return NextResponse.json({ error: "Cannot add items to an archived batch" }, { status: 400 });
  }

  let body: { items?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items array is required" }, { status: 400 });
  }

  if (body.items.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Max ${MAX_ITEMS_PER_REQUEST} items per request` },
      { status: 400 }
    );
  }

  // Validate and build insert rows
  const rows: Array<{
    batch_id: string;
    position: number;
    primary_image_url: string;
    secondary_image_url: string | null;
    status: "pending";
  }> = [];

  const validationErrors: string[] = [];

  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i] as Record<string, unknown>;

    if (!isValidUrl(item.primaryImageUrl)) {
      validationErrors.push(`Item ${i}: primaryImageUrl is required and must be a valid HTTPS URL`);
      continue;
    }

    const secondaryUrl = item.secondaryImageUrl;
    if (secondaryUrl !== undefined && secondaryUrl !== null && !isValidUrl(secondaryUrl)) {
      validationErrors.push(`Item ${i}: secondaryImageUrl must be a valid HTTPS URL if provided`);
      continue;
    }

    rows.push({
      batch_id: batchId,
      position: i,
      primary_image_url: item.primaryImageUrl as string,
      secondary_image_url: (secondaryUrl as string | null) ?? null,
      status: "pending",
    });
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: validationErrors }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("bulk_batch_items")
    .insert(rows)
    .select();

  if (insertError) {
    console.error("[api/bulk/batches/[batchId]/items] insert error:", insertError.message);
    return NextResponse.json({ error: "Failed to add items" }, { status: 500 });
  }

  // Update batch item_count
  await supabase.rpc("increment_bulk_batch_item_count", {
    p_batch_id: batchId,
    p_increment: rows.length,
  }).then((rpcResult: { error: unknown }) => {
    if (rpcResult.error) {
      // Non-fatal: log and continue — item_count is denormalized for display only
      console.warn("[api/bulk/batches/[batchId]/items] item_count increment failed:", rpcResult.error);
    }
  });

  return NextResponse.json(
    { created: inserted?.length ?? 0, items: inserted ?? [] },
    { status: 201 }
  );
}
