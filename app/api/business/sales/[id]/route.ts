import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteSale, updateSale } from "@/lib/business/actions";
import { updateSaleSchema } from "@/lib/business/sales-schemas";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sale = await updateSale(userId, id, parsed.data);
    return NextResponse.json(sale);
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err?.status === 400)
      return NextResponse.json({ error: err.message }, { status: 400 });
    if (err?.status === 404)
      return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("Business sales PATCH error:", err);
    return NextResponse.json({ error: "Failed to update sale" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await deleteSale(userId, id);
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    if (err?.status === 400)
      return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("Business sales DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 });
  }
}
