/**
 * GET /api/business/ebay/import-jobs/[jobId]
 * Poll import job status for the live progress bar in EbayImportWizard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import type { EbayImportJob } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    const { jobId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await requireBusinessAccess(user.id);

    const { data: job, error } = await supabase
      .from("ebay_import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    return NextResponse.json(job as EbayImportJob);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch job";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
