import { NextRequest, NextResponse } from "next/server";
import { reopenConsignmentOrder } from "@/lib/business/consignment";
import { errorResponse, getUserId } from "../../_shared";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderId } = await params;
  try {
    return NextResponse.json({ order: await reopenConsignmentOrder(userId, orderId) });
  } catch (err) {
    return errorResponse(err, "Failed to reopen consignment order");
  }
}
