import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import { createSubmissionSchema } from "@/lib/grading/submissions/schemas";
import { toSubmissionRecord } from "@/lib/grading/submissions/db";
import { buildSubmissionListRows } from "@/lib/grading/submissions/list";
import {
  buildFeatureUnavailableMessage,
  isSubmissionAuthError,
  isSubmissionPermissionDenied,
  isSubmissionSchemaMissing,
  toSafeSupabaseErrorMeta,
} from "@/lib/grading/submissions/errors";

function paidUpgradeResponse() {
  return NextResponse.json(
    {
      error: "upgrade_required",
      message: "Submission Builder is a paid feature.",
    },
    { status: 403 }
  );
}

const SUBMISSION_COLUMNS =
  "id,user_id,name,mode,grader,status,psa_order_id,service_level,declared_value_cents,shipping_cents,insurance_cents,fees_estimate_cents,fees_actual_cents,created_at,updated_at";

function logSubmissionFetchMeta(
  event: string,
  payload: Record<string, unknown>
) {
  if (process.env.NODE_ENV !== "production") {
    console.info(event, payload);
  }
}

export async function GET() {
  try {
    if (isTestMode()) {
      return NextResponse.json({ submissions: [] });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    logSubmissionFetchMeta("grading_submissions.auth_state", {
      endpoint: "/api/grading-submissions",
      supabaseClient: "server_cookie_anon",
      hasUser: Boolean(user),
      authErrorCode:
        typeof (authError as { code?: unknown } | null)?.code === "string"
          ? (authError as { code: string }).code
          : null,
      authErrorMessage: authError?.message ?? null,
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "You're signed out or don't have permission. Please sign in again.",
          code: "unauthorized",
        },
        { status: 401 }
      );
    }

    const isPaidUser = await checkLegacyProAccess(user.id);
    if (!isPaidUser) {
      return paidUpgradeResponse();
    }

    const { data: submissionRows, error } = await supabase
      .from("grading_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const safeError = toSafeSupabaseErrorMeta(error);
      if (isSubmissionSchemaMissing(error)) {
        return NextResponse.json({
          submissions: [],
          feature_unavailable: true,
          message: buildFeatureUnavailableMessage(),
        });
      }

      if (isSubmissionPermissionDenied(error) || isSubmissionAuthError(error)) {
        console.error("grading_submissions.permission_failed", {
          endpoint: "/api/grading-submissions",
          supabaseClient: "server_cookie_anon",
          userId: user.id,
          query: {
            table: "grading_submissions",
            filter: { user_id: user.id },
            order: { column: "created_at", ascending: false },
          },
          ...safeError,
        });
        return NextResponse.json(
          {
            error: "You're signed out or don't have permission. Please sign in again.",
            code: "auth_or_permission_denied",
          },
          { status: 403 }
        );
      }

      console.error("grading_submissions.get_failed", {
        endpoint: "/api/grading-submissions",
        supabaseClient: "server_cookie_anon",
        userId: user.id,
        query: {
          table: "grading_submissions",
          filter: { user_id: user.id },
          order: { column: "created_at", ascending: false },
        },
        ...safeError,
      });
      return NextResponse.json(
        {
          error: "Failed to fetch grading submissions",
          code: safeError.code || "grading_submissions_fetch_failed",
        },
        { status: 500 }
      );
    }

    const { data: itemRows, error: itemError } = await supabase
      .from("grading_submission_items")
      .select("submission_id, quantity")
      .eq("user_id", user.id);

    if (itemError) {
      const safeItemError = toSafeSupabaseErrorMeta(itemError);
      console.error("grading_submissions.item_counts_failed", {
        endpoint: "/api/grading-submissions",
        userId: user.id,
        query: {
          table: "grading_submission_items",
          filter: { user_id: user.id },
          select: ["submission_id", "quantity"],
        },
        ...safeItemError,
      });
    }

    const submissions = buildSubmissionListRows(
      (submissionRows ?? []) as Array<Record<string, unknown>>,
      (itemRows ?? []) as Array<Record<string, unknown>>
    );

    return NextResponse.json({
      submissions,
    });
  } catch (error) {
    console.error("grading_submissions.get_exception", {
      endpoint: "/api/grading-submissions",
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "internal_server_error" },
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
      if (isSubmissionSchemaMissing(error)) {
        return NextResponse.json(
          {
            error: "feature_unavailable",
            message: buildFeatureUnavailableMessage(),
          },
          { status: 503 }
        );
      }
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
