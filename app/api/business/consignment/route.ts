import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createConsignmentOrder, listConsignmentOrders } from "@/lib/business/consignment";
import { cardSchema, errorResponse, getUserId } from "./_shared";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  consignor: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(120).optional().nullable(),
  sent_date: dateSchema.optional().nullable(),
  sold_date: dateSchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  fees_total_cents: z.number().int().min(0).optional().nullable(),
  cards: z.array(cardSchema).min(1).max(500),
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
