/**
 * POST /api/bulk/batches/[batchId]/process
 *
 * Trigger the full processing pipeline for all pending items in a batch.
 * Runs identification → pricing → shipping → strategy → draft sequentially.
 *
 * This is designed for MVP simplicity. For production at scale, this
 * should be replaced with a background job queue (e.g., Supabase Edge
 * Functions + pg_notify or an external job runner).
 *
 * WARNING: This request may take several minutes for large batches
 * because it makes one AI call per item. The client should handle
 * a long timeout or poll the batch status separately.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processBatch } from "@/lib/bulk/pipeline";

type Params = { params: Promise<{ batchId: string }> };

// Maximum items we'll process in a single API request to avoid timeouts
const MAX_PROCESS_PER_REQUEST = 50;

export async function POST(_request: NextRequest, { params }: Params) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify batch belongs to user and is in a processable state
  const { data: batch, error: batchError } = await supabase
    .from("bulk_batches")
    .select("id, status, item_count")
    .eq("id", batchId)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  if (batch.status === "archived") {
    return NextResponse.json({ error: "Cannot process an archived batch" }, { status: 400 });
  }

  if (batch.status === "processing") {
    return NextResponse.json({ error: "Batch is already being processed" }, { status: 409 });
  }

  // Check item count limit
  if ((batch.item_count ?? 0) > MAX_PROCESS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Batch has ${batch.item_count} items. Max ${MAX_PROCESS_PER_REQUEST} per process call. Use pagination.` },
      { status: 400 }
    );
  }

  try {
    const result = await processBatch(supabase, batchId);

    return NextResponse.json({
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[api/bulk/batches/[batchId]/process] error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
