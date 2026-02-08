import { NextRequest, NextResponse } from "next/server";
import { getGradeEstimateJob } from "@/lib/grading/gradeEstimateJobStore";
import type { GradeEstimateJobStatusResponse } from "@/lib/grading/gradeEstimateJob";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId" },
      { status: 400 }
    );
  }

  const job = getGradeEstimateJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

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
}
