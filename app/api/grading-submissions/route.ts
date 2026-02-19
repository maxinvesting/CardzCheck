import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import { createSubmissionSchema } from "@/lib/grading/submissions/schemas";
import { toSubmissionRecord } from "@/lib/grading/submissions/db";

function paidUpgradeResponse() {
  return NextResponse.json(
    {
      error: "upgrade_required",
      message: "Submission Builder is a paid feature.",
    },
    { status: 403 }
  );
}

export async function GET() {
  try {
    if (isTestMode()) {
      return NextResponse.json({ submissions: [] });
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

    const { data, error } = await supabase
      .from("grading_submissions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch grading submissions:", error);
      return NextResponse.json(
        { error: "Failed to fetch grading submissions" },
        { status: 500 }
      );
    }

    const submissions = (data ?? []).map((row: Record<string, unknown>) =>
      toSubmissionRecord(row)
    );

    const { data: itemRows, error: itemError } = await supabase
      .from("grading_submission_items")
      .select("submission_id, quantity")
      .eq("user_id", user.id);

    if (itemError) {
      console.error("Failed to fetch submission item counts:", itemError);
    }

    const itemCounts = new Map<string, { items: number; cards: number }>();
    (itemRows ?? []).forEach((row: Record<string, unknown>) => {
      const submissionId = String((row as { submission_id?: unknown }).submission_id ?? "");
      if (!submissionId) return;
      const quantityRaw = (row as { quantity?: unknown }).quantity;
      const quantity =
        typeof quantityRaw === "number" && Number.isFinite(quantityRaw)
          ? Math.max(1, Math.round(quantityRaw))
          : 1;
      const current = itemCounts.get(submissionId) ?? { items: 0, cards: 0 };
      current.items += 1;
      current.cards += quantity;
      itemCounts.set(submissionId, current);
    });

    return NextResponse.json({
      submissions: submissions.map((submission: ReturnType<typeof toSubmissionRecord>) => {
        const count = itemCounts.get(submission.id) ?? { items: 0, cards: 0 };
        return {
          ...submission,
          item_count: count.items,
          card_count: count.cards,
        };
      }),
    });
  } catch (error) {
    console.error("Grading submissions GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isTestMode()) {
      const now = new Date().toISOString();
      const body = await request.json().catch(() => ({}));
      return NextResponse.json({
        submission: {
          id: `test-submission-${Date.now()}`,
          user_id: "test-user",
          name: typeof body?.name === "string" ? body.name : "Test submission",
          mode: body?.mode === "actual" ? "actual" : "mock",
          grader: "psa",
          status: "draft",
          psa_order_id: null,
          service_level: null,
          declared_value_cents: 0,
          shipping_cents: 0,
          insurance_cents: 0,
          fees_estimate_cents: 0,
          fees_actual_cents: null,
          created_at: now,
          updated_at: now,
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
    const parsed = createSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;

    const { data, error } = await supabase
      .from("grading_submissions")
      .insert({
        user_id: user.id,
        name: payload.name,
        mode: payload.mode,
        grader: payload.grader,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Failed to create grading submission:", error);
      return NextResponse.json(
        { error: "Failed to create grading submission" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      submission: toSubmissionRecord(data as Record<string, unknown>),
    });
  } catch (error) {
    console.error("Grading submissions POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
