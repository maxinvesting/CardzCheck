import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessFeature } from "@/lib/access";
import { extractScanPhotos } from "@/lib/grading/gradeEstimateImages";
import {
  createGradeEstimateJob,
} from "@/lib/grading/gradeEstimateJobStore";
import { runGradeEstimateJob } from "@/lib/grading/gradeEstimateJob";
import type { GradeEstimateJobStatusResponse } from "@/lib/grading/gradeEstimateJob";
import { createGradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateServer";
import { isTestMode } from "@/lib/test-mode";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import type { CardIdentity } from "@/lib/card-identity/types";
import type { GradeScanPhoto } from "@/types";

// Same time budget as the start route — refinement re-runs the full grade model.
export const maxDuration = 300;

type GradeRefinePayload = {
  correctionText: string;
  imageUrl?: string;
  imageUrls?: string[];
  front_url?: string;
  back_url?: string;
  closeups?: Array<{ url?: string; kind?: string; sort_order?: number }>;
  scanPhotos?: GradeScanPhoto[];
  card?: GradeEstimatorCardInput;
  priorIdentity?: CardIdentity;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const access = await canAccessFeature(user.id, "grade_estimator");
    if (!access.allowed) {
      return NextResponse.json(
        {
          error: access.reason ?? "Grade Probability Engine is not available.",
          code: "FEATURE_ACCESS_DENIED",
        },
        { status: 403 }
      );
    }

    // Refinements are always free — no credit consumption, no budget gate.
    // Token usage is still recorded as a side effect inside the model call.
    // In test mode, skip everything (consistent with start route behavior).
    if (!isTestMode()) {
      // No-op: intentionally no credit/budget check for refinements.
    }

    const body = (await request.json()) as GradeRefinePayload;

    // Validate correction text
    const correctionText = body.correctionText?.trim() ?? "";
    if (!correctionText) {
      return NextResponse.json(
        { error: "correctionText is required" },
        { status: 400 }
      );
    }
    if (correctionText.length > 500) {
      return NextResponse.json(
        { error: "correctionText must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    const scanPhotos = extractScanPhotos(body);

    if (scanPhotos.length === 0) {
      return NextResponse.json(
        { error: "Missing card images" },
        { status: 400 }
      );
    }

    if (!scanPhotos.some((p) => p.kind === "front") || !scanPhotos.some((p) => p.kind === "back")) {
      return NextResponse.json(
        { error: "Front and back photos are required." },
        { status: 400 }
      );
    }

    const job = createGradeEstimateJob();
    const deps = createGradeEstimateJobDependencies(user.id);

    await runGradeEstimateJob(
      job,
      {
        scanPhotos,
        card: body.card ?? null,
        correctionText,
        // Skip OCR — reuse the identity from the original scan to save time and cost.
        skipOcrIdentity: !!body.priorIdentity,
        priorIdentity: body.priorIdentity,
      },
      deps
    );

    const response: GradeEstimateJobStatusResponse = {
      jobId: job.jobId,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      steps: job.steps,
      partial: job.partial,
      final: job.final ?? null,
      error: job.error ?? null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Grade estimate refine error:", error);
    return NextResponse.json(
      { error: "Failed to refine grade estimate" },
      { status: 500 }
    );
  }
}
