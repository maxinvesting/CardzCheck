import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusinessMetrics } from "@/lib/business/actions";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // range is accepted for compatibility, but the payload returns both MTD and YTD.
    void request.nextUrl.searchParams.get("range");

    const metrics = await getBusinessMetrics(user.id);
    return NextResponse.json({
      revenue_mtd_cents: metrics.revenueMtd,
      revenue_ytd_cents: metrics.revenueYtd,
      profit_mtd_cents: metrics.profitMtd,
      profit_ytd_cents: metrics.profitYtd,
      sales_count_mtd: metrics.salesCountMtd,
      sales_count_ytd: metrics.salesCountYtd,
      active_inventory_count: metrics.activeInventoryCount,
    });
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Business KPIs error:", err);
    return NextResponse.json({ error: "Failed to load KPIs" }, { status: 500 });
  }
}
