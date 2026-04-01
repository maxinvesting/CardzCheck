/**
 * POST /api/business/ebay/sales/import
 * Start an async import job to pull past eBay sales into business_sales.
 * Optional body: { lookback_days: number } (default 90).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { importSales } from "@/lib/ebay/selling/import";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessOwnerContext(user.id);

    const { data: account } = await supabase
      .from("ebay_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: "No active eBay account connected." },
        { status: 400 }
      );
    }

    let lookbackDays = 90;
    try {
      const body = await req.json();
      if (typeof body?.lookback_days === "number" && body.lookback_days > 0) {
        lookbackDays = Math.min(body.lookback_days, 730); // max 2 years
      }
    } catch {
      // No body or non-JSON — use default
    }

    const { data: job, error: jobError } = await supabase
      .from("ebay_import_jobs")
      .insert({ user_id: user.id, job_type: "sales", status: "pending" })
      .select("id")
      .single();

    if (jobError || !job) throw jobError ?? new Error("Failed to create import job");

    void importSales(user.id, job.id, { lookbackDays }).catch((err) => {
      console.error("[ebay/sales/import] background error:", err);
    });

    return NextResponse.json({ jobId: job.id, status: "pending" }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start sales import";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
