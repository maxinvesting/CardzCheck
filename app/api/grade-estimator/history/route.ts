import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { GradeEstimatorHistoryRun } from "@/types";

const MAX_GRADE_ESTIMATOR_RUNS = 25;

function isDataUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.trim().startsWith("data:");
}

function sanitizeHistoryCard(
  card: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!card || typeof card !== "object") return card;
  const imageUrl =
    typeof card.imageUrl === "string" && !isDataUrl(card.imageUrl)
      ? card.imageUrl.trim()
      : undefined;
  const imageUrls = Array.isArray(card.imageUrls)
    ? card.imageUrls.filter(
        (url) => typeof url === "string" && url.trim() && !isDataUrl(url)
      )
    : [];
  const sanitized = { ...card } as Record<string, unknown>;
  if (imageUrl) {
    sanitized.imageUrl = imageUrl;
  } else if (imageUrls.length > 0) {
    sanitized.imageUrl = imageUrls[0]?.trim();
  } else {
    delete sanitized.imageUrl;
  }
  delete sanitized.imageUrls;
  return sanitized;
}

// GET /api/grade-estimator/history - Get user's recent grade estimator runs
export async function GET() {
  try {
    if (isTestMode()) {
      return NextResponse.json({ runs: [] });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: runs, error } = await supabase
      .from("grade_estimator_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_GRADE_ESTIMATOR_RUNS);

    if (error) {
      console.error("Error fetching grade estimator runs:", error);
      return NextResponse.json(
        { error: "Failed to fetch grade estimator runs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ runs: (runs ?? []) as GradeEstimatorHistoryRun[] });
  } catch (error) {
    console.error("Grade estimator history GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/grade-estimator/history - Delete a grade estimator run by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("id");

    if (!runId || typeof runId !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (isTestMode()) {
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("grade_estimator_runs")
      .delete()
      .eq("id", runId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting grade estimator run:", error);
      return NextResponse.json(
        { error: "Failed to delete grade estimator run" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Grade estimator history DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/grade-estimator/history - Save a new grade estimator run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, card, estimate, postGradingValue } = body ?? {};
    const sanitizedCard = sanitizeHistoryCard(card);

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (
      !sanitizedCard ||
      typeof sanitizedCard.player_name !== "string"
    ) {
      return NextResponse.json(
        { error: "card.player_name is required" },
        { status: 400 }
      );
    }

    if (
      typeof estimate?.estimated_grade_low !== "number" ||
      typeof estimate?.estimated_grade_high !== "number"
    ) {
      return NextResponse.json(
        { error: "estimate is required" },
        { status: 400 }
      );
    }

    if (isTestMode()) {
      return NextResponse.json({
        run: {
          id: `test-grade-run-${Date.now()}`,
          user_id: "test-user",
          job_id: jobId,
          card: sanitizedCard,
          estimate,
          post_grading_value: postGradingValue ?? null,
          created_at: new Date().toISOString(),
        },
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: run, error } = await supabase
      .from("grade_estimator_runs")
      .upsert(
        {
          user_id: user.id,
          job_id: jobId,
          card: sanitizedCard,
          estimate,
          post_grading_value: postGradingValue ?? null,
        },
        { onConflict: "user_id,job_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving grade estimator run:", error);
      return NextResponse.json(
        { error: "Failed to save grade estimator run" },
        { status: 500 }
      );
    }

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Grade estimator history POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
