/**
 * PATCH /api/bulk/batches/[batchId]/items/[itemId]
 *
 * Update an item's status (e.g., approved, skipped) from the review UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ batchId: string; itemId: string }> };

const VALID_STATUSES = ["pending", "identified", "priced", "approved", "skipped"];

export async function PATCH(request: NextRequest, { params }: Params) {
  const { batchId, itemId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Explicit ownership check (defense in depth — do not rely on RLS alone)
  const { data: batch, error: batchError } = await supabase
    .from("bulk_batches")
    .select("id, user_id")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: item, error } = await supabase
    .from("bulk_batch_items")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("batch_id", batchId)
    .select()
    .single();

  if (error) {
    console.error("[api/bulk/batches/[batchId]/items/[itemId]] PATCH error:", error.message);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}
