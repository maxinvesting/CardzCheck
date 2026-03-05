import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessFeature } from "@/lib/access";
import { extractScanPhotos } from "@/lib/grading/gradeEstimateImages";
import {
  createGradeEstimateJob,
} from "@/lib/grading/gradeEstimateJobStore";
import { runGradeEstimateJob } from "@/lib/grading/gradeEstimateJob";
import { createGradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateServer";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import type { GradeScanPhoto } from "@/types";
import {
  GRADE_SCAN_MAX_CLOSEUPS,
  GRADE_SCAN_MAX_TOTAL_PHOTOS,
} from "@/lib/grading/scanPhotos";

type GradeEstimateStartPayload = {
  imageUrl?: string;
  imageUrls?: string[];
  front_url?: string;
  back_url?: string;
  closeups?: Array<{ url?: string; kind?: string; sort_order?: number }>;
  scanPhotos?: GradeScanPhoto[];
  card?: GradeEstimatorCardInput;
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

    const body = (await request.json()) as GradeEstimateStartPayload;
    const scanPhotos = extractScanPhotos(body);

    if (scanPhotos.length === 0) {
      return NextResponse.json(
        { error: "Missing card images" },
        { status: 400 }
      );
    }

    if (!scanPhotos.some((photo) => photo.kind === "front") || !scanPhotos.some((photo) => photo.kind === "back")) {
      return NextResponse.json(
        { error: "Front and back photos are required." },
        { status: 400 }
      );
    }

    const closeupCount = scanPhotos.filter(
      (photo) => photo.kind !== "front" && photo.kind !== "back"
    ).length;

    if (scanPhotos.length > GRADE_SCAN_MAX_TOTAL_PHOTOS) {
      return NextResponse.json(
        {
          error: "Too many images",
          reason: `Maximum ${GRADE_SCAN_MAX_TOTAL_PHOTOS} images allowed`,
        },
        { status: 400 }
      );
    }

    if (closeupCount > GRADE_SCAN_MAX_CLOSEUPS) {
      return NextResponse.json(
        {
          error: "Too many close-up images",
          reason: `Maximum ${GRADE_SCAN_MAX_CLOSEUPS} close-up images allowed`,
        },
        { status: 400 }
      );
    }

    const job = createGradeEstimateJob();
    const deps = createGradeEstimateJobDependencies();

    void runGradeEstimateJob(
      job,
      {
        scanPhotos,
        card: body.card ?? null,
      },
      deps
    );

    return NextResponse.json({ jobId: job.jobId });
  } catch (error) {
    console.error("Grade estimate job start error:", error);
    return NextResponse.json(
      { error: "Failed to start grade estimate" },
      { status: 500 }
    );
  }
}
