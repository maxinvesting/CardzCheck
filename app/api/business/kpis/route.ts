import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusinessMetrics } from "@/lib/business/actions";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), ".cursor");
const LOG_PATH = join(LOG_DIR, "debug-0cd298.log");
const DEBUG_LOG = (message: string, data: Record<string, unknown>, hypothesisId: string) => {
  const payload = { sessionId: "0cd298", location: "app/api/business/kpis/route.ts", message, data, timestamp: Date.now(), hypothesisId };
  if (process.env.NODE_ENV !== "production") {
    console.error("[DEBUG 0cd298]", message, JSON.stringify(data));
  }
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify(payload) + "\n");
  } catch (_) {
    try {
      appendFileSync(join(process.cwd(), "debug-0cd298.log"), JSON.stringify(payload) + "\n");
    } catch (_2) {}
  }
  fetch("http://127.0.0.1:7756/ingest/04790cae-4707-4277-87a7-63a499fa61d1", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "0cd298" },
    body: JSON.stringify(payload),
  }).catch(() => {});
};

export async function GET(request: NextRequest) {
  try {
    // #region agent log
    DEBUG_LOG("KPIs GET start", {}, "H1");
    // #endregion
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
    // #region agent log
    DEBUG_LOG("KPIs success", { activeInventoryCount: metrics.activeInventoryCount }, "H1");
    // #endregion
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
    // #region agent log
    DEBUG_LOG("KPIs catch", { message: err?.message, code: err?.code }, "H1");
    // #endregion
    if (err?.status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Business KPIs error:", err);
    return NextResponse.json({ error: "Failed to load KPIs" }, { status: 500 });
  }
}
