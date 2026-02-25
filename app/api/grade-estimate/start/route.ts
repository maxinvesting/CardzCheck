import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessFeature } from "@/lib/access";
import { extractImageUrls } from "@/lib/grading/gradeEstimateImages";
import {
  createGradeEstimateJob,
} from "@/lib/grading/gradeEstimateJobStore";
import { runGradeEstimateJob } from "@/lib/grading/gradeEstimateJob";
import { createGradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateServer";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";

type GradeEstimateStartPayload = {
  imageUrl?: string;
  imageUrls?: string[];
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
    const imageUrls = extractImageUrls(body);

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Missing image URL" },
        { status: 400 }
      );
    }

    if (imageUrls.length > 8) {
      return NextResponse.json(
        { error: "Too many images", reason: "Maximum 8 images allowed" },
        { status: 400 }
      );
    }

    const job = createGradeEstimateJob();
    const deps = createGradeEstimateJobDependencies();

    void runGradeEstimateJob(
      job,
      {
        imageUrls,
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
