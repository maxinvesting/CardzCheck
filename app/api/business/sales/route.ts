import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listSales,
  createSale,
  updateSale,
  deleteSale,
} from "@/lib/business/actions";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const sales = await listSales(userId, {
      inventoryItemId: searchParams.get("inventory_item_id") || undefined,
      startDate: searchParams.get("start_date") || undefined,
      endDate: searchParams.get("end_date") || undefined,
    });

    return NextResponse.json({ sales });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business sales GET error:", err);
    return NextResponse.json(
      { error: "Failed to load sales" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const sale = await createSale(userId, body);
    return NextResponse.json(sale, { status: 201 });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business sales POST error:", err);
    return NextResponse.json(
      { error: "Failed to create sale" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id)
      return NextResponse.json(
        { error: "Sale id required" },
        { status: 400 }
      );

    const sale = await updateSale(userId, id, updates);
    return NextResponse.json(sale);
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business sales PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update sale" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = request.nextUrl.searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "Sale id required" },
        { status: 400 }
      );

    await deleteSale(userId, id);
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business sales DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete sale" },
      { status: 500 }
    );
  }
}
