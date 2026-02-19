import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listInventory,
  listSales,
  inventoryToCsv,
  salesToCsv,
} from "@/lib/business/actions";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const type = request.nextUrl.searchParams.get("type") || "inventory";
    const date = new Date().toISOString().slice(0, 10);

    if (type === "sales") {
      const sales = await listSales(user.id);
      const csv = salesToCsv(sales);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cardzcheck-sales-${date}.csv"`,
        },
      });
    }

    const items = await listInventory(user.id);
    const csv = inventoryToCsv(items);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cardzcheck-inventory-${date}.csv"`,
      },
    });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business export error:", err);
    return NextResponse.json(
      { error: "Failed to export" },
      { status: 500 }
    );
  }
}
