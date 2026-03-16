/**
 * GET    /api/bulk/batches/[batchId]  — get batch with all items + related data
 * PATCH  /api/bulk/batches/[batchId]  — update batch (name, status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasBusinessAccess } from "@/lib/access";

type Params = { params: Promise<{ batchId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isBusiness = await hasBusinessAccess(user.id);
  if (!isBusiness) {
    return NextResponse.json(
      { error: "Business subscription required to use Bulk Mode" },
      { status: 403 }
    );
  }

  // Load batch — explicit user_id check guards against RLS misconfiguration
  const { data: batch, error: batchError } = await supabase
    .from("bulk_batches")
    .select("*")
    .eq("id", batchId)
    .eq("user_id", user.id)
    .single();

  if (batchError || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  // Load all items with their related rows
  const { data: items, error: itemsError } = await supabase
    .from("bulk_batch_items")
    .select(`
      *,
      identification:bulk_item_identifications(*),
      pricing:bulk_item_pricing(*),
      strategy:bulk_item_strategy(*),
      draft:bulk_listing_drafts(*)
    `)
    .eq("batch_id", batchId)
    .order("position", { ascending: true });

  if (itemsError) {
    console.error("[api/bulk/batches/[batchId]] items error:", itemsError.message);
    return NextResponse.json({ error: "Failed to load items" }, { status: 500 });
  }

  // Normalize related rows: Supabase returns arrays for one-to-many;
  // for our unique-indexed tables, extract the first (and only) element
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizedItems = (items ?? []).map((item: any) => ({
    item: {
      id: item.id,
      batch_id: item.batch_id,
      position: item.position,
      status: item.status,
      primary_image_url: item.primary_image_url,
      secondary_image_url: item.secondary_image_url,
      created_at: item.created_at,
      updated_at: item.updated_at,
    },
    identification: Array.isArray(item.identification)
      ? item.identification[0] ?? null
      : item.identification ?? null,
    pricing: Array.isArray(item.pricing)
      ? item.pricing[0] ?? null
      : item.pricing ?? null,
    strategy: Array.isArray(item.strategy)
      ? item.strategy[0] ?? null
      : item.strategy ?? null,
    draft: Array.isArray(item.draft)
      ? item.draft[0] ?? null
      : item.draft ?? null,
  }));

  return NextResponse.json({ batch, items: normalizedItems });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isBusiness = await hasBusinessAccess(user.id);
  if (!isBusiness) {
    return NextResponse.json(
      { error: "Business subscription required to use Bulk Mode" },
      { status: 403 }
    );
  }

  let body: { name?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Batch name too long (max 120 characters)" }, { status: 400 });
    updates.name = name;
  }

  if (typeof body.status === "string") {
    const VALID_STATUSES = ["pending", "processing", "ready", "archived"];
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  const { data: batch, error } = await supabase
    .from("bulk_batches")
    .update(updates)
    .eq("id", batchId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[api/bulk/batches/[batchId]] PATCH error:", error.message);
    return NextResponse.json({ error: "Failed to update batch" }, { status: 500 });
  }

  return NextResponse.json({ batch });
}
