import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GradeScanLabelGrader } from "@/types";

const ALLOWED_GRADERS: GradeScanLabelGrader[] = [
  "psa",
  "bgs",
  "sgc",
  "tag",
  "other",
];

function isFeatureEnabledByEnv(): boolean {
  const values = [
    process.env.NEXT_PUBLIC_ENABLE_GRADING_LABELS,
    process.env.ENABLE_GRADING_LABELS,
  ];
  return values.some((value) => value?.trim().toLowerCase() === "true");
}

function normalizeGrader(value: unknown): GradeScanLabelGrader | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (ALLOWED_GRADERS.includes(normalized as GradeScanLabelGrader)) {
    return normalized as GradeScanLabelGrader;
  }
  return null;
}

function normalizeLabelText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function deriveNumericGrade(
  grader: GradeScanLabelGrader,
  labelText: string,
  rawNumeric: unknown
): number | null {
  const explicit = normalizeNumeric(rawNumeric);
  if (explicit !== null) return explicit;

  const normalized = labelText.trim().toLowerCase();
  if (grader === "psa") {
    if (normalized === "10") return 10;
    if (normalized === "9") return 9;
    if (normalized === "8") return 8;
    if (normalized === "7_or_lower" || normalized === "7 or lower") return 7;
  }

  if (grader === "bgs") {
    if (normalized === "9.5") return 9.5;
    if (normalized === "9") return 9;
    if (normalized === "8.5") return 8.5;
    if (normalized === "8_or_lower" || normalized === "8 or lower") return 8;
  }

  return normalizeNumeric(normalized);
}

async function canAccessLabels(userId: string): Promise<boolean> {
  if (isFeatureEnabledByEnv()) return true;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("app_role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const code = String(error.code || "");
    const message = String(error.message || "").toLowerCase();
    if (code === "42703" || code === "PGRST204" || message.includes("app_role")) {
      return false;
    }
    return false;
  }

  return data?.app_role === "admin" || data?.app_role === "owner";
}

export async function GET(request: NextRequest) {
  try {
    const scanId = new URL(request.url).searchParams.get("scanId");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canAccessLabels(user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Grading labels are disabled" }, { status: 403 });
    }

    let query = supabase
      .from("grade_scan_labels")
      .select("id,scan_id,user_id,grader,label_text,label_grade_numeric,evidence_url,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (scanId) {
      query = query.eq("scan_id", scanId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("grade labels GET error", error);
      return NextResponse.json({ error: "Failed to load labels" }, { status: 500 });
    }

    return NextResponse.json({ labels: data ?? [] });
  } catch (error) {
    console.error("grade labels GET exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canAccessLabels(user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Grading labels are disabled" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const scanId = typeof body?.scanId === "string" ? body.scanId.trim() : "";
    const grader = normalizeGrader(body?.grader);
    const labelText = normalizeLabelText(body?.labelText);
    const evidenceUrl = normalizeEvidenceUrl(body?.evidenceUrl);

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    if (!grader) {
      return NextResponse.json({ error: "Valid grader is required" }, { status: 400 });
    }

    if (!labelText) {
      return NextResponse.json({ error: "labelText is required" }, { status: 400 });
    }

    const { data: ownedScan, error: scanError } = await supabase
      .from("grade_estimator_runs")
      .select("id")
      .eq("id", scanId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (scanError) {
      console.error("grade labels scan lookup error", scanError);
      return NextResponse.json({ error: "Failed to validate scan" }, { status: 500 });
    }

    if (!ownedScan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const numericGrade = deriveNumericGrade(grader, labelText, body?.labelGradeNumeric);

    const { data, error } = await supabase
      .from("grade_scan_labels")
      .upsert(
        {
          scan_id: scanId,
          user_id: user.id,
          grader,
          label_text: labelText,
          label_grade_numeric: numericGrade,
          evidence_url: evidenceUrl,
        },
        { onConflict: "scan_id,grader" }
      )
      .select("id,scan_id,user_id,grader,label_text,label_grade_numeric,evidence_url,created_at")
      .single();

    if (error) {
      console.error("grade labels upsert error", error);
      return NextResponse.json({ error: "Failed to save label" }, { status: 500 });
    }

    if (grader === "psa") {
      const { error: updateRunError } = await supabase
        .from("grade_estimator_runs")
        .update({ actual_grade_psa: labelText })
        .eq("id", scanId)
        .eq("user_id", user.id);

      if (updateRunError) {
        console.warn("Failed to mirror actual_grade_psa", updateRunError.message);
      }
    }

    return NextResponse.json({ label: data });
  } catch (error) {
    console.error("grade labels POST exception", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
