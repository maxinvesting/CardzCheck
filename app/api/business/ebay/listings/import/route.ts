/**
 * POST /api/business/ebay/listings/import
 * Start an async import job to pull existing eBay listings into CardzCheck inventory.
 * Returns immediately with a jobId — client polls /api/business/ebay/import-jobs/[jobId]
 * for progress.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import { importListings } from "@/lib/ebay/selling/import";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessOwnerContext(user.id);

    // Verify eBay account is connected
    const { data: account } = await supabase
      .from("ebay_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: "No active eBay account connected. Connect your eBay account in Business Settings." },
        { status: 400 }
      );
    }

    // Create the import job record
    const { data: job, error: jobError } = await supabase
      .from("ebay_import_jobs")
      .insert({ user_id: user.id, job_type: "listings", status: "pending" })
      .select("id")
      .single();

    if (jobError || !job) throw jobError ?? new Error("Failed to create import job");

    // Run import asynchronously (fire-and-forget — client polls for progress)
    // Using void + catch to avoid hanging the response
    void importListings(user.id, job.id).catch((err) => {
      console.error("[ebay/listings/import] background error:", err);
    });

    return NextResponse.json({ jobId: job.id, status: "pending" }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start import";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
