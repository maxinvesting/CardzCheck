import { NextRequest, NextResponse } from "next/server";
import { deleteConsignmentOrder } from "@/lib/business/consignment";
import { errorResponse, getUserId } from "../_shared";

type Params = { params: Promise<{ orderId: string }> };

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
