import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import {
  buildSubmissionComparisonRows,
  buildSubmissionSummary,
  computeSubmissionItemMetrics,
} from "@/lib/grading/submissions/compute";
import {
  syncCollectionItemsFromSubmission,
  toSubmissionItemRecord,
  toSubmissionRecord,
} from "@/lib/grading/submissions/db";
import { updateSubmissionSchema } from "@/lib/grading/submissions/schemas";
import type {
  GradingSubmissionItemRecord,
  GradingSubmissionRecord,
} from "@/lib/grading/submissions/types";

function paidUpgradeResponse() {
  return NextResponse.json(
    {
      error: "upgrade_required",
      message: "Submission Builder is a paid feature.",
    },
    { status: 403 }
  );
}

async function loadSubmissionDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  submissionId: string
): Promise<
  | {
      submission: GradingSubmissionRecord;
      items: GradingSubmissionItemRecord[];
      summary: ReturnType<typeof buildSubmissionSummary>;
      comparison_rows: ReturnType<typeof buildSubmissionComparisonRows>;
    }
  | null
> {
  const { data: submissionRow, error: submissionError } = await supabase
    .from("grading_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("user_id", userId)
    .single();

  if (submissionError || !submissionRow) {
    return null;
  }

  const { data: itemRows, error: itemError } = await supabase
    .from("grading_submission_items")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const submission = toSubmissionRecord(submissionRow as Record<string, unknown>);
  const items = (itemRows ?? []).map((row: Record<string, unknown>) =>
    toSubmissionItemRecord(row)
  );
  const computedById = new Map(
    computeSubmissionItemMetrics(submission, items).map((item) => [item.id, item] as const)
  );

  const itemsWithComputed = items.map((item: GradingSubmissionItemRecord) => {
    const computed = computedById.get(item.id);
    return {
      ...item,
      expected_profit_cents: computed?.expected_profit_cents ?? 0,
      below_break_even_probability: computed?.below_break_even_probability ?? null,
      break_even_grade: computed?.break_even_grade ?? item.break_even_grade,
    };
  });

  return {
    submission,
    items: itemsWithComputed,
    summary: buildSubmissionSummary(submission, items),
    comparison_rows: buildSubmissionComparisonRows(items),
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isTestMode()) {
      return NextResponse.json({
        submission: null,
        items: [],
        summary: {
          total_cards: 0,
          total_estimated_fees_cents: 0,
          total_expected_value_cents: 0,
          total_expected_profit_cents: 0,
          downside_percent: 0,
        },
        comparison_rows: [],
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isPaidUser = await checkLegacyProAccess(user.id);
    if (!isPaidUser) {
      return paidUpgradeResponse();
    }

    const detail = await loadSubmissionDetail(supabase, user.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Grading submission detail GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isTestMode()) {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json({
        submission: {
          id,
          user_id: "test-user",
          name: body?.name ?? "Test submission",
          mode: body?.mode === "actual" ? "actual" : "mock",
          grader: "psa",
          status: body?.status ?? "draft",
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

    const isPaidUser = await checkLegacyProAccess(user.id);
    if (!isPaidUser) {
      return paidUpgradeResponse();
    }

    const body = await request.json();
    const parsed = updateSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from("grading_submissions")
      .update(parsed.data)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updatedRow) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const updatedSubmission = toSubmissionRecord(updatedRow as Record<string, unknown>);
    let syncResult: { synced: number; skipped: number } | null = null;

    if (
      updatedSubmission.mode === "actual" &&
      (updatedSubmission.status === "received" || updatedSubmission.status === "completed")
    ) {
      const { data: rows, error: rowsError } = await supabase
        .from("grading_submission_items")
        .select("*")
        .eq("submission_id", updatedSubmission.id)
        .eq("user_id", user.id)
        .not("actual_grade", "is", null);

      if (rowsError) {
        console.error("Failed to fetch submission items for collection sync:", rowsError);
      } else {
        const items = (rows ?? []).map((row: Record<string, unknown>) =>
          toSubmissionItemRecord(row)
        );
        syncResult = await syncCollectionItemsFromSubmission(supabase, {
          userId: user.id,
          grader: updatedSubmission.grader,
          items,
        });
      }
    }

    const detail = await loadSubmissionDetail(supabase, user.id, id);
    if (!detail) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...detail,
      sync: syncResult,
    });
  } catch (error) {
    console.error("Grading submission detail PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
