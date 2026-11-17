import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createConsignmentOrder, listConsignmentOrders } from "@/lib/business/consignment";
import { errorResponse, getUserId, manualItemSchema } from "./_shared";


const createSchema = z.object({
  consignor: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(120).optional().nullable(),
  sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  inventory_item_ids: z.array(z.string().uuid()).max(500).optional(),
  manual_items: z.array(manualItemSchema).max(500).optional(),
});

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ orders: await listConsignmentOrders(userId) });
  } catch (err) {
    return errorResponse(err, "Failed to load consignment orders");
  }
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const order = await createConsignmentOrder(userId, parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to create consignment order");
  }
}
