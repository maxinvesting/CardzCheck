import { NextRequest, NextResponse } from "next/server";
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
