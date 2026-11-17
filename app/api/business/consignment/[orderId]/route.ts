import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteConsignmentOrder, updateConsignmentOrder } from "@/lib/business/consignment";
import { errorResponse, getUserId, manualItemSchema } from "../_shared";

const updateSchema = z.object({
  consignor: z.string().trim().min(1).max(120).optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  add_inventory_item_ids: z.array(z.string().uuid()).max(500).optional(),
  add_manual_items: z.array(manualItemSchema).max(500).optional(),
  remove_item_ids: z.array(z.string().uuid()).max(500).optional(),
  item_costs: z.array(z.object({ id: z.string().uuid(), cost_cents: z.number().int().min(0) })).max(500).optional(),
});

type Params = { params: Promise<{ orderId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json({ order: await updateConsignmentOrder(userId, orderId, parsed.data) });
  } catch (err) {
    return errorResponse(err, "Failed to update consignment order");
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderId } = await params;
  try {
    await deleteConsignmentOrder(userId, orderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete consignment order");
  }
}
