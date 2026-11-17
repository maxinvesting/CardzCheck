import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { settleConsignmentOrder } from "@/lib/business/consignment";
import { errorResponse, getUserId } from "../../_shared";

const settleSchema = z.object({
  payout_total_cents: z.number().int().min(0),
  settled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  split_method: z.enum(["equal_loss", "proportional"]).default("equal_loss"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderId } = await params;
  const parsed = settleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json({ order: await settleConsignmentOrder(userId, orderId, parsed.data) });
  } catch (err) {
    return errorResponse(err, "Failed to settle consignment order");
  }
}
